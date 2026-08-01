import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from '@database/index';
import { supabase } from '@services/supabase/client';
import { upgradeLegacyCardIdsForUser } from '@services/cards/legacyCardIdUpgrade';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';

export type SyncResult = {
  success: boolean;
  error?: unknown;
  message?: string;
  attemptCount?: number;
};

type InFlightSync = {
  userId: string;
  promise: Promise<SyncResult>;
};

let inFlightSync: InFlightSync | null = null;
const mutationVersionByUser = new Map<string, number>();
const syncedMutationVersionByUser = new Map<string, number>();
const lastSuccessfulSyncAtByUser = new Map<string, number>();
const PULL_PAGE_SIZE = 500;
const PUSH_BATCH_SIZE = 200;
const DEFAULT_FOREGROUND_MAX_AGE_MS = 2 * 60 * 1000;

export async function waitForSyncIdle(timeoutMs: number = 15000): Promise<void> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  while (inFlightSync) {
    const pending = inFlightSync.promise;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`Timed out waiting ${timeoutMs}ms for card sync to become idle`);
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const outcome = await Promise.race([
      pending.then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), remainingMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (outcome === 'timeout') {
      throw new Error(`Timed out waiting ${timeoutMs}ms for card sync to become idle`);
    }
    if (inFlightSync?.promise === pending) {
      return;
    }
  }
}

const RETRYABLE_ERROR_PATTERNS = [
  'network',
  'timeout',
  '429',
  '500',
  '502',
  '503',
  '504',
];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    const knownKeys = ['message', 'details', 'hint', 'code', 'error_description'];
    const parts: string[] = [];
    for (const key of knownKeys) {
      const value = e[key];
      if (typeof value === 'string' && value.trim()) {
        parts.push(`${key}: ${value}`);
      }
    }
    if (parts.length > 0) {
      return parts.join(' | ');
    }
    try {
      return JSON.stringify(e);
    } catch {
      // Ignore JSON stringify failure and fall through to String().
    }
  }
  return String(error || 'Unknown sync error');
}

export function getSyncErrorMessage(error: unknown): string {
  const raw = toErrorMessage(error);
  if (raw.toLowerCase().includes('not authenticated')) {
    return '同步需要先登入帳號';
  }
  if (raw.toLowerCase().includes('network')) {
    return '網路連線異常，請稍後再試';
  }
  return raw;
}

function isRetryableError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

async function getAuthenticatedUserId(): Promise<string> {
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    result = await supabase.auth.getUser();
  } catch (error) {
    throw new Error(`Auth validation failed: ${toErrorMessage(error)}`);
  }

  const {
    data: { user },
    error,
  } = result;
  if (error) throw error;
  if (!user?.id) throw new Error('User not authenticated');
  return user.id;
}

async function requireSessionUserId(): Promise<string> {
  const userId = await getCurrentSessionUserId();
  if (!userId) throw new Error('User not authenticated');
  return userId;
}

async function assertSessionUser(expectedUserId: string): Promise<void> {
  const currentUserId = await requireSessionUserId();
  if (currentUserId !== expectedUserId) {
    throw new Error('Session user changed during sync');
  }
}

export function markCardSyncDirty(userId: string): void {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  mutationVersionByUser.set(
    normalizedUserId,
    (mutationVersionByUser.get(normalizedUserId) ?? 0) + 1
  );
}

export function hasPendingCardSync(userId: string): boolean {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return false;
  return (
    (mutationVersionByUser.get(normalizedUserId) ?? 0) >
    (syncedMutationVersionByUser.get(normalizedUserId) ?? 0)
  );
}

async function getSyncServerTimestamp(): Promise<number> {
  const { data, error } = await supabase.rpc('sync_server_timestamp_ms');
  if (error) throw error;
  const timestamp = Number(data);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error('Supabase returned an invalid sync timestamp');
  }
  return timestamp;
}

function assertChangesBelongToUser(tableName: string, changes: any, userId: string): void {
  const records = [...(changes?.created || []), ...(changes?.updated || [])];
  for (const record of records) {
    const recordUserId = tableName === 'profiles'
      ? record.user_id || record.id
      : record.user_id;
    if (recordUserId !== userId) {
      throw new Error(
        `[Sync] Refusing to push ${tableName} record ${String(record.id)} for another user`
      );
    }
  }
}

function assertPulledRowsBelongToUser(
  tableName: string,
  records: any[],
  userId: string
): void {
  for (const record of records) {
    const recordUserId = tableName === 'profiles' ? record.id : record.user_id;
    if (recordUserId !== userId) {
      throw new Error(
        `[Sync] Refusing to pull ${tableName} record ${String(record.id)} owned by another user`
      );
    }
  }
}

/**
 * Main synchronization function
 * Syncs local WatermelonDB with Supabase
 */
export async function sync(): Promise<SyncResult> {
  let userId: string;
  try {
    userId = await requireSessionUserId();
  } catch (error) {
    return { success: false, error, message: toErrorMessage(error) };
  }

  if (inFlightSync) {
    if (inFlightSync.userId === userId) {
      return inFlightSync.promise;
    }

    // Never let a sync started for account A satisfy a request for account B.
    await inFlightSync.promise;
    return sync();
  }

  const syncPromise = (async () => {
  try {
    const verifiedUserId = await getAuthenticatedUserId();
    if (verifiedUserId !== userId) {
      throw new Error('Authenticated user changed before sync');
    }
    const capturedMutationVersion = mutationVersionByUser.get(userId) ?? 0;
    console.log('Starting sync for user:', userId);
    await upgradeLegacyCardIdsForUser(userId);
    await assertSessionUser(userId);

    await synchronize({
      database,
      pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
        await assertSessionUser(userId);
        // Capture the server clock before reading rows. Writes committed during
        // the paged read may be returned twice, but can never fall behind the
        // next cursor because of a fast or incorrectly configured device clock.
        const timestamp = await getSyncServerTimestamp();

        console.log('Pulling changes since:', new Date(lastPulledAt || 0));

        // Fetch changes from Supabase
        const changes = await pullChangesFromSupabase(
          userId,
          lastPulledAt || 0
        );

        return {
          changes,
          timestamp,
        };
      },

      pushChanges: async ({ changes, lastPulledAt }) => {
        await assertSessionUser(userId);
        const changeSet = changes as any;

        // Never log the raw WatermelonDB change set: it also contains the
        // local-only cached_items payload (clipboard text, OCR, local paths).
        console.log('Pushing syncable changes:', {
          profiles: {
            created: changeSet.profiles?.created?.length || 0,
            updated: changeSet.profiles?.updated?.length || 0,
            deleted: changeSet.profiles?.deleted?.length || 0,
          },
          cards: {
            created: changeSet.cards?.created?.length || 0,
            updated: changeSet.cards?.updated?.length || 0,
            deleted: changeSet.cards?.deleted?.length || 0,
          },
          reviewHistory: {
            created: changeSet.review_history?.created?.length || 0,
            updated: changeSet.review_history?.updated?.length || 0,
            deleted: changeSet.review_history?.deleted?.length || 0,
          },
        });

        // Push changes to Supabase
        await pushChangesToSupabase(userId, changes);
      },

      // Optional: handle migration conflicts
      migrationsEnabledAtVersion: 1,
      // Allow server "updated" rows to create locally when local row doesn't exist yet.
      sendCreatedAsUpdated: true,
    });

    await assertSessionUser(userId);
    syncedMutationVersionByUser.set(
      userId,
      Math.max(syncedMutationVersionByUser.get(userId) ?? 0, capturedMutationVersion)
    );
    lastSuccessfulSyncAtByUser.set(userId, Date.now());
    console.log('Sync completed successfully');
    return { success: true };
  } catch (error) {
    const message = toErrorMessage(error);
    console.warn('Sync error:', message);
    return { success: false, error, message };
  }
  })();

  inFlightSync = { userId, promise: syncPromise };
  const clearInFlight = () => {
    if (inFlightSync?.promise === syncPromise) {
      inFlightSync = null;
    }
  };
  void syncPromise.then(clearInFlight, clearInFlight);
  return syncPromise;
}

export async function syncWithRetry(
  maxAttempts: number = 2,
  options: { waitForCurrent?: boolean; onlyIfDirtyAfterCurrent?: boolean } = {}
): Promise<SyncResult> {
  let lastResult: SyncResult = { success: false, message: 'Sync not executed' };

  if (options.waitForCurrent && inFlightSync) {
    await inFlightSync.promise.catch(() => undefined);
  }
  if (options.onlyIfDirtyAfterCurrent) {
    const userId = await getCurrentSessionUserId();
    if (userId && !hasPendingCardSync(userId)) {
      return {
        success: true,
        attemptCount: 0,
        message: 'Skipped: pending mutation was included in the current sync',
      };
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await sync();
    if (result.success) {
      return { ...result, attemptCount: attempt };
    }

    lastResult = { ...result, attemptCount: attempt };
    if (!isRetryableError(result.error)) {
      break;
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  return lastResult;
}

export async function syncIfNeeded(options: {
  maxAgeMs?: number;
  maxAttempts?: number;
} = {}): Promise<SyncResult> {
  let userId: string;
  try {
    userId = await requireSessionUserId();
  } catch (error) {
    return { success: false, error, message: toErrorMessage(error) };
  }

  const maxAgeMs = options.maxAgeMs ?? DEFAULT_FOREGROUND_MAX_AGE_MS;
  const lastSuccessAt = lastSuccessfulSyncAtByUser.get(userId) ?? 0;
  if (!hasPendingCardSync(userId) && Date.now() - lastSuccessAt < maxAgeMs) {
    return {
      success: true,
      attemptCount: 0,
      message: 'Skipped: recent sync is still fresh',
    };
  }

  return syncWithRetry(options.maxAttempts ?? 2);
}

/**
 * Pull changes from Supabase since lastPulledAt timestamp
 */
async function pullChangesFromSupabase(
  userId: string,
  lastPulledAt: number
) {
  const lastPulledDate = new Date(lastPulledAt).toISOString();

  // Fetch profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .gte('updated_at', lastPulledDate);
  if (profilesError) throw profilesError;
  assertPulledRowsBelongToUser('profiles', profiles || [], userId);

  // Fetch cards
  const cards = await fetchPagedUserRows(
    'cards',
    userId,
    'updated_at',
    lastPulledDate
  );
  assertPulledRowsBelongToUser('cards', cards, userId);

  // Fetch review history
  const reviewHistory = await fetchPagedUserRows(
    'review_history',
    userId,
    'reviewed_at',
    lastPulledDate
  );
  assertPulledRowsBelongToUser('review_history', reviewHistory, userId);
  await assertSessionUser(userId);

  // Transform Supabase data to WatermelonDB format
  // NOTE:
  // Watermelon sync is configured with sendCreatedAsUpdated: true.
  // So server must return new/changed rows in `updated` only, and keep `created` empty.
  // Returning the same rows in both buckets causes duplicate insert attempts and diagnostics.
  return {
    profiles: {
      created: [],
      updated: transformProfiles(profiles || [], 'updated'),
      deleted: [], // Handle deletions separately if needed
    },
    cached_items: {
      created: [],
      updated: [],
      deleted: [],
    },
    cards: {
      created: [],
      updated: transformCards(cards),
      deleted: transformDeletedItems(cards),
    },
    review_history: {
      created: [],
      updated: transformReviewHistory(reviewHistory),
      deleted: [],
    },
  };
}

async function fetchPagedUserRows(
  tableName: 'cards' | 'review_history',
  userId: string,
  timestampColumn: 'updated_at' | 'reviewed_at',
  sinceIso: string
): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PULL_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('user_id', userId)
      .gte(timestampColumn, sinceIso)
      .order(timestampColumn, { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PULL_PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Push local changes to Supabase
 */
async function pushChangesToSupabase(_userId: string, changes: any) {
  // cached_items is intentionally absent. WatermelonDB may include local
  // cached_items changes in this callback, but this function must never send
  // them to Supabase.

  // Push profiles changes
  if (changes.profiles) {
    assertChangesBelongToUser('profiles', changes.profiles, _userId);
    await pushTableChanges('profiles', changes.profiles, _userId);
  }

  // Push cards changes
  if (changes.cards) {
    assertChangesBelongToUser('cards', changes.cards, _userId);
    await pushTableChanges('cards', changes.cards, _userId);
  }

  // Push review_history changes
  if (changes.review_history) {
    assertChangesBelongToUser('review_history', changes.review_history, _userId);
    await pushTableChanges('review_history', changes.review_history, _userId);
  }
}

/**
 * Push changes for a specific table
 */
function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

async function pushTableChanges(tableName: string, changes: any, userId: string) {
  // Handle created records
  if (changes.created && changes.created.length > 0) {
    const records = changes.created
      .filter((record: any) => {
        if (tableName === 'review_history' && !isUuid(record.card_id)) {
          console.warn(
            `[Sync] Skip create for review_history: non-UUID card_id ${String(
              record.card_id
            )}`
          );
          return false;
        }
        return true;
      })
      .map((record: any) => transformToSupabaseFormat(tableName, record, userId));

    for (let index = 0; index < records.length; index += PUSH_BATCH_SIZE) {
      const batch = records.slice(index, index + PUSH_BATCH_SIZE);
      // Every synced table has an id primary key. Upsert makes retries safe if
      // the server committed a previous request but the client lost its reply.
      const { error } = await supabase.from(tableName).upsert(batch, {
        onConflict: 'id',
        // Review history is immutable and intentionally has no UPDATE policy.
        // DO NOTHING is sufficient to acknowledge an already-committed retry.
        ignoreDuplicates: tableName === 'review_history',
      });
      if (error) throw new Error(`Error inserting ${tableName}: ${error.message}`);
    }
  }

  // Handle updated records
  if (changes.updated && changes.updated.length > 0) {
    const records = changes.updated
      .filter((record: any) => {
        if (isUuid(record.id)) return true;
        console.warn(`[Sync] Skip update for ${tableName}: non-UUID id ${String(record.id)}`);
        return false;
      })
      .map((record: any) => transformToSupabaseFormat(tableName, record, userId));

    for (let index = 0; index < records.length; index += PUSH_BATCH_SIZE) {
      const batch = records.slice(index, index + PUSH_BATCH_SIZE);
      const { error } = await supabase.from(tableName).upsert(batch, {
        onConflict: 'id',
        ignoreDuplicates: false,
      });
      if (error) throw new Error(`Error updating ${tableName}: ${error.message}`);
    }
  }

  // Handle deleted records (hard delete)
  if (changes.deleted && changes.deleted.length > 0) {
    const recordIds = changes.deleted.filter((recordId: unknown) => {
      if (!isUuid(recordId)) {
        console.warn(`[Sync] Skip delete for ${tableName}: non-UUID id ${String(recordId)}`);
        return false;
      }
      return true;
    });
    for (let index = 0; index < recordIds.length; index += PUSH_BATCH_SIZE) {
      const batch = recordIds.slice(index, index + PUSH_BATCH_SIZE);
      let query = supabase
        .from(tableName)
        .delete()
        .in('id', batch);
      if (tableName !== 'profiles') {
        query = query.eq('user_id', userId);
      }
      const { error } = await query;
      if (error) throw new Error(`Error deleting ${tableName}: ${error.message}`);
    }
  }
}

// ============================================
// TRANSFORM FUNCTIONS: Supabase → WatermelonDB
// ============================================

function transformProfiles(records: any[], type: string) {
  return records
    .filter((r) => (type === 'created' ? !r.updated_at : r.updated_at))
    .map((record) => ({
      id: record.id,
      user_id: record.id,
      email: record.email,
      display_name: record.display_name,
      learning_goal: record.learning_goal,
      target_language: record.target_language,
      native_language: record.native_language,
      ai_breakdown_mode: record.ai_breakdown_mode,
      subscription_tier: record.subscription_tier,
      subscription_expires_at: record.subscription_expires_at
        ? new Date(record.subscription_expires_at).getTime()
        : null,
      created_at: new Date(record.created_at).getTime(),
      updated_at: new Date(record.updated_at).getTime(),
    }));
}

function transformCards(records: any[]) {
  return records
    .filter((r) => !r.deleted_at)
    .map((record) => ({
      id: record.id,
      user_id: record.user_id,
      // A card may still carry a legacy remote cached_item_id. Never recreate
      // that cache relationship on this installation.
      cached_item_id: null,
      target_word: record.target_word,
      target_phrase: record.target_phrase,
      original_sentence: record.original_sentence,
      definition: record.definition,
      part_of_speech: record.part_of_speech,
      contextual_explanation: record.contextual_explanation,
      frequent_collocations: record.frequent_collocations,
      semantic_relations: JSON.stringify(record.semantic_relations),
      phonetic_transcription: record.phonetic_transcription,
      reference_audio_url: record.reference_audio_url,
      difficulty_level: record.difficulty_level,
      tags: JSON.stringify(record.tags),
      source_app: record.source_app,
      image_url: record.image_url,
      ease_factor: record.ease_factor,
      interval_days: record.interval_days,
      repetitions: record.repetitions,
      next_review_at: new Date(record.next_review_at).getTime(),
      last_reviewed_at: record.last_reviewed_at
        ? new Date(record.last_reviewed_at).getTime()
        : null,
      created_at: new Date(record.created_at).getTime(),
      updated_at: new Date(record.updated_at).getTime(),
      deleted_at: null,
    }));
}

function transformReviewHistory(records: any[]) {
  return records.map((record) => ({
    id: record.id,
    user_id: record.user_id,
    card_id: record.card_id,
    rating: record.rating,
    time_spent_seconds: record.time_spent_seconds,
    user_audio_url: record.user_audio_url,
    pronunciation_score: record.pronunciation_score,
    pronunciation_feedback: JSON.stringify(record.pronunciation_feedback),
    reviewed_at: new Date(record.reviewed_at).getTime(),
  }));
}

function transformDeletedItems(records: any[]) {
  return records.filter((r) => r.deleted_at).map((r) => r.id);
}

// ============================================
// TRANSFORM FUNCTIONS: WatermelonDB → Supabase
// ============================================

function transformToSupabaseFormat(tableName: string, record: any, userId: string) {
  const base: Record<string, unknown> = {
    updated_at: new Date(record.updated_at || Date.now()).toISOString(),
  };
  if (isUuid(record.id)) {
    base.id = record.id;
  }

  switch (tableName) {
    case 'profiles':
      return {
        ...base,
        id: userId,
        email: record.email,
        display_name: record.display_name,
        learning_goal: record.learning_goal,
        target_language: record.target_language,
        native_language: record.native_language,
        ai_breakdown_mode: record.ai_breakdown_mode,
      };

    case 'cards':
      return {
        ...base,
        user_id: userId,
        // Cache items are now local-only and never stored remotely.
        cached_item_id: null,
        target_word: record.target_word,
        target_phrase: record.target_phrase,
        original_sentence: record.original_sentence,
        definition: record.definition,
        part_of_speech: record.part_of_speech,
        contextual_explanation: record.contextual_explanation,
        frequent_collocations: record.frequent_collocations,
        semantic_relations: JSON.parse(record.semantic_relations || 'null'),
        phonetic_transcription: record.phonetic_transcription,
        reference_audio_url: record.reference_audio_url,
        difficulty_level: record.difficulty_level,
        tags: JSON.parse(record.tags || '[]'),
        source_app: record.source_app,
        image_url: record.image_url,
        ease_factor: record.ease_factor,
        interval_days: record.interval_days,
        repetitions: record.repetitions,
        next_review_at: new Date(record.next_review_at).toISOString(),
        last_reviewed_at: record.last_reviewed_at
          ? new Date(record.last_reviewed_at).toISOString()
          : null,
        deleted_at: record.deleted_at
          ? new Date(record.deleted_at).toISOString()
          : null,
      };

    case 'review_history':
      return {
        ...base,
        user_id: userId,
        card_id: isUuid(record.card_id) ? record.card_id : null,
        rating: record.rating,
        time_spent_seconds: record.time_spent_seconds,
        user_audio_url: record.user_audio_url,
        pronunciation_score: record.pronunciation_score,
        pronunciation_feedback: JSON.parse(
          record.pronunciation_feedback || 'null'
        ),
        reviewed_at: new Date(record.reviewed_at).toISOString(),
      };

    default:
      return base;
  }
}

/**
 * Developer/maintenance helper for a full cloud-card pull.
 *
 * This resets only WatermelonDB's cloud sync cursors. It is not connected to
 * any user-facing button and cached_items remains local-only and excluded.
 */
export async function forceFullSync() {
  await waitForSyncIdle();
  await Promise.all([
    database.adapter.removeLocal('__watermelon_last_pulled_at'),
    database.adapter.removeLocal('__watermelon_last_pulled_schema_version'),
  ]);
  return syncWithRetry(2);
}

/**
 * Check if sync is needed based on last sync time
 */
export async function shouldSync(maxAgeMinutes: number = 30): Promise<boolean> {
  try {
    const userId = await requireSessionUserId();
    if (hasPendingCardSync(userId)) return true;
    const lastSuccessAt = lastSuccessfulSyncAtByUser.get(userId) ?? 0;
    return Date.now() - lastSuccessAt >= Math.max(0, maxAgeMinutes) * 60 * 1000;
  } catch (error) {
    console.error('Error checking sync status:', error);
    return false;
  }
}
