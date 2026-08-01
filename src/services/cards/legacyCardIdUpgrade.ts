import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type ReviewHistory from '@database/models/ReviewHistory';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { supabase } from '@services/supabase/client';

const UPGRADE_MARKER_PREFIX = 'nuances_legacy_card_id_upgrade_v1';
const PAGE_SIZE = 1000;
const CARD_REFERENCE_KEY_PREFIXES = [
  'card_detail_sticky_notes_v1',
  'card_pronunciation_history_v1',
  'local_card_image_map_v1',
  'nuances_card_image_upload_queue_v1',
  'deck_album_preferences_v1',
  'deck_review_prefs_v1',
  'deck_card_detail_seen_v1',
  'deck_quiz_reviewed_v1',
] as const;

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function cardFingerprint(record: any): string {
  return JSON.stringify([
    normalizeText(record.targetWord ?? record.target_word),
    normalizeText(record.targetPhrase ?? record.target_phrase),
    normalizeText(record.originalSentence ?? record.original_sentence),
    normalizeText(record.definition),
    normalizeText(record.partOfSpeech ?? record.part_of_speech),
    normalizeText(record.contextualExplanation ?? record.contextual_explanation),
    normalizeText(record.frequentCollocations ?? record.frequent_collocations),
    normalizeText(record.phoneticTranscription ?? record.phonetic_transcription),
    normalizeText(record.sourceApp ?? record.source_app),
  ]);
}

function cardIdentityFingerprint(record: any): string {
  return JSON.stringify([
    normalizeText(record.targetWord ?? record.target_word),
    normalizeText(record.targetPhrase ?? record.target_phrase),
    normalizeText(record.originalSentence ?? record.original_sentence),
    normalizeText(record.sourceApp ?? record.source_app),
  ]);
}

async function assertActiveAccount(expectedUserId: string): Promise<void> {
  const currentUserId = await getCurrentSessionUserId();
  if (currentUserId !== expectedUserId) {
    throw new Error('Account changed during legacy card upgrade');
  }
}

async function fetchRemoteCards(userId: string): Promise<any[]> {
  const records: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    await assertActiveAccount(userId);
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    for (const record of page) {
      if (record.user_id !== userId) {
        throw new Error('Remote card owner mismatch during legacy upgrade');
      }
      records.push(record);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return records;
}

function copyCardFields(target: Card, source: Card): void {
  target.userId = source.userId;
  target.cachedItemId = source.cachedItemId;
  target.targetWord = source.targetWord;
  target.targetPhrase = source.targetPhrase;
  target.originalSentence = source.originalSentence;
  target.definition = source.definition;
  target.partOfSpeech = source.partOfSpeech;
  target.contextualExplanation = source.contextualExplanation;
  target.frequentCollocations = source.frequentCollocations;
  target.semanticRelations = source.semanticRelations;
  target.phoneticTranscription = source.phoneticTranscription;
  target.referenceAudioUrl = source.referenceAudioUrl;
  target.difficultyLevel = source.difficultyLevel;
  target.tags = source.tags;
  target.sourceApp = source.sourceApp;
  target.imageUrl = source.imageUrl;
  target.easeFactor = source.easeFactor;
  target.intervalDays = source.intervalDays;
  target.repetitions = source.repetitions;
  target.nextReviewAt = source.nextReviewAt;
  target.lastReviewedAt = source.lastReviewedAt;
  target.deletedAt = source.deletedAt;
}

function remapJsonValue(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === 'string') {
    return idMap.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapJsonValue(item, idMap));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => Number(idMap.has(left)) - Number(idMap.has(right))
    );
    for (const [key, child] of entries) {
      const nextKey = idMap.get(key) ?? key;
      if (!(nextKey in output)) {
        output[nextKey] = remapJsonValue(child, idMap);
      }
    }
    return output;
  }
  return value;
}

async function remapStoredCardReferences(
  userId: string,
  idMap: Map<string, string>
): Promise<void> {
  const keys = CARD_REFERENCE_KEY_PREFIXES.map((prefix) => `${prefix}:${userId}`);
  const entries = await AsyncStorage.multiGet(keys);
  const writes: Array<[string, string]> = [];

  for (const [key, raw] of entries) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      writes.push([key, JSON.stringify(remapJsonValue(parsed, idMap))]);
    } catch {
      // Preserve malformed legacy data instead of deleting it.
    }
  }

  if (writes.length > 0) {
    await AsyncStorage.multiSet(writes);
  }
}

/**
 * Upgrades pre-UUID Watermelon card IDs before synchronization. Remote matches
 * are reused when unambiguous; otherwise a fresh UUID is assigned so a card can
 * be safely upserted without server-generated identity drift.
 */
export async function upgradeLegacyCardIdsForUser(userId: string): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;

  const markerKey = `${UPGRADE_MARKER_PREFIX}:${normalizedUserId}`;
  await assertActiveAccount(normalizedUserId);
  const cards = await database
    .get<Card>('cards')
    .query(Q.where('user_id', normalizedUserId))
    .fetch();
  const legacyCards = cards.filter((card) => !isUuid(card.id));

  if (legacyCards.length === 0) {
    await AsyncStorage.setItem(markerKey, new Date().toISOString());
    return;
  }

  const remoteCards = await fetchRemoteCards(normalizedUserId);
  await assertActiveAccount(normalizedUserId);

  const remoteByFingerprint = new Map<string, any[]>();
  const remoteByIdentity = new Map<string, any[]>();
  remoteCards.forEach((record) => {
    const fingerprint = cardFingerprint(record);
    const bucket = remoteByFingerprint.get(fingerprint) || [];
    bucket.push(record);
    remoteByFingerprint.set(fingerprint, bucket);

    const identity = cardIdentityFingerprint(record);
    const identityBucket = remoteByIdentity.get(identity) || [];
    identityBucket.push(record);
    remoteByIdentity.set(identity, identityBucket);
  });

  const localUuidCards = new Map(
    cards.filter((card) => isUuid(card.id)).map((card) => [card.id, card])
  );
  const claimedRemoteIds = new Set<string>();
  const idMap = new Map<string, string>();

  legacyCards.forEach((card) => {
    const strictCandidates = remoteByFingerprint.get(cardFingerprint(card)) || [];
    const fallbackCandidates = remoteByIdentity.get(cardIdentityFingerprint(card)) || [];
    const candidates = (strictCandidates.length > 0 ? strictCandidates : fallbackCandidates)
      .filter((record) => isUuid(record.id) && !claimedRemoteIds.has(record.id));
    const existingLocalCandidate = candidates.find((record) => localUuidCards.has(record.id));
    const localUpdatedAt = card.updatedAt.getTime();
    const closestRemoteCandidate = [...candidates].sort((a, b) => {
      const aTime = new Date(a.updated_at || 0).getTime();
      const bTime = new Date(b.updated_at || 0).getTime();
      return Math.abs(aTime - localUpdatedAt) - Math.abs(bTime - localUpdatedAt);
    })[0];
    const selected = existingLocalCandidate || closestRemoteCandidate || null;
    const nextId = selected?.id || Crypto.randomUUID();
    if (selected?.id) claimedRemoteIds.add(selected.id);
    idMap.set(card.id, nextId);
  });

  const reviewRows = await database
    .get<ReviewHistory>('review_history')
    .query(Q.where('user_id', normalizedUserId))
    .fetch();
  const cardsCollection = database.get<Card>('cards');
  await database.write(async () => {
    const prepared: any[] = [];

    for (const legacyCard of legacyCards) {
      const nextId = idMap.get(legacyCard.id)!;
      const existing = localUuidCards.get(nextId);
      if (existing) {
        if (legacyCard.updatedAt.getTime() >= existing.updatedAt.getTime()) {
          prepared.push(existing.prepareUpdate((target) => copyCardFields(target, legacyCard)));
        }
      } else {
        const replacement = cardsCollection.prepareCreate((target) => {
          target._raw.id = nextId;
          copyCardFields(target, legacyCard);
          (target._raw as any).created_at = legacyCard.createdAt.getTime();
          (target._raw as any).updated_at = legacyCard.updatedAt.getTime();
        });
        prepared.push(replacement);
        localUuidCards.set(nextId, replacement);
      }

      reviewRows
        .filter((review) => review.cardId === legacyCard.id)
        .forEach((review) => {
          prepared.push(
            review.prepareUpdate((row) => {
              row.cardId = nextId;
            })
          );
        });
      prepared.push(legacyCard.prepareDestroyPermanently());
    }

    if (prepared.length > 0) {
      await database.batch(...prepared);
    }
  });
  await remapStoredCardReferences(normalizedUserId, idMap);
  await AsyncStorage.setItem(markerKey, new Date().toISOString());

  console.log('[LegacyCardUpgrade] upgraded local card IDs:', {
    userId: normalizedUserId,
    cardCount: legacyCards.length,
    reusedRemoteIds: Array.from(idMap.values()).filter((id) =>
      remoteCards.some((record) => record.id === id)
    ).length,
  });
}
