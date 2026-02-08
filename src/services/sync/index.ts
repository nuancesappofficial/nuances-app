import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from '@database/index';
import { supabase } from '@services/supabase/client';

// Sync configuration
const SYNC_BATCH_SIZE = 100;
const SYNC_TIMEOUT = 30000; // 30 seconds

/**
 * Main synchronization function
 * Syncs local WatermelonDB with Supabase
 */
export async function sync() {
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
    });

    console.log('Sync completed successfully');
    return { success: true };
  } catch (error) {
    console.error('Sync error:', error);
    return { success: false, error };
  }
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
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .gte('updated_at', lastPulledDate);

  // Fetch cached items
  const { data: cachedItems } = await supabase
    .from('cached_items')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', lastPulledDate);

  // Fetch cards
  const { data: cards } = await supabase
    .from('cards')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', lastPulledDate);

  // Fetch review history
  const { data: reviewHistory } = await supabase
    .from('review_history')
    .select('*')
    .eq('user_id', userId)
    .gte('reviewed_at', lastPulledDate);

  // Transform Supabase data to WatermelonDB format
  return {
    profiles: {
      created: transformProfiles(profiles || [], 'created'),
      updated: transformProfiles(profiles || [], 'updated'),
      deleted: [], // Handle deletions separately if needed
    },
    cached_items: {
      created: transformCachedItems(cachedItems || [], 'created'),
      updated: transformCachedItems(cachedItems || [], 'updated'),
      deleted: transformDeletedItems(cachedItems || []),
    },
    cards: {
      created: transformCards(cards || [], 'created'),
      updated: transformCards(cards || [], 'updated'),
      deleted: transformDeletedItems(cards || []),
    },
    review_history: {
      created: transformReviewHistory(reviewHistory || []),
      updated: [],
      deleted: [],
    },
  };
}

/**
 * Push local changes to Supabase
 */
async function pushChangesToSupabase(userId: string, changes: any) {
  // Push profiles changes
  if (changes.profiles) {
    await pushTableChanges('profiles', changes.profiles);
  }

  // Push cached_items changes
  if (changes.cached_items) {
    await pushTableChanges('cached_items', changes.cached_items);
  }

  // Push cards changes
  if (changes.cards) {
    await pushTableChanges('cards', changes.cards);
  }

  // Push review_history changes
  if (changes.review_history) {
    await pushTableChanges('review_history', changes.review_history);
  }
}

/**
 * Push changes for a specific table
 */
async function pushTableChanges(tableName: string, changes: any) {
  // Handle created records
  if (changes.created && changes.created.length > 0) {
    const records = changes.created.map((record: any) =>
      transformToSupabaseFormat(tableName, record)
    );
    const { error } = await supabase.from(tableName).insert(records);
    if (error) console.error(`Error inserting ${tableName}:`, error);
  }

  // Handle updated records
  if (changes.updated && changes.updated.length > 0) {
    for (const record of changes.updated) {
      const data = transformToSupabaseFormat(tableName, record);
      const { error } = await supabase
        .from(tableName)
        .update(data)
        .eq('id', record.id);
      if (error) console.error(`Error updating ${tableName}:`, error);
    }
  }

  // Handle deleted records (soft delete)
  if (changes.deleted && changes.deleted.length > 0) {
    for (const recordId of changes.deleted) {
      const { error } = await supabase
        .from(tableName)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', recordId);
      if (error) console.error(`Error deleting ${tableName}:`, error);
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

function transformCachedItems(records: any[], type: string) {
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

function transformCards(records: any[], type: string) {
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
      contextual_explanation: record.contextual_explanation,
      phonetic_transcription: record.phonetic_transcription,
      reference_audio_url: record.reference_audio_url,
      difficulty_level: record.difficulty_level,
      tags: JSON.stringify(record.tags),
      source_app: record.source_app,
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

function transformToSupabaseFormat(tableName: string, record: any) {
  const base = {
    id: record.id,
    updated_at: new Date(record.updated_at || Date.now()).toISOString(),
  };

  switch (tableName) {
    case 'profiles':
      return {
        ...base,
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
        user_id: record.user_id,
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
        user_id: record.user_id,
        cached_item_id: record.cached_item_id,
        target_word: record.target_word,
        target_phrase: record.target_phrase,
        original_sentence: record.original_sentence,
        definition: record.definition,
        contextual_explanation: record.contextual_explanation,
        phonetic_transcription: record.phonetic_transcription,
        reference_audio_url: record.reference_audio_url,
        difficulty_level: record.difficulty_level,
        tags: JSON.parse(record.tags || '[]'),
        source_app: record.source_app,
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
        user_id: record.user_id,
        card_id: record.card_id,
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
  return sync();
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
