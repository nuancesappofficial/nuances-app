import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from '@database/index';
import { supabase } from '@services/supabase/client';

export type SyncResult = {
  success: boolean;
  error?: unknown;
  message?: string;
  attemptCount?: number;
};

let inFlightSync: Promise<SyncResult> | null = null;

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

/**
 * Main synchronization function
 * Syncs local WatermelonDB with Supabase
 */
export async function sync(): Promise<SyncResult> {
  if (inFlightSync) {
    return inFlightSync;
  }

  inFlightSync = (async () => {
  try {
    console.log('Starting sync...');

    await synchronize({
      database,
      pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated');
        }

        console.log('Pulling changes since:', new Date(lastPulledAt || 0));

        // Fetch changes from Supabase
        const changes = await pullChangesFromSupabase(
          user.id,
          lastPulledAt || 0
        );

        return {
          changes,
          timestamp: Date.now(),
        };
      },

      pushChanges: async ({ changes, lastPulledAt }) => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated');
        }

        console.log('Pushing changes:', changes);

        // Push changes to Supabase
        await pushChangesToSupabase(user.id, changes);
      },

      // Optional: handle migration conflicts
      migrationsEnabledAtVersion: 1,
      // Allow server "updated" rows to create locally when local row doesn't exist yet.
      sendCreatedAsUpdated: true,
    });

    console.log('Sync completed successfully');
    return { success: true };
  } catch (error) {
    const message = toErrorMessage(error);
    console.error('Sync error:', message);
    return { success: false, error, message };
  } finally {
    inFlightSync = null;
  }
  })();

  return inFlightSync;
}

export async function syncWithRetry(maxAttempts: number = 2): Promise<SyncResult> {
  let lastResult: SyncResult = { success: false, message: 'Sync not executed' };

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

  // Fetch cached items
  const { data: cachedItems, error: cachedItemsError } = await supabase
    .from('cached_items')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', lastPulledDate);
  if (cachedItemsError) throw cachedItemsError;

  // Fetch cards
  const { data: cards, error: cardsError } = await supabase
    .from('cards')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', lastPulledDate);
  if (cardsError) throw cardsError;

  // Fetch review history
  const { data: reviewHistory, error: reviewHistoryError } = await supabase
    .from('review_history')
    .select('*')
    .eq('user_id', userId)
    .gte('reviewed_at', lastPulledDate);
  if (reviewHistoryError) throw reviewHistoryError;

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
      updated: transformCachedItems(cachedItems || []),
      deleted: transformDeletedItems(cachedItems || []),
    },
    cards: {
      created: [],
      updated: transformCards(cards || []),
      deleted: transformDeletedItems(cards || []),
    },
    review_history: {
      created: [],
      updated: transformReviewHistory(reviewHistory || []),
      deleted: [],
    },
  };
}

/**
 * Push local changes to Supabase
 */
async function pushChangesToSupabase(_userId: string, changes: any) {
  // Push profiles changes
  if (changes.profiles) {
    await pushTableChanges('profiles', changes.profiles, _userId);
  }

  // Push cached_items changes
  if (changes.cached_items) {
    await pushTableChanges('cached_items', changes.cached_items, _userId);
  }

  // Push cards changes
  if (changes.cards) {
    await pushTableChanges('cards', changes.cards, _userId);
  }

  // Push review_history changes
  if (changes.review_history) {
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

    if (records.length === 0) {
      return;
    }
    const response =
      tableName === 'profiles'
        ? await supabase.from(tableName).upsert(records, {
            onConflict: 'id',
            ignoreDuplicates: false,
          })
        : await supabase.from(tableName).insert(records);
    const { error } = response;
    if (error) throw new Error(`Error inserting ${tableName}: ${error.message}`);
  }

  // Handle updated records
  if (changes.updated && changes.updated.length > 0) {
    for (const record of changes.updated) {
      if (!isUuid(record.id)) {
        console.warn(`[Sync] Skip update for ${tableName}: non-UUID id ${String(record.id)}`);
        continue;
      }
      const data = transformToSupabaseFormat(tableName, record, userId);
      const { error } = await supabase
        .from(tableName)
        .update(data)
        .eq('id', record.id);
      if (error) throw new Error(`Error updating ${tableName}: ${error.message}`);
    }
  }

  // Handle deleted records (hard delete)
  if (changes.deleted && changes.deleted.length > 0) {
    for (const recordId of changes.deleted) {
      if (!isUuid(recordId)) {
        console.warn(`[Sync] Skip delete for ${tableName}: non-UUID id ${String(recordId)}`);
        continue;
      }
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', recordId);
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
      subscription_tier: record.subscription_tier,
      subscription_expires_at: record.subscription_expires_at
        ? new Date(record.subscription_expires_at).getTime()
        : null,
      created_at: new Date(record.created_at).getTime(),
      updated_at: new Date(record.updated_at).getTime(),
    }));
}

function transformCachedItems(records: any[]) {
  return records
    .filter((r) => !r.deleted_at)
    .map((record) => ({
      id: record.id,
      user_id: record.user_id,
      content_type: record.content_type,
      content_text: record.content_text,
      content_url: record.content_url,
      source_app: record.source_app,
      user_keywords: record.user_keywords,
      image_annotations: JSON.stringify(record.image_annotations),
      ai_highlighted_terms: JSON.stringify(record.ai_highlighted_terms),
      ai_analysis_completed: record.ai_analysis_completed,
      image_storage_path: record.image_storage_path,
      audio_storage_path: record.audio_storage_path,
      expires_at: record.expires_at
        ? new Date(record.expires_at).getTime()
        : null,
      converted_to_card: record.converted_to_card,
      created_at: new Date(record.created_at).getTime(),
      updated_at: new Date(record.updated_at).getTime(),
      deleted_at: null,
    }));
}

function transformCards(records: any[]) {
  return records
    .filter((r) => !r.deleted_at)
    .map((record) => ({
      id: record.id,
      user_id: record.user_id,
      cached_item_id: record.cached_item_id,
      target_word: record.target_word,
      target_phrase: record.target_phrase,
      original_sentence: record.original_sentence,
      definition: record.definition,
      part_of_speech: record.part_of_speech,
      contextual_explanation: record.contextual_explanation,
      frequent_collocations: record.frequent_collocations,
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
        subscription_tier: record.subscription_tier,
        subscription_expires_at: record.subscription_expires_at
          ? new Date(record.subscription_expires_at).toISOString()
          : null,
      };

    case 'cached_items':
      return {
        ...base,
        user_id: userId,
        content_type: record.content_type,
        content_text: record.content_text,
        content_url: record.content_url,
        source_app: record.source_app,
        user_keywords: record.user_keywords,
        image_annotations: JSON.parse(record.image_annotations || 'null'),
        ai_highlighted_terms: JSON.parse(record.ai_highlighted_terms || 'null'),
        ai_analysis_completed: record.ai_analysis_completed,
        image_storage_path: record.image_storage_path,
        audio_storage_path: record.audio_storage_path,
        expires_at: record.expires_at
          ? new Date(record.expires_at).toISOString()
          : null,
        converted_to_card: record.converted_to_card,
        deleted_at: record.deleted_at
          ? new Date(record.deleted_at).toISOString()
          : null,
      };

    case 'cards':
      return {
        ...base,
        user_id: userId,
        cached_item_id: isUuid(record.cached_item_id) ? record.cached_item_id : null,
        target_word: record.target_word,
        target_phrase: record.target_phrase,
        original_sentence: record.original_sentence,
        definition: record.definition,
        part_of_speech: record.part_of_speech,
        contextual_explanation: record.contextual_explanation,
        frequent_collocations: record.frequent_collocations,
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
 * Force a full sync (useful for testing or after major changes)
 */
export async function forceFullSync() {
  return syncWithRetry(2);
}

/**
 * Check if sync is needed based on last sync time
 */
export async function shouldSync(maxAgeMinutes: number = 30): Promise<boolean> {
  try {
    const lastSyncKey = 'last_sync_timestamp';
    // You would use AsyncStorage or similar to store this
    // For now, always return true for development
    return true;
  } catch (error) {
    console.error('Error checking sync status:', error);
    return true;
  }
}
