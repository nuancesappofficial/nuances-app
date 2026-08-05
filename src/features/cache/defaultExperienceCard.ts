import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { Asset } from 'expo-asset';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { getDefaultExperienceCardContentForLanguage } from '@services/ai/aiActionService';
import { queueSavedCardsForCloudPersistence } from '@services/cards/cardCloudPersistence';
import {
  DEFAULT_EXPERIENCE_CARD_SENTENCE,
  DEFAULT_EXPERIENCE_CARD_SOURCE,
  DEFAULT_EXPERIENCE_TARGET_WORD,
} from './defaultExperiencePronunciation';

export {
  DEFAULT_EXPERIENCE_CARD_SENTENCE,
  DEFAULT_EXPERIENCE_CARD_SOURCE,
  DEFAULT_EXPERIENCE_TARGET_WORD,
} from './defaultExperiencePronunciation';
export const DEFAULT_EXPERIENCE_QUIZ_HINT_EVENT = 'nuances:default-experience-quiz-hint';
export const DEFAULT_EXPERIENCE_TUTORIAL_COMPLETED_EVENT =
  'nuances:default-experience-tutorial-completed';

// The demo card image is a bundled static asset, so its pixel size is known at
// build time. Providing it directly lets the image cropper skip the slow
// Image.getSize() resolution of the asset URI (which flashes a spinner).
export const DEFAULT_EXPERIENCE_CARD_IMAGE_SIZE = {
  width: 1254,
  height: 1254,
} as const;

const DEFAULT_EXPERIENCE_CARD_VERSION = 'v3';
const DEFAULT_EXPERIENCE_CARD_IMAGE = require('../../../assets/tutorial/demo-card/smallest-nuances-with-text-v2.png');
const DEFAULT_EXPERIENCE_CARD_ANNOTATIONS = [{ text: DEFAULT_EXPERIENCE_CARD_SENTENCE }];
const LEGACY_DEFAULT_EXPERIENCE_CARD_SENTENCES = [
  'The smallest nuances can completely change how a message feels.',
];
const ensureRequests = new Map<string, Promise<string | null>>();

/**
 * Materialises the bundled demo-card image to a real local file. Loading a
 * bundled asset through its `file://` URI is noticeably slower than loading a
 * real file (it flashes a blank card / spinner in the cache stack, the cropper
 * and the create-card screen). `Asset.fromModule().downloadAsync()` downloads
 * the asset to a real local path (`localUri`) so every consumer loads it as
 * fast as a picked photo. Idempotent: the resolved URI is cached for the app
 * session.
 */
let persistedDemoCardImageUriPromise: Promise<string | null> | null = null;
function resolvePersistedDemoCardImageUri(): Promise<string | null> {
  if (!persistedDemoCardImageUriPromise) {
    persistedDemoCardImageUriPromise = (async () => {
      try {
        const asset = Asset.fromModule(DEFAULT_EXPERIENCE_CARD_IMAGE);
        if (!asset.localUri) await asset.downloadAsync();
        return asset.localUri || asset.uri || null;
      } catch (error) {
        console.warn('[DefaultExperienceCard] failed to materialise demo image', error);
        return Asset.fromModule(DEFAULT_EXPERIENCE_CARD_IMAGE).uri || null;
      }
    })();
  }
  return persistedDemoCardImageUriPromise;
}

function buildSeenKey(userId: string): string {
  return `nuances:default_experience_card:${DEFAULT_EXPERIENCE_CARD_VERSION}:${userId}`;
}

function buildQuizHintKey(userId: string): string {
  return `nuances:default_experience_quiz_hint:${DEFAULT_EXPERIENCE_CARD_VERSION}:${userId}`;
}

export function isEligibleDefaultExperienceGeneration(params: {
  isTutorial: boolean;
  targetWord: string;
  originalSentence: string;
}): boolean {
  const normalizedTarget = params.targetWord.trim().toLowerCase();
  const normalizedSentence = params.originalSentence
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .toLowerCase();
  const expectedSentence = DEFAULT_EXPERIENCE_CARD_SENTENCE
    .replace(/[.!?]+$/g, '')
    .toLowerCase();
  return (
    params.isTutorial &&
    normalizedTarget === DEFAULT_EXPERIENCE_TARGET_WORD &&
    normalizedSentence === expectedSentence
  );
}

export async function markDefaultExperienceQuizHintPending(userId: string): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  await AsyncStorage.setItem(buildQuizHintKey(normalizedUserId), 'true');
  DeviceEventEmitter.emit(DEFAULT_EXPERIENCE_QUIZ_HINT_EVENT, true);
}

export async function isDefaultExperienceQuizHintPending(userId: string): Promise<boolean> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return false;
  return (await AsyncStorage.getItem(buildQuizHintKey(normalizedUserId))) === 'true';
}

export async function completeDefaultExperienceQuizHint(userId: string): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  await AsyncStorage.removeItem(buildQuizHintKey(normalizedUserId));
  DeviceEventEmitter.emit(DEFAULT_EXPERIENCE_QUIZ_HINT_EVENT, false);
}

/**
 * Adds one real cache item for a genuinely empty account. Existing users are
 * marked as handled without changing their cache, so this never appears as
 * surprise content later when they happen to clear their stack.
 */
export async function ensureDefaultExperienceCard(userId: string): Promise<string | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  const inFlight = ensureRequests.get(normalizedUserId);
  if (inFlight) return inFlight;

  const request = (async () => {
    const seenKey = buildSeenKey(normalizedUserId);
    const cacheCollection = database.get<CachedItem>('cached_items');
    const cardCollection = database.get<Card>('cards');
    // Materialise the bundled demo image to a real local file so every consumer
    // (cache stack, cropper, create-card) loads it as fast as a picked photo.
    const imageUri = (await resolvePersistedDemoCardImageUri()) ?? undefined;
    const legacyDefaultCards = await cacheCollection
      .query(
        Q.where('user_id', normalizedUserId),
        Q.where('source_app', DEFAULT_EXPERIENCE_CARD_SOURCE),
        Q.where('content_text', Q.oneOf(LEGACY_DEFAULT_EXPERIENCE_CARD_SENTENCES))
      )
      .fetch();

    if (legacyDefaultCards.length > 0) {
      await database.write(async () => {
        await Promise.all(
          legacyDefaultCards.map((item) =>
            item.update((record) => {
              record.contentText = DEFAULT_EXPERIENCE_CARD_SENTENCE;
              record.type = 'image';
              record.contentType = 'image';
              record.userKeywords = DEFAULT_EXPERIENCE_TARGET_WORD;
              record.aiHighlightedTerms = [DEFAULT_EXPERIENCE_TARGET_WORD];
              record.mediaUri = imageUri;
              record.imageStoragePath = imageUri;
              record.imageAnnotations = DEFAULT_EXPERIENCE_CARD_ANNOTATIONS;
            })
          )
        );
      });
      await AsyncStorage.setItem(seenKey, 'true');
      return legacyDefaultCards[0].id;
    }

    const currentDefaultCards = await cacheCollection
      .query(
        Q.where('user_id', normalizedUserId),
        Q.where('source_app', DEFAULT_EXPERIENCE_CARD_SOURCE),
        Q.where('content_text', DEFAULT_EXPERIENCE_CARD_SENTENCE),
        Q.take(1)
      )
      .fetch();
    if (currentDefaultCards[0]) {
      if (
        imageUri &&
        (currentDefaultCards[0].mediaUri !== imageUri ||
          currentDefaultCards[0].imageStoragePath !== imageUri ||
          currentDefaultCards[0].imageAnnotations?.[0]?.text !== DEFAULT_EXPERIENCE_CARD_SENTENCE)
      ) {
        await database.write(async () => {
          await currentDefaultCards[0].update((record) => {
            record.type = 'image';
            record.contentType = 'image';
            record.mediaUri = imageUri;
            record.imageStoragePath = imageUri;
            record.imageAnnotations = DEFAULT_EXPERIENCE_CARD_ANNOTATIONS;
          });
        });
      }
      await AsyncStorage.setItem(seenKey, 'true');
      return currentDefaultCards[0].id;
    }

    if ((await AsyncStorage.getItem(seenKey)) === 'true') {
      console.log(
        `[FirstRunTrace] default_experience_card.ensure_result userId=${normalizedUserId} skipped=already_seen`
      );
      return null;
    }

    const [existingCacheCount, existingCardCount] = await Promise.all([
      cacheCollection
        .query(Q.where('user_id', normalizedUserId), Q.where('deleted_at', null))
        .fetchCount(),
      cardCollection
        .query(Q.where('user_id', normalizedUserId), Q.where('deleted_at', null))
        .fetchCount(),
    ]);

    if (existingCacheCount > 0 || existingCardCount > 0) {
      await AsyncStorage.setItem(seenKey, 'true');
      console.log(
        `[FirstRunTrace] default_experience_card.ensure_result userId=${normalizedUserId} skipped=not_empty cache=${existingCacheCount} cards=${existingCardCount}`
      );
      return null;
    }

    let createdItemId: string | null = null;
    await database.write(async () => {
      const duplicate = await cacheCollection
        .query(
          Q.where('user_id', normalizedUserId),
          Q.where('source_app', DEFAULT_EXPERIENCE_CARD_SOURCE),
          Q.where('content_text', DEFAULT_EXPERIENCE_CARD_SENTENCE),
          Q.take(1)
        )
        .fetch();

      if (duplicate[0]) {
        createdItemId = duplicate[0].id;
        return;
      }

      const created = await cacheCollection.create((item) => {
        item.userId = normalizedUserId;
        item.type = 'image';
        item.contentType = 'image';
        item.contentText = DEFAULT_EXPERIENCE_CARD_SENTENCE;
        item.mediaUri = imageUri;
        item.imageStoragePath = imageUri;
        item.imageAnnotations = DEFAULT_EXPERIENCE_CARD_ANNOTATIONS;
        item.sourceApp = DEFAULT_EXPERIENCE_CARD_SOURCE;
        item.userKeywords = DEFAULT_EXPERIENCE_TARGET_WORD;
        item.aiHighlightedTerms = [DEFAULT_EXPERIENCE_TARGET_WORD];
        item.aiAnalysisCompleted = false;
        item.convertedToCard = false;
      });
      createdItemId = created.id;
    });

    await AsyncStorage.setItem(seenKey, 'true');
    console.log(
      `[FirstRunTrace] default_experience_card.ensure_result userId=${normalizedUserId} created=true`
    );
    return createdItemId;
  })().finally(() => {
    ensureRequests.delete(normalizedUserId);
  });

  ensureRequests.set(normalizedUserId, request);
  return request;
}

export async function clearDefaultExperienceCardSeen(userId: string): Promise<void> {
  await AsyncStorage.removeItem(buildSeenKey(userId.trim()));
}

export function isDefaultExperienceCard(item: Pick<CachedItem, 'sourceApp' | 'contentText'>): boolean {
  return (
    item.sourceApp === DEFAULT_EXPERIENCE_CARD_SOURCE &&
    (item.contentText?.trim() === DEFAULT_EXPERIENCE_CARD_SENTENCE ||
      LEGACY_DEFAULT_EXPERIENCE_CARD_SENTENCES.includes(item.contentText?.trim() || ''))
  );
}

export async function localizeDefaultExperienceSavedCard(
  userId: string,
  replyLanguage: string
): Promise<number> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return 0;

  const cards = await database
    .get<Card>('cards')
    .query(
      Q.where('user_id', normalizedUserId),
      Q.where('target_word', DEFAULT_EXPERIENCE_TARGET_WORD),
      Q.where('original_sentence', DEFAULT_EXPERIENCE_CARD_SENTENCE),
      Q.where('deleted_at', null)
    )
    .fetch();
  if (cards.length === 0) return 0;

  const localized = await getDefaultExperienceCardContentForLanguage(replyLanguage);
  const cardsToUpdate = cards.filter(
    (card) =>
      card.definition !== localized.definition ||
      card.partOfSpeech !== localized.partOfSpeech ||
      card.contextualExplanation !== localized.contextualExplanation ||
      card.frequentCollocations !== localized.frequentCollocations ||
      card.semanticRelations !== localized.semanticRelations ||
      card.phoneticTranscription !== localized.phoneticTranscription
  );
  if (cardsToUpdate.length === 0) return 0;

  await database.write(async () => {
    await Promise.all(
      cardsToUpdate.map((card) =>
        card.update((record) => {
          record.definition = localized.definition;
          record.partOfSpeech = localized.partOfSpeech || undefined;
          record.contextualExplanation = localized.contextualExplanation || undefined;
          record.frequentCollocations =
            localized.frequentCollocations || undefined;
          record.semanticRelations = localized.semanticRelations || undefined;
          record.phoneticTranscription = localized.phoneticTranscription || undefined;
          record.tags = localized.tags;
        })
      )
    );
  });

  queueSavedCardsForCloudPersistence({
    userId: normalizedUserId,
    cardIds: cardsToUpdate.map((card) => card.id),
  });
  return cardsToUpdate.length;
}
