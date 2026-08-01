import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { supabase } from '@services/supabase/client';
import { markCardSyncDirty, syncWithRetry } from '@services/sync';

const QUEUE_KEY_PREFIX = 'nuances_card_image_upload_queue_v1';

type CardImageUploadJob = {
  cardId: string;
  userId: string;
  localUri: string;
  storagePath?: string;
  queuedAt: string;
};

const inFlightByUser = new Map<string, Promise<void>>();
const queueLocks = new Map<string, Promise<void>>();

function queueKey(userId: string): string {
  return `${QUEUE_KEY_PREFIX}:${userId}`;
}

async function assertActiveAccount(expectedUserId: string): Promise<void> {
  const currentUserId = await getCurrentSessionUserId();
  if (currentUserId !== expectedUserId) {
    throw new Error('Account changed during card image upload');
  }
}

async function loadQueue(userId: string): Promise<CardImageUploadJob[]> {
  try {
    const raw = await AsyncStorage.getItem(queueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (job): job is CardImageUploadJob =>
        job &&
        typeof job.cardId === 'string' &&
        job.userId === userId &&
        typeof job.localUri === 'string'
    );
  } catch {
    return [];
  }
}

async function saveQueue(userId: string, jobs: CardImageUploadJob[]): Promise<void> {
  if (jobs.length === 0) {
    await AsyncStorage.removeItem(queueKey(userId));
    return;
  }
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(jobs));
}

async function withQueueLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const previous = queueLocks.get(userId) || Promise.resolve();
  const result = previous.then(work, work);
  const lockTail = result.then(() => undefined, () => undefined);
  queueLocks.set(userId, lockTail);
  try {
    return await result;
  } finally {
    if (queueLocks.get(userId) === lockTail) {
      queueLocks.delete(userId);
    }
  }
}

async function uploadLocalImage(job: CardImageUploadJob): Promise<string> {
  await assertActiveAccount(job.userId);
  const normalized = await ImageManipulator.manipulateAsync(
    job.localUri,
    [],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
  );
  const base64 = await FileSystemLegacy.readAsStringAsync(normalized.uri, {
    encoding: 'base64',
  });
  if (!base64) throw new Error('Card image has no uploadable data');

  const imageBytes = await fetch(`data:image/jpeg;base64,${base64}`).then((response) =>
    response.arrayBuffer()
  );
  if (!imageBytes.byteLength) throw new Error('Card image upload payload is empty');

  await assertActiveAccount(job.userId);
  const storagePath = `${job.userId}/cards/${job.cardId}.jpg`;
  const { error } = await supabase.storage
    .from('cached-images')
    .upload(storagePath, imageBytes, {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (error) throw error;
  return storagePath;
}

async function prepareJobForBatchSync(
  job: CardImageUploadJob
): Promise<'complete' | 'needs-sync'> {
  await assertActiveAccount(job.userId);
  let card: Card;
  try {
    card = await database.get<Card>('cards').find(job.cardId);
  } catch {
    // The card was removed locally; its image no longer needs uploading.
    return 'complete';
  }
  if (card.userId !== job.userId) {
    throw new Error('Refusing to upload an image for another account');
  }
  if (card.deletedAt) return 'complete';

  const storagePath = job.storagePath || await uploadLocalImage(job);
  job.storagePath = storagePath;
  if (card.imageUrl !== storagePath) {
    await database.write(async () => {
      const current = await database.get<Card>('cards').find(job.cardId);
      if (current.userId !== job.userId) {
        throw new Error('Card owner changed before image persistence');
      }
      await current.update((record) => {
        record.imageUrl = storagePath;
      });
    });
  }
  return 'needs-sync';
}

export async function processPendingCardImageUploads(userId: string): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  const existing = inFlightByUser.get(normalizedUserId);
  if (existing) return existing;

  const work = (async () => {
    const jobs = await withQueueLock(normalizedUserId, () => loadQueue(normalizedUserId));
    const remaining: CardImageUploadJob[] = [];
    const jobsNeedingSync: CardImageUploadJob[] = [];
    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      try {
        const status = await prepareJobForBatchSync(job);
        if (status === 'needs-sync') jobsNeedingSync.push(job);
      } catch (error) {
        console.warn('[CardImageCloudQueue] upload remains pending:', error);
        remaining.push(job);
        if ((await getCurrentSessionUserId()) !== normalizedUserId) {
          remaining.push(...jobs.slice(index + 1));
          break;
        }
      }
    }

    if (jobsNeedingSync.length > 0) {
      markCardSyncDirty(normalizedUserId);
      const syncResult = await syncWithRetry(2, {
        waitForCurrent: true,
        onlyIfDirtyAfterCurrent: true,
      });
      if (!syncResult.success) {
        remaining.push(...jobsNeedingSync);
      } else {
        await assertActiveAccount(normalizedUserId);
        const { data, error } = await supabase
          .from('cards')
          .select('id, user_id, image_url')
          .eq('user_id', normalizedUserId)
          .in('id', jobsNeedingSync.map((job) => job.cardId));
        if (error) throw error;
        const remoteById = new Map((data || []).map((record) => [record.id, record]));
        jobsNeedingSync.forEach((job) => {
          const remote = remoteById.get(job.cardId);
          if (
            !remote ||
            remote.user_id !== normalizedUserId ||
            remote.image_url !== job.storagePath
          ) {
            remaining.push(job);
          }
        });
        if (remaining.some((job) => jobsNeedingSync.includes(job))) {
          markCardSyncDirty(normalizedUserId);
        }
      }
    }

    await withQueueLock(normalizedUserId, async () => {
      const latest = await loadQueue(normalizedUserId);
      const processedVersions = new Map(jobs.map((job) => [job.cardId, job.queuedAt]));
      const addedDuringProcessing = latest.filter(
        (job) => processedVersions.get(job.cardId) !== job.queuedAt
      );
      const merged = new Map(remaining.map((job) => [job.cardId, job]));
      addedDuringProcessing.forEach((job) => merged.set(job.cardId, job));
      await saveQueue(normalizedUserId, Array.from(merged.values()));
    });
  })();

  inFlightByUser.set(normalizedUserId, work);
  try {
    await work;
  } finally {
    if (inFlightByUser.get(normalizedUserId) === work) {
      inFlightByUser.delete(normalizedUserId);
    }
  }
}

export async function queueCardImageUploads(params: {
  userId: string;
  uploads: Array<{ cardId: string; localUri: string }>;
}): Promise<void> {
  const userId = params.userId.trim();
  if (!userId || params.uploads.length === 0) return;
  await assertActiveAccount(userId);

  await withQueueLock(userId, async () => {
    const existing = await loadQueue(userId);
    const byCardId = new Map(existing.map((job) => [job.cardId, job]));
    params.uploads.forEach(({ cardId, localUri }) => {
      if (!cardId.trim() || !localUri.trim()) return;
      byCardId.set(cardId, {
        cardId,
        userId,
        localUri,
        queuedAt: new Date().toISOString(),
      });
    });
    await saveQueue(userId, Array.from(byCardId.values()));
  });
  void processPendingCardImageUploads(userId);
}
