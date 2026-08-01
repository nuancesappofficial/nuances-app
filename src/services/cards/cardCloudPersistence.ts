import * as Crypto from 'expo-crypto';
import type Card from '@database/models/Card';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { supabase } from '@services/supabase/client';
import {
  markCardSyncDirty,
  syncWithRetry,
  type SyncResult,
} from '@services/sync';

export type CloudCardPersistenceResult = SyncResult & {
  confirmed: boolean;
  confirmedCardIds: string[];
};

type QueuedCardMutations = {
  savedCardIds: Set<string>;
  deletedCardIds: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
};

const CARD_MUTATION_DEBOUNCE_MS = 300;
const queuedMutationsByUser = new Map<string, QueuedCardMutations>();

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function assertActiveAccount(expectedUserId: string): Promise<void> {
  const currentUserId = await getCurrentSessionUserId();
  if (currentUserId !== expectedUserId) {
    throw new Error('Account changed while saving cards to cloud');
  }
}

/**
 * WatermelonDB normally creates short local IDs. Cloud-backed cards must use
 * UUIDs from birth so local and Supabase primary keys remain identical across
 * retries and devices.
 */
export function assignCloudCardId(card: Card): string {
  const cardId = Crypto.randomUUID();
  card._raw.id = cardId;
  return cardId;
}

/**
 * Pushes the durable WatermelonDB outbox, then verifies that every saved card
 * exists remotely under the same authenticated owner.
 */
export async function persistSavedCardsToCloud(params: {
  userId: string;
  cardIds: string[];
}): Promise<CloudCardPersistenceResult> {
  const userId = params.userId.trim();
  const cardIds = Array.from(new Set(params.cardIds.map((id) => id.trim()).filter(Boolean)));

  try {
    if (!userId || cardIds.length === 0) {
      throw new Error('Missing card owner or card IDs');
    }
    if (cardIds.some((id) => !isUuid(id))) {
      throw new Error('Cloud-backed card IDs must be UUIDs');
    }

    await assertActiveAccount(userId);
    markCardSyncDirty(userId);
    const syncResult = await syncWithRetry(3, {
      waitForCurrent: true,
      onlyIfDirtyAfterCurrent: true,
    });
    if (!syncResult.success) {
      return {
        ...syncResult,
        confirmed: false,
        confirmedCardIds: [],
      };
    }

    await assertActiveAccount(userId);
    const { data, error } = await supabase
      .from('cards')
      .select('id, user_id')
      .eq('user_id', userId)
      .in('id', cardIds);
    if (error) throw error;

    const confirmedCardIds = (data || [])
      .filter((record) => record.user_id === userId && cardIds.includes(record.id))
      .map((record) => record.id);
    const confirmed = confirmedCardIds.length === cardIds.length;
    if (!confirmed) markCardSyncDirty(userId);

    return {
      success: confirmed,
      confirmed,
      confirmedCardIds,
      attemptCount: syncResult.attemptCount,
      message: confirmed
        ? undefined
        : `Cloud verification missing ${cardIds.length - confirmedCardIds.length} card(s)`,
    };
  } catch (error) {
    return {
      success: false,
      confirmed: false,
      confirmedCardIds: [],
      error,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fire-and-forget entrypoint for UI flows. The local WatermelonDB transaction
 * is the durable handoff: if this run is interrupted or offline, the unchanged
 * sync status remains queued for startup/foreground retry.
 */
export function queueSavedCardsForCloudPersistence(params: {
  userId: string;
  cardIds: string[];
}): void {
  const userId = params.userId.trim();
  const cardIds = params.cardIds.map((id) => id.trim()).filter(isUuid);
  if (!userId || cardIds.length === 0) return;
  const batch = getOrCreateMutationBatch(userId);
  cardIds.forEach((cardId) => {
    batch.deletedCardIds.delete(cardId);
    batch.savedCardIds.add(cardId);
  });
  markCardSyncDirty(userId);
  scheduleMutationFlush(userId, batch);
}

export async function persistDeletedCardToCloud(params: {
  userId: string;
  cardId: string;
}): Promise<CloudCardPersistenceResult> {
  const userId = params.userId.trim();
  const cardId = params.cardId.trim();

  try {
    if (!userId || !isUuid(cardId)) {
      throw new Error('Missing card owner or valid card ID');
    }

    await assertActiveAccount(userId);
    markCardSyncDirty(userId);
    const syncResult = await syncWithRetry(3, {
      waitForCurrent: true,
      onlyIfDirtyAfterCurrent: true,
    });
    if (!syncResult.success) {
      return {
        ...syncResult,
        confirmed: false,
        confirmedCardIds: [],
      };
    }

    await assertActiveAccount(userId);
    const { data, error } = await supabase
      .from('cards')
      .select('id, user_id, deleted_at')
      .eq('id', cardId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;

    // A never-uploaded card may be absent; otherwise deletion is confirmed only
    // when the same owner's remote row carries the soft-delete timestamp.
    const confirmed = !data || (data.user_id === userId && Boolean(data.deleted_at));
    if (!confirmed) markCardSyncDirty(userId);
    return {
      success: confirmed,
      confirmed,
      confirmedCardIds: confirmed ? [cardId] : [],
      attemptCount: syncResult.attemptCount,
      message: confirmed ? undefined : 'Cloud deletion confirmation is still pending',
    };
  } catch (error) {
    return {
      success: false,
      confirmed: false,
      confirmedCardIds: [],
      error,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function queueDeletedCardForCloudPersistence(params: {
  userId: string;
  cardId: string;
}): void {
  const userId = params.userId.trim();
  const cardId = params.cardId.trim();
  if (!userId || !isUuid(cardId)) return;
  const batch = getOrCreateMutationBatch(userId);
  batch.savedCardIds.delete(cardId);
  batch.deletedCardIds.add(cardId);
  markCardSyncDirty(userId);
  scheduleMutationFlush(userId, batch);
}

function getOrCreateMutationBatch(userId: string): QueuedCardMutations {
  const existing = queuedMutationsByUser.get(userId);
  if (existing) return existing;
  const batch: QueuedCardMutations = {
    savedCardIds: new Set<string>(),
    deletedCardIds: new Set<string>(),
    timer: null,
  };
  queuedMutationsByUser.set(userId, batch);
  return batch;
}

function scheduleMutationFlush(userId: string, batch: QueuedCardMutations): void {
  if (batch.timer) clearTimeout(batch.timer);
  batch.timer = setTimeout(() => {
    if (queuedMutationsByUser.get(userId) === batch) {
      queuedMutationsByUser.delete(userId);
    }
    void flushMutationBatch(userId, batch).catch((error) => {
      console.warn('[CardCloudPersistence] mutation batch failed:', error);
    });
  }, CARD_MUTATION_DEBOUNCE_MS);
}

async function flushMutationBatch(
  userId: string,
  batch: QueuedCardMutations
): Promise<void> {
  const savedCardIds = Array.from(batch.savedCardIds);
  const deletedCardIds = Array.from(batch.deletedCardIds);
  const allCardIds = Array.from(new Set([...savedCardIds, ...deletedCardIds]));
  if (allCardIds.length === 0) return;

  await assertActiveAccount(userId);
  const syncResult = await syncWithRetry(3, {
    waitForCurrent: true,
    onlyIfDirtyAfterCurrent: true,
  });
  if (!syncResult.success) {
    console.warn(
      '[CardCloudPersistence] background mutation sync pending:',
      syncResult.message || syncResult.error
    );
    return;
  }

  await assertActiveAccount(userId);
  const { data, error } = await supabase
    .from('cards')
    .select('id, user_id, deleted_at')
    .eq('user_id', userId)
    .in('id', allCardIds);
  if (error) throw error;

  const remoteById = new Map((data || []).map((record) => [record.id, record]));
  const missingSaved = savedCardIds.filter((cardId) => {
    const record = remoteById.get(cardId);
    return !record || record.user_id !== userId || Boolean(record.deleted_at);
  });
  const missingDeleted = deletedCardIds.filter((cardId) => {
    const record = remoteById.get(cardId);
    return record && (record.user_id !== userId || !record.deleted_at);
  });
  if (missingSaved.length > 0 || missingDeleted.length > 0) {
    markCardSyncDirty(userId);
    console.warn('[CardCloudPersistence] cloud confirmation remains pending:', {
      missingSavedCount: missingSaved.length,
      missingDeletedCount: missingDeleted.length,
    });
  }
}
