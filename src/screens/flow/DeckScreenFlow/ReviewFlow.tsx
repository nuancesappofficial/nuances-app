import React from 'react';
import {
  Animated,
  ActivityIndicator,
  AppState,
  DeviceEventEmitter,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import {
  assessPronunciationCloud,
  detectPronunciationLocale,
  type CloudPhonemeFeedback,
} from '@services/pronunciation/cloudCoach';
import { isPremiumFeatureError } from '@services/ai/edgeAiClient';
import {
  formatIpaPhoneme,
  getIpaPhonemeAudioTarget,
  getIpaSymbol,
  loadStandardIpaPhonemes,
  speakIpaPhoneme,
} from '@services/pronunciation/ipaPhonemes';
import AnimatedGlowPressable from '../../../components/UI/shared/AnimatedGlowPressable';
import PronunciationPhonemeSectionUI from '../../../components/UI/DeckScreenUI/PronunciationPhonemeSectionUI';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { speakEnglishNaturally } from '@services/tts/localSpeech';
import {
  playDefaultExperiencePronunciation,
  stopDefaultExperiencePronunciation,
} from '@services/tts/defaultExperienceSpeech';
import { stopAzureTtsPlayback } from '@services/tts/cloudSpeech';
import { logDiagnosticEvent } from '@services/logging/diagnosticsLog';
import ReminderNotificationService from '@services/notifications/ReminderNotificationService';
import AppReviewService from '@services/reviews/AppReviewService';
import { analytics } from '@services/analytics';
import { traceFirstRun } from '../../../services/logging/firstRunTraceRuntime';
import SubscriptionService from '@services/subscription/SubscriptionService';
import {
  getInitialUserSettings,
  loadUserSettings,
  subscribeUserSettings,
  type UILanguage,
} from '@services/settings/userSettings';
import { parseCardContextSections } from '../../../features/cards/cardContextSections';
import {
  getLearningTermQuotePair,
  quoteLearningTermInText,
} from '../../../features/cards/learningTermQuotes';
import { isEnglishLearningCard } from '../../../features/cards/englishLearningPolicy';
import { resolveThemeColors } from '../../../theme/colors';
import { tUI } from '../../../i18n/uiLanguage';
import {
  formatPartOfSpeechLabel,
  normalizePartOfSpeechCategory,
  type CanonicalPartOfSpeech,
} from '../../../i18n/partOfSpeech';
import {
  DEFAULT_REVIEW_QUESTION_TYPES,
  loadAlbumReviewPreferences,
  type ReviewQuestionType,
  saveAlbumReviewPreferences,
} from '../../../features/deck/reviewPreferences';
import { markCardAsQuizReviewed } from '../../../features/deck/cardDetailSeen';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { shouldOpenReviewCompletionPaywall } from '../../../features/tour/firstRunJourney';
import {
  DEFAULT_EXPERIENCE_CARD_SENTENCE,
  DEFAULT_EXPERIENCE_TARGET_WORD,
  DEFAULT_EXPERIENCE_TUTORIAL_COMPLETED_EVENT,
  completeDefaultExperienceQuizHint,
} from '../../../features/cache/defaultExperienceCard';
import {
  resolvePronunciationAudioSource,
} from '../../../features/cache/defaultExperiencePronunciation';
import {
  disableScreenshotDemoMode,
  enableScreenshotDemoMode,
  hydrateScreenshotDemoMode,
  isScreenshotDemoModeEnabled,
} from '../../../features/dev/screenshotDemoMode';

type Props = {
  navigation: any;
  route: {
    params?: {
      albumId?: string;
      albumName?: string;
      cardIds?: string[];
      questionCount?: number;
      selectedQuestionTypes?: ReviewQuestionType[];
      themeColor?: string;
      isDefaultExperienceTutorial?: boolean;
      isScreenshotDemoQuiz?: boolean;
    };
  };
};

const LOCAL_CARD_QUERY_TIMEOUT_MS = 8000;

function withLocalCardQueryTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Local card query timed out')),
      LOCAL_CARD_QUERY_TIMEOUT_MS
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

type ReviewQuestion = {
  id: string;
  cardId: string;
  questionType: ReviewQuestionType;
  questionVariantIndex?: number;
  spellingRetryAttempt?: number;
  retryOfQuestionId?: string;
  prompt: string;
  correctAnswer: string;
  answerWord: string;
  answerTranslation: string;
  optionTranslations?: Record<string, string>;
  options: string[];
  sentence: string;
  sourceSentence: string;
  partOfSpeech: string;
  definition: string;
  contextualExplanation: string;
  fullSentence: string;
  sentenceTranslation: string;
  contextPreview: string;
};

type ReviewSlide =
  | { id: string; type: 'question'; question: ReviewQuestion }
  | { id: 'summary'; type: 'summary' };

const OPTION_FEEDBACK_DURATION_MS = 320;
const PRONUNCIATION_PASS_SCORE = 60;
const MIN_PRONUNCIATION_RECORDING_MS = 350;
const AUDIO_SESSION_ACTIVE_TIMEOUT_MS = 8000;
const AUDIO_SESSION_ACTIVE_SETTLE_MS = 180;
const REVIEW_SESSION_BUILD_TIMEOUT_MS = 8000;
const CLOZE_BLANK = '＿＿＿＿＿';
const DEFAULT_EXPERIENCE_IPA_PHONEMES = ['n', 'u', 'ɑ', 'n', 's', 'ɪ', 'z'];
const DEFAULT_EXPERIENCE_MOCK_PRONUNCIATION_SCORE = 92;
const DEFAULT_EXPERIENCE_MOCK_PHONEMES: CloudPhonemeFeedback[] = [
  { phoneme: 'n', letters: 'n', accuracy: 96, level: 'green' },
  { phoneme: 'u', letters: 'u', accuracy: 93, level: 'green' },
  { phoneme: 'ɑ', letters: 'a', accuracy: 86, level: 'green' },
  { phoneme: 'n', letters: 'n', accuracy: 94, level: 'green' },
  { phoneme: 's', letters: 'c', accuracy: 90, level: 'green' },
  { phoneme: 'ɪ', letters: 'e', accuracy: 88, level: 'green' },
  { phoneme: 'z', letters: 's', accuracy: 95, level: 'green' },
];
const TRANSLATION_QUESTION_VARIANTS: ReviewQuestionType[] = [
  'translation_to_word',
  'word_to_translation',
  'sentence_to_translation',
];

const REVIEW_PRONUNCIATION_RECORDING_OPTIONS = {
  android: Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
  ios: {
    extension: '.wav',
    audioQuality:
      (Audio as any).RECORDING_OPTION_IOS_AUDIO_QUALITY_MAX ??
      Audio.RecordingOptionsPresets.HIGH_QUALITY.ios.audioQuality,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: Audio.RecordingOptionsPresets.HIGH_QUALITY.web,
  isMeteringEnabled: true,
} as const;

async function waitForActiveAudioSession(): Promise<void> {
  if (AppState.currentState !== 'active') {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        subscription.remove();
        if (error) reject(error);
        else resolve();
      };
      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') finish();
      });
      const timeout = setTimeout(() => {
        finish(new Error('App did not return to the foreground in time'));
      }, AUDIO_SESSION_ACTIVE_TIMEOUT_MS);
    });
  }

  // The permission promise can resolve just before AVAudioSession becomes
  // activatable again. Give the native scene one short foreground frame.
  await new Promise<void>((resolve) => setTimeout(resolve, AUDIO_SESSION_ACTIVE_SETTLE_MS));
}

function triggerWrongAnswerBuzzHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  setTimeout(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, 90);
}

function triggerCorrectAnswerHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

function shuffleArray<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function isDisplayableAnswer(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === '-') return false;
  if (/^(?:https?:\/\/|www\.|file:\/\/|[a-z]+:\/\/)/i.test(trimmed)) return false;
  if (trimmed.startsWith('/')) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
}

function pickCardAnswer(card: Card, preferWord = false): string {
  const candidates = preferWord
    ? [card.targetWord, card.targetPhrase]
    : [card.targetPhrase, card.targetWord];
  const visibleAnswer = candidates
    .map((value) => (value || '').trim())
    .find(isDisplayableAnswer);
  if (visibleAnswer) return visibleAnswer;

  const fallback = [card.definition, card.originalSentence]
    .map((value) => (value || '').trim())
    .find(isDisplayableAnswer);
  return fallback || '-';
}

function pickDisplayAnswer(card: Card): string {
  return pickCardAnswer(card);
}

function pickDefinitionToWordAnswer(card: Card): string {
  return pickCardAnswer(card, true);
}

function isPhraseAnswer(value: string): boolean {
  return value.trim().split(/\s+/).filter(Boolean).length > 1;
}

function pickPronunciationSubject(card: Card): string {
  const phrase = (card.targetPhrase || '').trim();
  const word = (card.targetWord || '').trim();
  if (phrase && phrase.toLowerCase() !== word.toLowerCase()) return phrase;
  if (word) return word;
  if (phrase) return phrase;
  return pickDisplayAnswer(card);
}

function pickDefinitionText(card: Card): string {
  const definition = (card.definition || '').trim();
  if (definition) return definition;
  const contextual = (card.contextualExplanation || '').trim();
  if (contextual) return contextual;
  return (card.originalSentence || '').trim() || '-';
}

function pickAnswerQuickTranslation(card: Card): string {
  const definition = (card.definition || '').trim();
  if (!definition || definition === '-') return '-';
  const firstLine = definition
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return '-';
  return firstLine;
}

function normalizeOptionLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildOptionTranslationLookup(allCards: Card[], options: string[]): Record<string, string> {
  const cardTranslationByAnswer = new Map<string, string>();

  allCards.forEach((card) => {
    const translation = pickAnswerQuickTranslation(card);
    if (!translation || translation === '-') return;

    [pickDisplayAnswer(card), pickDefinitionToWordAnswer(card)]
      .map(normalizeOptionLookupKey)
      .filter(Boolean)
      .forEach((key) => {
        if (!cardTranslationByAnswer.has(key)) {
          cardTranslationByAnswer.set(key, translation);
        }
      });
  });

  return options.reduce<Record<string, string>>((lookup, option) => {
    const translation = cardTranslationByAnswer.get(normalizeOptionLookupKey(option));
    if (translation) {
      lookup[option] = translation;
    }
    return lookup;
  }, {});
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTargetCandidates(card: Card): string[] {
  const candidates = [card.targetPhrase, card.targetWord]
    .map((value) => (value || '').trim())
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

function splitCollocationCandidates(raw: string | null | undefined): string[] {
  return (raw || '')
    .split(/[\n;]+/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      const phraseOnly = trimmed.split(/\s+[—–-]\s+/)[0]?.trim() || trimmed;
      if (/[.!?。！？]$/.test(phraseOnly)) return [phraseOnly];
      return phraseOnly
        .split(/,(?=\s*[A-Z"“])/)
        .map((item) => item.trim())
        .filter(Boolean);
    })
    .filter(Boolean);
}

function splitExampleCandidates(raw: string | null | undefined): Array<{ sentence: string; translation?: string }> {
  return (raw || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sentenceRaw, ...translationParts] = line.split(/\s+[—–-]\s+/);
      const sentence = (sentenceRaw || line).trim();
      const translation = translationParts.join(' — ').trim();
      return translation ? { sentence, translation } : { sentence };
    })
    .filter((item) => Boolean(item.sentence));
}

function normalizeSentenceForComparison(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[「」『』“”"'‘’[\]]/g, '')
    .replace(/\s+/g, ' ');
}

function cleanQuizSentenceTranslation(raw: string | undefined, sourceSentence: string, target: string): string {
  const trimmedTarget = target.trim();
  const normalizedSource = normalizeSentenceForComparison(sourceSentence);

  return (raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalizedLine = normalizeSentenceForComparison(line);
      if (normalizedLine === normalizedSource) return false;
      if (line.includes(CLOZE_BLANK)) return false;
      if (/\[[^\]]+\]/.test(line)) return false;
      if (trimmedTarget && new RegExp(escapeRegex(trimmedTarget), 'i').test(line)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function looksLikeUsableSentence(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!trimmed) return false;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return /[.!?。！？]$/.test(trimmed) || wordCount >= 4;
}

function isQuizSafeSourceSentence(sentence: string, targets: string[]): boolean {
  const trimmed = sentence.trim();
  const matchedTarget = findTargetInSentence(trimmed, targets);
  if (!trimmed || !matchedTarget) return false;
  if (trimmed.length > 180) return false;

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount > 24) return false;
  if (!/[.!?。！？]$/.test(trimmed) && wordCount > 16) return false;
  if (/\s+[—–-]\s+/.test(trimmed)) return false;

  const targetUsesLatin = /[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(matchedTarget);
  const sentenceContainsCjk = /[\u3040-\u30ff\u3400-\u9fff]/u.test(trimmed);
  if (targetUsesLatin && sentenceContainsCjk) return false;

  return true;
}

function findTargetInSentence(sentence: string, targets: string[]): string | null {
  for (const target of targets) {
    if (!target) continue;
    const matcher = new RegExp(escapeRegex(target), 'i');
    if (matcher.test(sentence)) return target;
  }
  return null;
}

function sentenceWithTargetFallback(card: Card, target: string): string {
  const definition = (card.definition || '').trim();
  if (definition && definition !== '-') {
    return `The best fit here is ${target}.`;
  }
  return `The missing word is ${target}.`;
}

function pickFillBlankSentence(card: Card): { sentence: string; target: string } {
  const targets = getTargetCandidates(card);
  const primaryTarget = targets[0] || '';
  const contextSections = parseCardContextSections({
    raw: card.contextualExplanation,
    displayWord: primaryTarget,
    definition: card.definition,
    sourceSentence: card.originalSentence,
  });
  const candidates = [
    ...splitExampleCandidates(contextSections.exampleSentence).map((example) => example.sentence),
    ...splitCollocationCandidates(card.frequentCollocations),
    card.originalSentence,
  ]
    .map((value) => (value || '').trim())
    .filter((sentence) => isQuizSafeSourceSentence(sentence, targets));

  if (!primaryTarget) return { sentence: candidates.find(looksLikeUsableSentence) || candidates[0] || '', target: '' };

  const bestCandidate =
    candidates.find((sentence) => looksLikeUsableSentence(sentence) && findTargetInSentence(sentence, targets)) ||
    candidates.find((sentence) => findTargetInSentence(sentence, targets));

  if (bestCandidate) {
    return {
      sentence: bestCandidate,
      target: findTargetInSentence(bestCandidate, targets) || primaryTarget,
    };
  }

  return {
    sentence: sentenceWithTargetFallback(card, primaryTarget),
    target: primaryTarget,
  };
}

function getFillBlankExamples(card: Card): Array<{ sentence: string; translation?: string }> {
  const targets = getTargetCandidates(card);
  const primaryTarget = targets[0] || '';
  const contextSections = parseCardContextSections({
    raw: card.contextualExplanation,
    displayWord: primaryTarget,
    definition: card.definition,
    sourceSentence: card.originalSentence,
  });
  const parsedExamples = splitExampleCandidates(contextSections.exampleSentence).filter((example) =>
    looksLikeUsableSentence(example.sentence) &&
    isQuizSafeSourceSentence(example.sentence, targets) &&
    canBuildFillBlankFromSentence(example.sentence, targets)
  );
  return parsedExamples.map((example) => ({
    sentence: example.sentence,
    translation: cleanQuizSentenceTranslation(
      example.translation,
      example.sentence,
      findTargetInSentence(example.sentence, targets) || primaryTarget
    ),
  }));
}

function pickQuizContextExample(card: Card): { sentence: string; translation?: string } | null {
  const targets = getTargetCandidates(card);
  const primaryTarget = targets[0] || '';
  if (!primaryTarget) return null;

  const generatedExample = getFillBlankExamples(card).find((example) =>
    isQuizSafeSourceSentence(example.sentence, [primaryTarget]) &&
    Boolean(findTargetInSentence(example.sentence, [primaryTarget]))
  );
  if (generatedExample) return generatedExample;

  const sourceSentence = (card.originalSentence || '').trim();
  if (!isQuizSafeSourceSentence(sourceSentence, [primaryTarget])) return null;

  const contextSections = parseCardContextSections({
    raw: card.contextualExplanation,
    displayWord: primaryTarget,
    definition: card.definition,
    sourceSentence,
  });
  const matchedTarget = findTargetInSentence(sourceSentence, targets) || primaryTarget;
  const translation = cleanQuizSentenceTranslation(
    contextSections.sentenceTranslation,
    sourceSentence,
    matchedTarget
  );

  return translation ? { sentence: sourceSentence, translation } : { sentence: sourceSentence };
}

function pickPartOfSpeechExample(
  card: Card
): { sentence: string; translation?: string } | null {
  const targets = getTargetCandidates(card);
  return (
    getFillBlankExamples(card).find((example) =>
      Boolean(findTargetInSentence(example.sentence, targets))
    ) || null
  );
}

function buildSpellingRetryQuestion(
  question: ReviewQuestion,
  card: Card | undefined,
  uiLanguage: UILanguage
): ReviewQuestion {
  const retryAttempt = (question.spellingRetryAttempt ?? 0) + 1;
  const previousSentence = question.sourceSentence.trim().toLocaleLowerCase();
  const alternateExample = card
    ? getFillBlankExamples(card).find((example) => {
        const sentence = example.sentence.trim();
        if (!sentence || sentence.toLocaleLowerCase() === previousSentence) return false;
        return Boolean(findTargetInSentence(sentence, [question.correctAnswer]));
      })
    : undefined;

  const fallbackSentences = [
    `Practice makes ${question.correctAnswer} easier to remember.`,
    `Type ${question.correctAnswer} to finish this spelling check.`,
  ];
  const sourceSentence =
    alternateExample?.sentence.trim() ||
    fallbackSentences[(retryAttempt - 1) % fallbackSentences.length];
  const maskedSentence =
    maskTargetInSentence(sourceSentence, question.correctAnswer) ||
    sourceSentence.replace(question.correctAnswer, CLOZE_BLANK);
  const answerDetail = card
    ? buildAnswerDetailTextForSentence(
        card,
        sourceSentence,
        alternateExample?.translation,
        false
      )
    : {
        fullSentence: sourceSentence,
        sentenceTranslation: '',
        contextPreview: question.contextPreview,
      };

  return {
    ...question,
    id: `${question.cardId}:spelling:retry:${retryAttempt}:${question.id}`,
    questionVariantIndex: undefined,
    spellingRetryAttempt: retryAttempt,
    retryOfQuestionId: question.id,
    prompt: tUI(uiLanguage, 'review.prompt.spelling'),
    options: [],
    sentence: maskedSentence,
    sourceSentence,
    ...answerDetail,
  };
}

function pickRealFillBlankSentence(card: Card): { sentence: string; target: string } | null {
  const targets = getTargetCandidates(card);
  const primaryTarget = targets[0] || '';
  if (!primaryTarget) return null;

  const contextSections = parseCardContextSections({
    raw: card.contextualExplanation,
    displayWord: primaryTarget,
    definition: card.definition,
    sourceSentence: card.originalSentence,
  });
  const candidates = splitExampleCandidates(contextSections.exampleSentence)
    .map((example) => example.sentence.trim())
    .filter(Boolean);

  const bestCandidate = candidates.find(
    (sentence) =>
      looksLikeUsableSentence(sentence) &&
      isQuizSafeSourceSentence(sentence, targets) &&
      findTargetInSentence(sentence, targets)
  );
  if (!bestCandidate) return null;

  return {
    sentence: bestCandidate,
    target: findTargetInSentence(bestCandidate, targets) || primaryTarget,
  };
}

function buildMaskedSentence(card: Card): string {
  const realFillBlank = pickRealFillBlankSentence(card);
  if (!realFillBlank) return '';
  const { sentence: baseSentence, target } = realFillBlank;

  if (!baseSentence) {
    return '';
  }

  if (!target) {
    return '';
  }

  const matcher = new RegExp(escapeRegex(target), 'i');
  if (matcher.test(baseSentence)) {
    return baseSentence.replace(matcher, CLOZE_BLANK);
  }

  return '';
}

function hasUsableMaskedSentence(maskedSentence: string): boolean {
  const withoutBlank = maskedSentence.replace(new RegExp(CLOZE_BLANK, 'g'), '').trim();
  return maskedSentence.includes(CLOZE_BLANK) && /[\p{L}\p{N}]/u.test(withoutBlank);
}

function canBuildFillBlankFromSentence(sentence: string, targets: string[]): boolean {
  const target = findTargetInSentence(sentence, targets);
  if (!target) return false;
  return hasUsableMaskedSentence(maskTargetInSentence(sentence, target));
}

function canBuildQuestionTypeForCard(
  card: Card,
  questionType: ReviewQuestionType
): boolean {
  if (!isEnglishLearningCard(card)) return false;
  if (questionType === 'sentence_to_translation') {
    return Boolean(pickQuizContextExample(card));
  }
  if (questionType === 'fill_blank' || questionType === 'spelling') {
    return hasUsableMaskedSentence(buildMaskedSentence(card));
  }
  if (questionType === 'part_of_speech') {
    return Boolean(
      normalizePartOfSpeechCategory(card.partOfSpeech) &&
      pickPartOfSpeechExample(card)
    );
  }
  return true;
}

function resolveQuestionTypeForCard(
  card: Card,
  preferred: ReviewQuestionType,
  enabledTypes: ReviewQuestionType[]
): ReviewQuestionType | null {
  const candidates = [
    preferred,
    ...enabledTypes.filter((type) => type !== preferred),
  ];
  return (
    candidates.find((type) => canBuildQuestionTypeForCard(card, type)) || null
  );
}

function normalizeTypedAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ');
}

function isLongAnswerText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.length > 18 || trimmed.split(/\s+/).filter(Boolean).length > 2;
}

function containsNonLatinText(value: string): boolean {
  return Array.from(value).some((character) => character.codePointAt(0)! > 0x7f);
}

function isTranslationOptionQuestion(questionType: ReviewQuestionType): boolean {
  return questionType === 'word_to_translation' || questionType === 'sentence_to_translation';
}

function shouldStackReviewOptions(question: ReviewQuestion): boolean {
  if (isTranslationOptionQuestion(question.questionType)) return true;
  return question.options.some((option) => {
    const trimmed = option.trim();
    if (!trimmed) return false;
    return containsNonLatinText(trimmed) || trimmed.length > 13 || trimmed.split(/\s+/).filter(Boolean).length > 1;
  });
}

function hasVeryLongReviewOptions(question: ReviewQuestion): boolean {
  if (isTranslationOptionQuestion(question.questionType)) return true;
  return question.options.some((option) => {
    const trimmed = option.trim();
    if (!trimmed) return false;
    return containsNonLatinText(trimmed)
      ? trimmed.length > 12
      : trimmed.length > 18 || trimmed.split(/\s+/).filter(Boolean).length > 3;
  });
}

function quoteTargetInText(text: string, target: string): string {
  const trimmedText = (text || '').trim();
  const trimmedTarget = (target || '').trim();
  if (!trimmedText || !trimmedTarget) return trimmedText;

  const [openQuote, closeQuote] = getLearningTermQuotePair(trimmedTarget);
  const bracketMatcher = new RegExp(`\\[\\s*${escapeRegex(trimmedTarget)}\\s*\\]`, 'i');
  if (bracketMatcher.test(trimmedText)) {
    return trimmedText.replace(bracketMatcher, `${openQuote}${trimmedTarget}${closeQuote}`);
  }

  return quoteLearningTermInText(trimmedText, trimmedTarget);
}

function normalizeAnswerTranslation(raw: string, fullSentence: string, target: string, fallback: string): string {
  return (
    cleanQuizSentenceTranslation(raw, fullSentence, target) ||
    fallback.trim() ||
    ''
  );
}

function buildAnswerDetailText(card: Card): {
  fullSentence: string;
  sentenceTranslation: string;
  contextPreview: string;
} {
  const target = (card.targetPhrase || card.targetWord || '').trim();
  const contextSections = parseCardContextSections({
    raw: card.contextualExplanation,
    displayWord: target,
    definition: card.definition,
    sourceSentence: card.originalSentence,
  });
  const fullSentence = pickFillBlankSentence(card).sentence || (card.originalSentence || '').trim() || '-';
  const sentenceTranslation = normalizeAnswerTranslation(
    contextSections.sentenceTranslation,
    fullSentence,
    target,
    card.definition || ''
  );

  return {
    fullSentence: quoteTargetInText(fullSentence, target),
    sentenceTranslation,
    contextPreview: contextSections.culturalBackground || card.definition || '',
  };
}

function buildAnswerDetailTextForSentence(card: Card, sentence: string, translation?: string, allowTranslationFallback = true): {
  fullSentence: string;
  sentenceTranslation: string;
  contextPreview: string;
} {
  const target = (card.targetPhrase || card.targetWord || '').trim();
  const contextSections = parseCardContextSections({
    raw: card.contextualExplanation,
    displayWord: target,
    definition: card.definition,
    sourceSentence: sentence || card.originalSentence,
  });
  const fullSentence = (sentence || card.originalSentence || '').trim() || '-';
  const sentenceTranslation = (translation || '').trim()
    ? cleanQuizSentenceTranslation(translation, fullSentence, target)
    : !allowTranslationFallback
      ? ''
    : normalizeAnswerTranslation(
        contextSections.sentenceTranslation,
        fullSentence,
        target,
        card.definition || ''
      );

  return {
    fullSentence: quoteTargetInText(fullSentence, target),
    sentenceTranslation,
    contextPreview: contextSections.culturalBackground || card.definition || '',
  };
}

function maskTargetInSentence(sentence: string, target: string): string {
  const trimmedSentence = (sentence || '').trim();
  const trimmedTarget = (target || '').trim();
  if (!trimmedSentence || !trimmedTarget) return '';

  const quotedVariants = [
    `「${trimmedTarget}」`,
    `『${trimmedTarget}』`,
    `“${trimmedTarget}”`,
    `"${trimmedTarget}"`,
    `'${trimmedTarget}'`,
  ];

  let masked = trimmedSentence;
  quotedVariants.forEach((variant) => {
    masked = masked.replace(new RegExp(escapeRegex(variant), 'gi'), CLOZE_BLANK);
  });

  masked = masked.replace(new RegExp(escapeRegex(trimmedTarget), 'gi'), CLOZE_BLANK);
  masked = masked.replace(new RegExp(`\\[\\s*${escapeRegex(CLOZE_BLANK)}\\s*\\]`, 'g'), CLOZE_BLANK);
  masked = masked.replace(new RegExp(`\\(\\s*${escapeRegex(CLOZE_BLANK)}\\s*\\)`, 'g'), CLOZE_BLANK);
  return masked;
}

function buildOptionPool(allCards: Card[], currentCard: Card, correctAnswer?: string): string[] {
  const correct = (correctAnswer || pickDisplayAnswer(currentCard)).trim();
  const correctKey = correct.toLowerCase();
  const requiresPhrase = isPhraseAnswer(correct);
  const seen = new Set<string>();
  const pool: string[] = [];

  allCards.forEach((card) => {
    if (card.id === currentCard.id) return;
    const candidates = [card.targetWord, card.targetPhrase];
    candidates.forEach((candidate) => {
      const value = (candidate || '').trim();
      if (!isDisplayableAnswer(value)) return;
      if (isPhraseAnswer(value) !== requiresPhrase) return;
      const key = value.toLowerCase();
      if (key === correctKey || seen.has(key)) return;
      seen.add(key);
      pool.push(value);
    });
  });

  return shuffleArray(pool);
}

function buildDefinitionToWordOptionPool(allCards: Card[], currentCard: Card): string[] {
  const correct = pickDefinitionToWordAnswer(currentCard);
  const correctKey = correct.toLowerCase();
  const requiresPhrase = isPhraseAnswer(correct);
  const seen = new Set<string>();
  const pool: string[] = [];

  allCards.forEach((card) => {
    const value = pickDefinitionToWordAnswer(card);
    if (!value || value === '-' || isPhraseAnswer(value) !== requiresPhrase) return;
    const key = value.toLowerCase();
    if (key === correctKey || seen.has(key)) return;
    seen.add(key);
    pool.push(value);
  });

  return shuffleArray(pool);
}

function buildDefinitionOptionPool(allCards: Card[], currentCard: Card): string[] {
  const correct = pickDefinitionText(currentCard).toLowerCase();
  const seen = new Set<string>();
  const pool: string[] = [];

  allCards.forEach((card) => {
    const value = pickDefinitionText(card).trim();
    if (!value || value === '-') return;
    const key = value.toLowerCase();
    if (key === correct || seen.has(key)) return;
    seen.add(key);
    pool.push(value);
  });

  return shuffleArray(pool);
}

const PART_OF_SPEECH_OPTIONS: CanonicalPartOfSpeech[] = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'preposition',
  'pronoun',
  'conjunction',
  'interjection',
  'determiner',
];

function buildPartOfSpeechOptionPool(
  correctAnswer: CanonicalPartOfSpeech
): CanonicalPartOfSpeech[] {
  return shuffleArray(
    PART_OF_SPEECH_OPTIONS.filter((value) => value !== correctAnswer)
  );
}

function withReviewSetupTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Review setup timed out'));
    }, REVIEW_SESSION_BUILD_TIMEOUT_MS);

    promise
      .then(resolve, reject)
      .finally(() => clearTimeout(timeout));
  });
}

function buildReviewQuestions(
  sourceCards: Card[],
  allCards: Card[],
  questionCount: number,
  pinnedCardIds: string[],
  skippedPronunciationCardIds: string[],
  selectedQuestionTypes: ReviewQuestionType[],
  uiLanguage: UILanguage
): ReviewQuestion[] {
  const questionTypes =
    selectedQuestionTypes.length > 0
      ? selectedQuestionTypes
      : DEFAULT_REVIEW_QUESTION_TYPES;
  const eligibleSourceCards = sourceCards.filter((card) =>
    questionTypes.some((type) => canBuildQuestionTypeForCard(card, type))
  );
  const sourceById = new Map(eligibleSourceCards.map((card) => [card.id, card] as const));
  const skippedPronunciationCards = questionTypes.includes('pronunciation')
    ? skippedPronunciationCardIds
    .map((id) => sourceById.get(id))
    .filter((card): card is Card => Boolean(card))
    : [];
  const skippedPronunciationSet = new Set(skippedPronunciationCards.map((card) => card.id));
  const pinnedCards = pinnedCardIds
    .map((id) => sourceById.get(id))
    .filter((card): card is Card => Boolean(card && !skippedPronunciationSet.has(card.id)));
  const pinnedSet = new Set([...pinnedCards.map((card) => card.id), ...skippedPronunciationSet]);
  const randomPool = shuffleArray(eligibleSourceCards.filter((card) => !pinnedSet.has(card.id)));
  const baseQuestionCount = Math.min(
    Math.max(0, eligibleSourceCards.length - skippedPronunciationCards.length),
    Math.max(questionCount, pinnedCards.length)
  );
  const selected = [...skippedPronunciationCards, ...[...pinnedCards, ...randomPool].slice(0, baseQuestionCount)].slice(
    0,
    eligibleSourceCards.length
  );
  let translationVariantIndex = Math.floor(
    Math.random() * TRANSLATION_QUESTION_VARIANTS.length
  );

  const generated = selected.flatMap<ReviewQuestion>((card, index) => {
    const word = pickDisplayAnswer(card);
    const pronunciationSubject = pickPronunciationSubject(card);
    const definition = pickDefinitionText(card);
    const partOfSpeech = (card.partOfSpeech || 'word').trim();
    const sourceSentence = (card.originalSentence || card.definition || '').trim();
    const contextualExplanation = (card.contextualExplanation || '').trim();
    const maskedSentence = buildMaskedSentence(card);
    const answerDetail = buildAnswerDetailText(card);
    const quizContextExample = pickQuizContextExample(card);
    const answerSummary = {
      answerWord: word,
      answerTranslation: pickAnswerQuickTranslation(card),
    };

    const shouldGuaranteePronunciation =
      skippedPronunciationCards.length === 0 &&
      questionTypes.includes('pronunciation') &&
      index === selected.length - 1;
    const selectedQuestionType = shouldGuaranteePronunciation
      ? 'pronunciation'
      : questionTypes[index % questionTypes.length];
    const preferredQuestionType =
      selectedQuestionType === 'word_to_translation'
        ? TRANSLATION_QUESTION_VARIANTS[
            translationVariantIndex++ % TRANSLATION_QUESTION_VARIANTS.length
          ]
        : selectedQuestionType;
    const questionType = skippedPronunciationSet.has(card.id)
      ? 'pronunciation'
      : resolveQuestionTypeForCard(card, preferredQuestionType, questionTypes);
    if (!questionType) return [];

    if (questionType === 'translation_to_word') {
      const vocabularyAnswer = pickDefinitionToWordAnswer(card);
      const distractors = buildDefinitionToWordOptionPool(allCards, card).slice(0, 3);
      const options = shuffleArray([vocabularyAnswer, ...distractors]);
      return [{
        id: card.id,
        cardId: card.id,
        questionType,
        prompt: tUI(uiLanguage, 'review.prompt.chooseWord'),
        correctAnswer: vocabularyAnswer,
        ...answerSummary,
        answerWord: vocabularyAnswer,
        optionTranslations: buildOptionTranslationLookup(allCards, options),
        options,
        sentence: definition,
        sourceSentence,
        partOfSpeech,
        definition,
        contextualExplanation,
        ...answerDetail,
      }];
    }

    if (questionType === 'word_to_translation') {
      const distractors = buildDefinitionOptionPool(allCards, card).slice(0, 3);
      return [{
        id: card.id,
        cardId: card.id,
        questionType,
        prompt: tUI(uiLanguage, 'review.prompt.chooseTranslation'),
        correctAnswer: definition,
        ...answerSummary,
        options: shuffleArray([definition, ...distractors]),
        sentence: word,
        sourceSentence,
        partOfSpeech,
        definition,
        contextualExplanation,
        ...answerDetail,
      }];
    }

    if (questionType === 'sentence_to_translation') {
      const distractors = buildDefinitionOptionPool(allCards, card).slice(0, 3);
      const contextAnswerDetail = quizContextExample
        ? buildAnswerDetailTextForSentence(
            card,
            quizContextExample.sentence,
            quizContextExample.translation,
            false
          )
        : answerDetail;
      return [{
        id: card.id,
        cardId: card.id,
        questionType,
        prompt: tUI(uiLanguage, 'review.prompt.chooseSentenceMeaning'),
        correctAnswer: definition,
        ...answerSummary,
        options: shuffleArray([definition, ...distractors]),
        sentence: contextAnswerDetail.fullSentence || word,
        sourceSentence,
        partOfSpeech,
        definition,
        contextualExplanation,
        ...contextAnswerDetail,
      }];
    }

    if (questionType === 'part_of_speech') {
      const correctPartOfSpeech = normalizePartOfSpeechCategory(card.partOfSpeech);
      const partOfSpeechExample = pickPartOfSpeechExample(card);
      if (!correctPartOfSpeech || !partOfSpeechExample) return [];
      const distractors = buildPartOfSpeechOptionPool(correctPartOfSpeech).slice(0, 3);
      const partOfSpeechAnswerDetail = buildAnswerDetailTextForSentence(
        card,
        partOfSpeechExample.sentence,
        partOfSpeechExample.translation,
        false
      );
      return [{
        id: card.id,
        cardId: card.id,
        questionType,
        prompt: tUI(uiLanguage, 'review.prompt.choosePartOfSpeech'),
        correctAnswer: correctPartOfSpeech,
        ...answerSummary,
        options: shuffleArray([correctPartOfSpeech, ...distractors]),
        sentence: quoteLearningTermInText(partOfSpeechExample.sentence, word),
        sourceSentence: partOfSpeechExample.sentence,
        partOfSpeech: correctPartOfSpeech,
        definition,
        contextualExplanation,
        ...partOfSpeechAnswerDetail,
      }];
    }

    if (questionType === 'pronunciation') {
      return [{
        id: card.id,
        cardId: card.id,
        questionType,
        prompt: tUI(uiLanguage, 'review.prompt.pronounceWord'),
        correctAnswer: pronunciationSubject,
        ...answerSummary,
        answerWord: pronunciationSubject,
        options: [],
        sentence: pronunciationSubject,
        sourceSentence,
        partOfSpeech,
        definition,
        contextualExplanation,
        ...answerDetail,
      }];
    }

    if (questionType === 'spelling') {
      const fillBlankExamples = getFillBlankExamples(card).slice(0, 1);
      return fillBlankExamples.map<ReviewQuestion | null>((example, exampleIndex) => {
        const exampleSentence = (example.sentence || '').trim();
        const exampleTarget = findTargetInSentence(exampleSentence, getTargetCandidates(card)) || word;
        const maskedExampleSentence = maskTargetInSentence(exampleSentence, exampleTarget) || maskedSentence;
        if (!maskedExampleSentence || !hasUsableMaskedSentence(maskedExampleSentence)) {
          return null;
        }
        const exampleAnswerDetail = buildAnswerDetailTextForSentence(card, exampleSentence, example.translation, false);
        return {
          id: `${card.id}:spelling:${exampleIndex}`,
          cardId: card.id,
          questionVariantIndex: exampleIndex,
          questionType,
          prompt: tUI(uiLanguage, 'review.prompt.spelling'),
          correctAnswer: exampleTarget,
          ...answerSummary,
          options: [],
          sentence: maskedExampleSentence || maskedSentence,
          sourceSentence: exampleSentence || sourceSentence,
          partOfSpeech,
          definition: (card.definition || '').trim(),
          contextualExplanation,
          ...exampleAnswerDetail,
        };
      }).filter((item): item is ReviewQuestion => Boolean(item));
    }

    const fillBlankExamples = getFillBlankExamples(card).slice(0, 1);
    return fillBlankExamples.map<ReviewQuestion | null>((example, exampleIndex) => {
      const exampleSentence = (example.sentence || '').trim();
      const exampleTarget = findTargetInSentence(exampleSentence, getTargetCandidates(card)) || word;
      const maskedExampleSentence = maskTargetInSentence(exampleSentence, exampleTarget) || maskedSentence;
      if (!maskedExampleSentence || !hasUsableMaskedSentence(maskedExampleSentence)) {
        return null;
      }
      const exampleAnswerDetail = buildAnswerDetailTextForSentence(card, exampleSentence, example.translation, false);
      const distractors = buildOptionPool(allCards, card, exampleTarget).slice(0, 3);
      const options = shuffleArray([exampleTarget, ...distractors]);
      return {
        id: `${card.id}:fill_blank:${exampleIndex}`,
        cardId: card.id,
        questionVariantIndex: exampleIndex,
        questionType,
        prompt: tUI(uiLanguage, 'review.prompt.fillBlank'),
        correctAnswer: exampleTarget,
        ...answerSummary,
        optionTranslations: buildOptionTranslationLookup(allCards, options),
        options,
        sentence: maskedExampleSentence || maskedSentence,
        sourceSentence: exampleSentence || sourceSentence,
        partOfSpeech,
        definition: (card.definition || '').trim(),
        contextualExplanation,
        ...exampleAnswerDetail,
      };
    }).filter((item): item is ReviewQuestion => Boolean(item));
  });

  const seenAnswers = new Set<string>();
  return generated.filter((question) => {
    const key = normalizeTypedAnswer(question.answerWord || question.correctAnswer);
    if (!key) return true;
    if (seenAnswers.has(key)) return false;
    seenAnswers.add(key);
    return true;
  });
}

function buildRecordingBypassReviewQuestions(
  sourceCards: Card[],
  allCards: Card[],
  uiLanguage: UILanguage,
  questionTypes: ReviewQuestionType[] = ['word_to_translation', 'spelling', 'pronunciation']
): ReviewQuestion[] {
  const card = sourceCards[0] || allCards[0];
  if (!card) return [];

  const word = pickDisplayAnswer(card);
  const pronunciationSubject = pickPronunciationSubject(card);
  const definition = pickDefinitionText(card);
  const sourceSentence = (card.originalSentence || `I had to ${word} during the presentation.`).trim();
  const contextualExplanation = (card.contextualExplanation || '').trim();
  const answerDetail = buildAnswerDetailText(card);
  const answerSummary = {
    answerWord: word,
    answerTranslation: pickAnswerQuickTranslation(card),
  };
  const localizedDistractors = getLocalizedDemoTranslationDistractors(uiLanguage);
  const translationOptions = shuffleArray([
    definition,
    ...localizedDistractors,
  ]);
  const wordOptions = shuffleArray([
    word,
    'pull it off',
    'look it up',
    'take notes',
  ].filter((item, index, arr) => item && arr.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index));
  const maskedSentence =
    maskTargetInSentence(sourceSentence, findTargetInSentence(sourceSentence, getTargetCandidates(card)) || word) ||
    `I had to ${CLOZE_BLANK} during the presentation.`;

  return questionTypes.map((questionType, index): ReviewQuestion => {
    const base = {
      id: `${card.id}:recording-demo:${questionType}:${index}`,
      cardId: card.id,
      questionType,
      prompt: '',
      correctAnswer: word,
      ...answerSummary,
      options: [] as string[],
      sentence: word,
      sourceSentence,
      partOfSpeech: 'verb',
      definition,
      contextualExplanation,
      ...answerDetail,
    };

    if (questionType === 'fill_blank') {
      return {
        ...base,
        prompt: tUI(uiLanguage, 'review.prompt.fillBlank'),
        correctAnswer: word,
        optionTranslations: buildOptionTranslationLookup(allCards, wordOptions),
        options: wordOptions,
        sentence: maskedSentence,
      };
    }

    if (questionType === 'spelling') {
      return {
        ...base,
        prompt: tUI(uiLanguage, 'review.prompt.spelling'),
        correctAnswer: word,
        options: [],
        sentence: maskedSentence,
      };
    }

    if (questionType === 'word_to_translation') {
      return {
        ...base,
        prompt: tUI(uiLanguage, 'review.prompt.chooseTranslation'),
        correctAnswer: definition,
        options: translationOptions,
        sentence: word,
      };
    }

    if (questionType === 'sentence_to_translation') {
      return {
        ...base,
        prompt: tUI(uiLanguage, 'review.prompt.chooseSentenceMeaning'),
        correctAnswer: definition,
        options: translationOptions,
        sentence: answerDetail.fullSentence || sourceSentence,
      };
    }

    if (questionType === 'part_of_speech') {
      return {
        ...base,
        prompt: tUI(uiLanguage, 'review.prompt.choosePartOfSpeech'),
        correctAnswer: 'verb',
        options: shuffleArray(['verb', 'noun', 'adjective', 'adverb']),
        sentence: quoteLearningTermInText(sourceSentence, word),
        partOfSpeech: 'verb',
      };
    }

    return {
      ...base,
      prompt: tUI(uiLanguage, 'review.prompt.pronounceWord'),
      correctAnswer: pronunciationSubject,
      answerWord: pronunciationSubject,
      options: [],
      sentence: pronunciationSubject,
    };
  });
}

function buildDefaultExperienceTutorialReviewQuestions(uiLanguage: UILanguage): ReviewQuestion[] {
  const demoCardId = '__default_experience_demo__';
  const definition = getLocalizedDemoDefinition(uiLanguage);
  const sentenceTranslation = getLocalizedDemoSentenceMeaning(uiLanguage);
  const contextualExplanation = getLocalizedDemoContextExplanation(uiLanguage);
  const answerSummary = {
    answerWord: DEFAULT_EXPERIENCE_TARGET_WORD,
    answerTranslation: definition,
  };
  const base = {
    cardId: demoCardId,
    correctAnswer: definition,
    ...answerSummary,
    sourceSentence: DEFAULT_EXPERIENCE_CARD_SENTENCE,
    partOfSpeech: 'noun',
    definition,
    contextualExplanation,
    fullSentence: DEFAULT_EXPERIENCE_CARD_SENTENCE,
    sentenceTranslation,
    contextPreview: contextualExplanation,
  };
  const options = shuffleArray([
    definition,
    ...getLocalizedDemoTranslationDistractors(uiLanguage),
  ]);

  return [
    {
      ...base,
      id: 'default-experience-demo:word-to-translation',
      questionType: 'word_to_translation',
      prompt: tUI(uiLanguage, 'review.prompt.chooseTranslation'),
      options,
      sentence: DEFAULT_EXPERIENCE_TARGET_WORD,
    },
    {
      ...base,
      id: 'default-experience-demo:sentence-to-translation',
      questionType: 'sentence_to_translation',
      prompt: tUI(uiLanguage, 'review.prompt.chooseSentenceMeaning'),
      options,
      sentence: DEFAULT_EXPERIENCE_CARD_SENTENCE,
    },
    {
      ...base,
      id: 'default-experience-demo:pronunciation',
      questionType: 'pronunciation',
      prompt: tUI(uiLanguage, 'review.prompt.pronounceWord'),
      correctAnswer: DEFAULT_EXPERIENCE_TARGET_WORD,
      answerWord: DEFAULT_EXPERIENCE_TARGET_WORD,
      options: [],
      sentence: DEFAULT_EXPERIENCE_TARGET_WORD,
    },
  ];
}

function getLocalizedDemoDefinition(uiLanguage: UILanguage): string {
  switch (uiLanguage) {
    case 'zh-TW':
      return '細微差異';
    case 'zh-CN':
      return '细微差异';
    case 'ja':
      return '細部、わずかな違い';
    case 'ko':
      return '미묘한 차이';
    case 'es':
      return 'matices sutiles';
    case 'fr':
      return 'différences subtiles';
    case 'en':
    default:
      return 'small, subtle differences';
  }
}

function getLocalizedDemoSentenceMeaning(uiLanguage: UILanguage): string {
  switch (uiLanguage) {
    case 'zh-TW':
      return '會影響整體意思的細節或差異';
    case 'zh-CN':
      return '会影响整体意思的细节或差异';
    case 'ja':
      return '全体の意味を変える細かな違い';
    case 'ko':
      return '전체 의미를 바꿀 수 있는 작은 차이';
    case 'es':
      return 'detalles o diferencias pequeñas que cambian el significado general';
    case 'fr':
      return 'petits détails ou différences qui changent le sens global';
    case 'en':
    default:
      return 'small details or differences that can change the overall meaning';
  }
}

function getLocalizedDemoContextExplanation(uiLanguage: UILanguage): string {
  switch (uiLanguage) {
    case 'zh-TW':
      return '這裡的 nuances 指很小但會改變感受或意思的差異。';
    case 'zh-CN':
      return '这里的 nuances 指很小但会改变感受或意思的差异。';
    case 'ja':
      return 'ここでの nuances は、印象や意味を変える小さな違いを指します。';
    case 'ko':
      return '여기서 nuances는 느낌이나 의미를 바꾸는 작은 차이를 뜻합니다.';
    case 'es':
      return 'Aquí, nuances se refiere a pequeñas diferencias que cambian el sentido o la sensación.';
    case 'fr':
      return 'Ici, nuances désigne de petites différences qui changent le sens ou l’impression.';
    case 'en':
    default:
      return 'Here, nuances means tiny differences that change the meaning or feeling.';
  }
}

function getLocalizedDemoTranslationDistractors(uiLanguage: UILanguage): string[] {
  switch (uiLanguage) {
    case 'zh-TW':
      return ['正式的書面計畫。', '每天重複的習慣。', '用來存放檔案的地方。'];
    case 'zh-CN':
      return ['正式的书面计划。', '每天重复的习惯。', '用来存放文件的地方。'];
    case 'ja':
      return ['正式な書面計画。', '毎日繰り返す習慣。', 'ファイルを保管する場所。'];
    case 'ko':
      return ['공식적인 서면 계획.', '매일 반복되는 습관.', '파일을 보관하는 장소.'];
    case 'es':
      return ['Un plan escrito formal.', 'Un hábito diario repetido.', 'Un lugar para guardar archivos.'];
    case 'fr':
      return ['Un plan écrit formel.', 'Une habitude répétée chaque jour.', 'Un endroit pour stocker des fichiers.'];
    case 'en':
    default:
      return ['A formal written plan.', 'A repeated daily habit.', 'A place for storing files.'];
  }
}

function getFlipValue(
  mapRef: React.MutableRefObject<Map<string, Animated.Value>>,
  questionId: string
): Animated.Value {
  const existing = mapRef.current.get(questionId);
  if (existing) return existing;
  const created = new Animated.Value(0);
  mapRef.current.set(questionId, created);
  return created;
}

function getCelebrationValue(
  mapRef: React.MutableRefObject<Map<string, Animated.Value>>,
  questionId: string
): Animated.Value {
  const existing = mapRef.current.get(questionId);
  if (existing) return existing;
  const created = new Animated.Value(0);
  mapRef.current.set(questionId, created);
  return created;
}

export default function ReviewFlow({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const theme = resolveThemeColors(colorScheme);
  const isLightMode = colorScheme === 'light';
  const albumId = route.params?.albumId || 'all-cards';
  const albumName = route.params?.albumName || 'Review';
  const requestedQuestionCount = route.params?.questionCount;
  const requestedQuestionTypes = route.params?.selectedQuestionTypes;
  const isScreenshotDemoQuiz =
    __DEV__ &&
    (route.params?.isScreenshotDemoQuiz === true ||
      isScreenshotDemoModeEnabled());
  const isDefaultExperienceTutorial = route.params?.isDefaultExperienceTutorial === true;
  const usesDemoPronunciationBackend = isDefaultExperienceTutorial || isScreenshotDemoQuiz;
  const usesMockPronunciationResult = isScreenshotDemoQuiz;
  const themeColor = '#4EAFF4';
  const routeCardIds = route.params?.cardIds || [];
  const palette = React.useMemo(
    () =>
      isLightMode
        ? {
            screenBg: theme.screenBg,
            cardBg: '#FFFFFF',
            cardBorder: 'rgba(0,0,0,0.06)',
            primaryText: '#111111',
            secondaryText: '#8A8E97',
            softButtonBg: '#FFFFFF',
            softButtonBorder: 'rgba(0,0,0,0.06)',
            progressTrack: 'rgba(17,17,17,0.08)',
            optionBg: '#F5F6FA',
            optionBorder: '#ECECF0',
            optionAnsweredBorder: 'rgba(17,17,17,0.12)',
            optionCorrectBg: 'rgba(78,175,244,0.16)',
            optionCorrectBorder: '#4EAFF4',
            optionWrongBg: 'rgba(255,107,107,0.14)',
            optionWrongBorder: '#FF6B6B',
            answerCardBg: '#FFFFFF',
            answerCardBorder: 'rgba(0,0,0,0.06)',
            nextTimeBg: '#FFFFFF',
            nextTimeBorder: 'rgba(0,0,0,0.06)',
            nextTimeActiveBg: '#E8F4FE',
            nextTimeActiveBorder: '#4EAFF4',
            nextTimeText: '#111111',
            nextButtonBg: '#4EAFF4',
            nextButtonText: '#0F172A',
            summarySecondaryBg: '#FFFFFF',
            summarySecondaryBorder: 'rgba(0,0,0,0.06)',
            summarySecondaryText: '#111111',
            successTint: 'rgba(52,199,89,0.18)',
            errorTint: 'rgba(255,107,107,0.14)',
            successText: '#34C759',
            errorText: '#FF6B6B',
            celebrationIcon: '#34C759',
            celebrationOverlay: 'rgba(52,199,89,0.12)',
          }
        : {
            screenBg: theme.screenBg,
            cardBg: '#1E293B',
            cardBorder: '#334155',
            primaryText: '#F8FAFC',
            secondaryText: '#94A3B8',
            softButtonBg: 'rgba(255,255,255,0.08)',
            softButtonBorder: '#334155',
            progressTrack: 'rgba(255,255,255,0.08)',
            optionBg: '#334155',
            optionBorder: '#334155',
            optionAnsweredBorder: 'rgba(248,250,252,0.2)',
            optionCorrectBg: 'rgba(78,175,244,0.18)',
            optionCorrectBorder: '#4EAFF4',
            optionWrongBg: 'rgba(255,107,107,0.22)',
            optionWrongBorder: '#FF6B6B',
            answerCardBg: '#1E293B',
            answerCardBorder: '#334155',
            nextTimeBg: '#1E293B',
            nextTimeBorder: '#334155',
            nextTimeActiveBg: '#334155',
            nextTimeActiveBorder: '#4EAFF4',
            nextTimeText: '#F8FAFC',
            nextButtonBg: '#4EAFF4',
            nextButtonText: '#0F172A',
            summarySecondaryBg: '#1E293B',
            summarySecondaryBorder: '#334155',
            summarySecondaryText: '#F8FAFC',
            successTint: 'rgba(52,199,89,0.2)',
            errorTint: 'rgba(255,107,107,0.15)',
            successText: '#34C759',
            errorText: '#FF6B6B',
            celebrationIcon: '#E8FFF5',
            celebrationOverlay: 'rgba(52,199,89,0.16)',
          },
    [isLightMode, theme]
  );

  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardsHydrated, setCardsHydrated] = React.useState(false);
  const [questions, setQuestions] = React.useState<ReviewQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({});
  const [spellingDrafts, setSpellingDrafts] = React.useState<Record<string, string>>({});
  const [results, setResults] = React.useState<Record<string, boolean>>({});
  const [skippedQuestionIds, setSkippedQuestionIds] = React.useState<Set<string>>(() => new Set());
  const [pinnedCardIds, setPinnedCardIds] = React.useState<string[]>([]);
  const [skippedPronunciationCardIds, setSkippedPronunciationCardIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reviewSetupError, setReviewSetupError] = React.useState<string | null>(null);
  const [pronunciationRecordingQuestionId, setPronunciationRecordingQuestionId] = React.useState<string | null>(null);
  const [pronunciationAnalyzingQuestionId, setPronunciationAnalyzingQuestionId] = React.useState<string | null>(null);
  const [pronunciationScores, setPronunciationScores] = React.useState<Record<string, number>>({});
  const [pronunciationErrors, setPronunciationErrors] = React.useState<Record<string, string>>({});
  const [pronunciationPhonemes, setPronunciationPhonemes] = React.useState<Record<string, CloudPhonemeFeedback[]>>({});
  const [recoveredPronunciationIpa, setRecoveredPronunciationIpa] = React.useState<Record<string, string[]>>({});
  const [pronunciationIpaLookupQuestionId, setPronunciationIpaLookupQuestionId] = React.useState<string | null>(null);
  const [pronunciationIpaLookupErrors, setPronunciationIpaLookupErrors] = React.useState<Record<string, string>>({});
  const [pronunciationPlaybackTarget, setPronunciationPlaybackTarget] = React.useState<string | null>(null);
  const [pronunciationDownloadTarget, setPronunciationDownloadTarget] = React.useState<string | null>(null);
  const [uiLanguage, setUiLanguage] = React.useState<UILanguage>(
    () => getInitialUserSettings().uiLanguage
  );
  const listRef = React.useRef<FlatList<ReviewSlide> | null>(null);
  const spellingInputRefs = React.useRef<Map<string, TextInput | null>>(new Map());
  const flipValuesRef = React.useRef<Map<string, Animated.Value>>(new Map());
  const celebrationValuesRef = React.useRef<Map<string, Animated.Value>>(new Map());
  const pronunciationRecordingRef = React.useRef<any | null>(null);
  const pronunciationRecordingStartingQuestionIdRef = React.useRef<string | null>(null);
  const pronunciationRecordingStartedAtRef = React.useRef<number>(0);
  const pronunciationWaveValuesRef = React.useRef<Map<string, Animated.Value[]>>(new Map());
  const pronunciationWaveCursorRef = React.useRef<Map<string, number>>(new Map());
  const sessionBuildTokenRef = React.useRef(0);
  const reviewStartedTrackedRef = React.useRef(false);

  React.useEffect(() => {
    if (questions.length === 0 || reviewStartedTrackedRef.current) return;
    reviewStartedTrackedRef.current = true;
    analytics.track('review_started', {
      question_count: questions.length,
      question_type_count: new Set(
        questions.map((question) => question.questionType)
      ).size,
      album_scope: albumId === 'all-cards' ? 'all_cards' : 'album',
      is_tutorial: isDefaultExperienceTutorial,
    });
  }, [albumId, isDefaultExperienceTutorial, questions]);

  React.useEffect(() => {
    let cancelled = false;
    void loadUserSettings()
      .then((settings) => {
        if (!cancelled) setUiLanguage(settings.uiLanguage);
      })
      .catch((error) => {
        console.warn('[ReviewFlow] load UI language failed:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(
    () =>
      subscribeUserSettings((settings) => {
        setUiLanguage(settings.uiLanguage);
      }),
    []
  );

  React.useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    let cancelled = false;

    const loadCards = async () => {
      try {
        const userId = await getCurrentSessionUserId();
        if (!userId) {
          if (!cancelled) {
            setAllCards([]);
            setCardsHydrated(true);
          }
          return;
        }
        const queryCards = database
          .get<Card>('cards')
          .query(Q.where('user_id', userId), Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));
        const data = await withLocalCardQueryTimeout(queryCards.fetch());
        if (cancelled) return;
        setAllCards(data);
        setCardsHydrated(true);
        sub = queryCards.observe().subscribe((nextData) => setAllCards(nextData));
      } catch (error) {
        console.error('[ReviewFlow] load cards failed:', error);
        if (!cancelled) {
          setAllCards([]);
          setCardsHydrated(true);
        }
      }
    };

    void loadCards();
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);

  const sourceCards = React.useMemo(() => {
    if (!routeCardIds.length) return allCards;
    const allowed = new Set(routeCardIds);
    return routeCardIds
      .map((id) => allCards.find((card) => card.id === id) || null)
      .filter((card): card is Card => Boolean(card && allowed.has(card.id)));
  }, [allCards, routeCardIds]);

  const buildSession = React.useCallback(async () => {
    const sessionBuildToken = sessionBuildTokenRef.current + 1;
    sessionBuildTokenRef.current = sessionBuildToken;
    setLoading(true);
    setReviewSetupError(null);
    try {
      const prefs = await withReviewSetupTimeout(loadAlbumReviewPreferences(albumId));
      if (sessionBuildTokenRef.current !== sessionBuildToken) return;

      const nextPinned = prefs.pinnedCardIds.filter((id) => sourceCards.some((card) => card.id === id));
      const nextSkippedPronunciation = prefs.skippedPronunciationCardIds.filter((id) =>
        sourceCards.some((card) => card.id === id)
      );
      const effectiveCount = requestedQuestionCount ?? prefs.questionCount;
      const validRequestedQuestionTypes = (requestedQuestionTypes || []).filter(
        (type): type is ReviewQuestionType =>
          DEFAULT_REVIEW_QUESTION_TYPES.includes(type)
      );
      const effectiveQuestionTypes =
        validRequestedQuestionTypes.length > 0
          ? validRequestedQuestionTypes
          : prefs.selectedQuestionTypes;

      setPinnedCardIds(nextPinned);
      setSkippedPronunciationCardIds(nextSkippedPronunciation);
      setSelectedAnswers({});
      setSpellingDrafts({});
      setResults({});
      setSkippedQuestionIds(new Set());
      setPronunciationScores({});
      setPronunciationErrors({});
      setPronunciationPhonemes({});
      setPronunciationIpaLookupErrors({});
      setPronunciationIpaLookupQuestionId(null);
      setPronunciationPlaybackTarget(null);
      setPronunciationDownloadTarget(null);
      setPronunciationRecordingQuestionId(null);
      setPronunciationAnalyzingQuestionId(null);
      setCurrentIndex(0);
      flipValuesRef.current = new Map();
      const nextQuestions = isScreenshotDemoQuiz
        ? buildDefaultExperienceTutorialReviewQuestions(uiLanguage)
        : isDefaultExperienceTutorial
        ? buildRecordingBypassReviewQuestions(sourceCards, allCards, uiLanguage, [
            'fill_blank',
            'word_to_translation',
            'pronunciation',
          ])
        : SubscriptionService.isPremiumBypassEnabled() && sourceCards.length > 0
        ? buildRecordingBypassReviewQuestions(sourceCards, allCards, uiLanguage)
        : buildReviewQuestions(
            sourceCards,
            allCards,
            effectiveCount,
            nextPinned,
            nextSkippedPronunciation,
            effectiveQuestionTypes,
            uiLanguage
          );
      setRecoveredPronunciationIpa(
        usesDemoPronunciationBackend
          ? Object.fromEntries(
              nextQuestions
                .filter((question) => question.questionType === 'pronunciation')
                .map((question) => [
                  question.id,
                  [...DEFAULT_EXPERIENCE_IPA_PHONEMES],
                ])
            )
          : {}
      );
      setQuestions(nextQuestions);

      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
    } catch (error) {
      if (sessionBuildTokenRef.current !== sessionBuildToken) return;
      console.error('[ReviewFlow] build session failed:', error);
      setQuestions([]);
      setReviewSetupError(error instanceof Error ? error.message : 'Review setup failed');
    } finally {
      if (sessionBuildTokenRef.current === sessionBuildToken) {
        setLoading(false);
      }
    }
  }, [
    albumId,
    allCards,
    isDefaultExperienceTutorial,
    isScreenshotDemoQuiz,
    requestedQuestionCount,
    requestedQuestionTypes,
    sourceCards,
    uiLanguage,
    usesDemoPronunciationBackend,
  ]);

  React.useEffect(() => {
    if (isScreenshotDemoQuiz) {
      void buildSession();
      return;
    }

    if (!cardsHydrated) {
      setLoading(true);
      return;
    }

    if (!allCards.length || !sourceCards.length) {
      if (!sourceCards.length) {
        setReviewSetupError(null);
        setQuestions([]);
        setLoading(false);
      }
      return;
    }

    void buildSession();
  }, [allCards.length, buildSession, cardsHydrated, sourceCards.length]);

  React.useEffect(() => {
    if (!__DEV__) return undefined;

    const handleScreenshotDemoLink = (url: string) => {
      if (url.includes('://dev/demo-quiz')) {
        const params = {
          albumId: 'default-experience-demo',
          albumName: tUI(uiLanguage, 'deck.allCardsReview'),
          cardIds: [],
          questionCount: 3,
          selectedQuestionTypes: [
            'word_to_translation',
            'sentence_to_translation',
            'pronunciation',
          ] as ReviewQuestionType[],
          themeColor: '#2D9E66',
          isScreenshotDemoQuiz: true,
        };
        void enableScreenshotDemoMode().finally(() => {
          if (typeof navigation.replace === 'function') {
            navigation.replace('CardReview', params);
          } else {
            navigation.navigate('CardReview', params);
          }
        });
        return;
      }

      if (url.includes('://dev/normal-quiz')) {
        void disableScreenshotDemoMode().finally(() => {
          navigation.goBack();
        });
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }) => handleScreenshotDemoLink(url));
    Linking.getInitialURL()
      .then((url) => {
        if (url) handleScreenshotDemoLink(url);
      })
      .catch(() => undefined);

    return () => {
      subscription.remove();
    };
  }, [navigation, uiLanguage]);

  React.useEffect(() => {
    if (!__DEV__) return;
    void hydrateScreenshotDemoMode().then((enabled) => {
      if (!enabled || isScreenshotDemoQuiz) return;
      navigation.replace?.('CardReview', {
        albumId: 'default-experience-demo',
        albumName: tUI(uiLanguage, 'deck.allCardsReview'),
        cardIds: [],
        questionCount: 3,
        selectedQuestionTypes: [
          'word_to_translation',
          'sentence_to_translation',
          'pronunciation',
        ] as ReviewQuestionType[],
        themeColor: '#2D9E66',
        isScreenshotDemoQuiz: true,
      });
    });
  }, [isScreenshotDemoQuiz, navigation, uiLanguage]);

  React.useEffect(() => {
    return () => {
      const recording = pronunciationRecordingRef.current;
      pronunciationRecordingRef.current = null;
      if (recording) {
        try {
          recording.setOnRecordingStatusUpdate(null);
          void recording.stopAndUnloadAsync().catch(() => undefined);
        } catch {
          // ignore cleanup errors
        }
      }

      void stopDefaultExperiencePronunciation();
    };
  }, []);

  const slides = React.useMemo<ReviewSlide[]>(
    () => [...questions.map((question) => ({ id: question.id, type: 'question', question }) as const), { id: 'summary', type: 'summary' }],
    [questions]
  );

  React.useEffect(() => {
    const activeSlide = slides[currentIndex];
    if (activeSlide?.type !== 'question') return;
    if (activeSlide.question.questionType !== 'spelling') return;
    if (selectedAnswers[activeSlide.question.id]) return;

    const timers = [
      setTimeout(() => {
        spellingInputRefs.current.get(activeSlide.question.id)?.focus?.();
      }, 180),
      setTimeout(() => {
        spellingInputRefs.current.get(activeSlide.question.id)?.focus?.();
      }, 520),
    ];

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [currentIndex, selectedAnswers, slides]);

  const correctCount = React.useMemo(
    () => Object.values(results).filter(Boolean).length,
    [results]
  );
  const skippedCount = skippedQuestionIds.size;
  const scoredQuestionCount = React.useMemo(
    () => Math.max(0, questions.length - skippedQuestionIds.size),
    [questions.length, skippedQuestionIds]
  );

  const answerQuestion = React.useCallback((question: ReviewQuestion, option: string) => {
    if (selectedAnswers[question.id]) return;

    const isCorrect = option === question.correctAnswer;
    if (isCorrect) {
      triggerCorrectAnswerHaptic();
    } else {
      triggerWrongAnswerBuzzHaptic();
    }
    setSelectedAnswers((prev) => ({ ...prev, [question.id]: option }));
    setResults((prev) => ({ ...prev, [question.id]: isCorrect }));
    void markCardAsQuizReviewed(question.cardId);
    void ReminderNotificationService.evaluateAndSchedule().catch((error) => {
      console.warn('[Reminders] schedule after quiz answer failed:', error);
    });

    const flipValue = getFlipValue(flipValuesRef, question.id);
    setTimeout(() => {
      Animated.timing(flipValue, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !isCorrect) return;
        const celebrate = getCelebrationValue(celebrationValuesRef, question.id);
        celebrate.setValue(0);
        Animated.sequence([
          Animated.timing(celebrate, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.delay(260),
          Animated.timing(celebrate, {
            toValue: 0,
            duration: 380,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, OPTION_FEEDBACK_DURATION_MS);
  }, [selectedAnswers]);

  const finishQuestionWithResult = React.useCallback((question: ReviewQuestion, answer: string, isCorrect: boolean) => {
    if (selectedAnswers[question.id]) return;

    if (isCorrect) {
      triggerCorrectAnswerHaptic();
    } else {
      triggerWrongAnswerBuzzHaptic();
    }

    setSelectedAnswers((prev) => ({ ...prev, [question.id]: answer }));
    setResults((prev) => ({ ...prev, [question.id]: isCorrect }));
    if (
      question.questionType === 'spelling' &&
      !isCorrect &&
      !question.retryOfQuestionId
    ) {
      const sourceCard = allCards.find((card) => card.id === question.cardId);
      const retryQuestion = buildSpellingRetryQuestion(question, sourceCard, uiLanguage);
      setQuestions((currentQuestions) => {
        const questionIndex = currentQuestions.findIndex((item) => item.id === question.id);
        if (questionIndex < 0) return currentQuestions;
        const existingNextQuestion = currentQuestions[questionIndex + 1];
        if (existingNextQuestion?.retryOfQuestionId === question.id) {
          return currentQuestions;
        }
        return [
          ...currentQuestions.slice(0, questionIndex + 1),
          retryQuestion,
          ...currentQuestions.slice(questionIndex + 1),
        ];
      });
    }
    void markCardAsQuizReviewed(question.cardId);
    void ReminderNotificationService.evaluateAndSchedule().catch((error) => {
      console.warn('[Reminders] schedule after pronunciation quiz failed:', error);
    });
    if (skippedPronunciationCardIds.includes(question.cardId)) {
      const nextSkipped = skippedPronunciationCardIds.filter((id) => id !== question.cardId);
      setSkippedPronunciationCardIds(nextSkipped);
      void saveAlbumReviewPreferences(albumId, { skippedPronunciationCardIds: nextSkipped });
    }

    const flipValue = getFlipValue(flipValuesRef, question.id);
    setTimeout(() => {
      Animated.timing(flipValue, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !isCorrect) return;
        const celebrate = getCelebrationValue(celebrationValuesRef, question.id);
        celebrate.setValue(0);
        Animated.sequence([
          Animated.timing(celebrate, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.delay(260),
          Animated.timing(celebrate, {
            toValue: 0,
            duration: 380,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, OPTION_FEEDBACK_DURATION_MS);
  }, [albumId, allCards, selectedAnswers, skippedPronunciationCardIds, uiLanguage]);

  const handleChangeSpellingDraft = React.useCallback((questionId: string, value: string) => {
    setSpellingDrafts((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const answerSpellingQuestion = React.useCallback((question: ReviewQuestion) => {
    const typedAnswer = (spellingDrafts[question.id] || '').trim();
    if (!typedAnswer || selectedAnswers[question.id]) return;

    const isCorrect = normalizeTypedAnswer(typedAnswer) === normalizeTypedAnswer(question.correctAnswer);
    finishQuestionWithResult(question, typedAnswer, isCorrect);
  }, [finishQuestionWithResult, selectedAnswers, spellingDrafts]);

  const stopPronunciationQuestionRecording = React.useCallback(async (question: ReviewQuestion) => {
    const recording = pronunciationRecordingRef.current;
    if (!recording) return;

    try {
      analytics.track('pronunciation_attempted', { context: 'review' });
      setPronunciationRecordingQuestionId(null);
      recording.setOnRecordingStatusUpdate(null);
      const statusBeforeStop = await recording.getStatusAsync();
      const durationMillis =
        statusBeforeStop.isLoaded && typeof statusBeforeStop.durationMillis === 'number'
          ? statusBeforeStop.durationMillis
          : Date.now() - pronunciationRecordingStartedAtRef.current;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      pronunciationRecordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      if (!uri) {
        throw new Error(tUI(uiLanguage, 'review.recordingMissing'));
      }
      if (durationMillis > 0 && durationMillis < MIN_PRONUNCIATION_RECORDING_MS) {
        throw new Error(tUI(uiLanguage, 'review.recordingTooShort'));
      }
      if (Platform.OS === 'ios' && !uri.toLowerCase().endsWith('.wav')) {
        throw new Error(tUI(uiLanguage, 'review.recordingInvalidFormat'));
      }

      setPronunciationAnalyzingQuestionId(question.id);
      setPronunciationErrors((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      if (usesMockPronunciationResult) {
        const score = DEFAULT_EXPERIENCE_MOCK_PRONUNCIATION_SCORE;
        setPronunciationScores((prev) => ({ ...prev, [question.id]: score }));
        setPronunciationPhonemes((prev) => ({
          ...prev,
          [question.id]: DEFAULT_EXPERIENCE_MOCK_PHONEMES,
        }));
        setRecoveredPronunciationIpa((prev) => {
          const next = { ...prev };
          delete next[question.id];
          return next;
        });
        finishQuestionWithResult(question, `${score}%`, true);
        return;
      }
      const result = await assessPronunciationCloud({
        referenceText: question.correctAnswer,
        audioUri: uri,
        locale: detectPronunciationLocale(question.correctAnswer),
        demoExperience: usesDemoPronunciationBackend,
      });
      const score = Math.round(result.score);
      const passed = score >= PRONUNCIATION_PASS_SCORE;
      setPronunciationScores((prev) => ({ ...prev, [question.id]: score }));
      setPronunciationPhonemes((prev) => ({ ...prev, [question.id]: result.phonemeFeedback || [] }));
      setRecoveredPronunciationIpa((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      setPronunciationIpaLookupErrors((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      finishQuestionWithResult(question, `${score}%`, passed);
    } catch (error) {
      if (isPremiumFeatureError(error)) {
        if (SubscriptionService.isPremiumBypassEnabled()) {
          setPronunciationErrors((prev) => ({
            ...prev,
            [question.id]: tUI(uiLanguage, 'review.assessFailed'),
          }));
          return;
        }
        setPronunciationErrors((prev) => {
          const next = { ...prev };
          delete next[question.id];
          return next;
        });
        setPronunciationScores((prev) => {
          const next = { ...prev };
          delete next[question.id];
          return next;
        });
        setPronunciationPhonemes((prev) => {
          const next = { ...prev };
          delete next[question.id];
          return next;
        });
        tabSwipeContext?.openMembershipPaywall({ source: 'review' });
        return;
      }
      console.error('[ReviewFlow][Pronunciation] assess failed:', error);
      const message = error instanceof Error ? error.message : tUI(uiLanguage, 'review.assessFailed');
      setPronunciationErrors((prev) => ({ ...prev, [question.id]: message }));
      setPronunciationScores((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      setPronunciationPhonemes((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
    } finally {
      pronunciationRecordingRef.current = null;
      setPronunciationRecordingQuestionId(null);
      setPronunciationAnalyzingQuestionId(null);
    }
  }, [finishQuestionWithResult, tabSwipeContext, uiLanguage, usesDemoPronunciationBackend, usesMockPronunciationResult]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') return;
      const activeRecording = pronunciationRecordingRef.current;
      pronunciationRecordingRef.current = null;
      pronunciationRecordingStartedAtRef.current = 0;
      setPronunciationRecordingQuestionId(null);
      if (!activeRecording) return;
      activeRecording.setOnRecordingStatusUpdate(null);
      void activeRecording.stopAndUnloadAsync().catch((error: unknown) => {
        console.warn('[ReviewFlow][Pronunciation] background recorder cleanup failed:', error);
      });
    });
    return () => subscription.remove();
  }, []);

  const getPronunciationWaveValues = React.useCallback((questionId: string): Animated.Value[] => {
    const existing = pronunciationWaveValuesRef.current.get(questionId);
    if (existing) return existing;
    const created = Array.from({ length: 13 }, () => new Animated.Value(8));
    pronunciationWaveValuesRef.current.set(questionId, created);
    pronunciationWaveCursorRef.current.set(questionId, 0);
    return created;
  }, []);

  const updatePronunciationWaveFromMetering = React.useCallback((questionId: string, metering?: number) => {
    if (typeof metering !== 'number' || !Number.isFinite(metering)) return;
    const values = getPronunciationWaveValues(questionId);
    const cursor = pronunciationWaveCursorRef.current.get(questionId) || 0;
    const nextCursor = (cursor + 1) % values.length;
    pronunciationWaveCursorRef.current.set(questionId, nextCursor);
    const normalized = Math.max(6, Math.min(48, ((metering + 60) / 60) * 48));

    values.forEach((value, index) => {
      const distance = Math.min(
        Math.abs(index - nextCursor),
        values.length - Math.abs(index - nextCursor)
      );
      const falloff = Math.max(0.28, 1 - distance * 0.17);
      Animated.spring(value, {
        toValue: Math.max(5, normalized * falloff),
        friction: 7,
        tension: 44,
        useNativeDriver: false,
      }).start();
    });
  }, [getPronunciationWaveValues]);

  const togglePronunciationQuestionRecording = React.useCallback(async (question: ReviewQuestion) => {
    if (selectedAnswers[question.id] || pronunciationAnalyzingQuestionId) return;
    if (pronunciationRecordingQuestionId === question.id) {
      await stopPronunciationQuestionRecording(question);
      return;
    }
    if (pronunciationRecordingRef.current) return;
    if (pronunciationRecordingStartingQuestionIdRef.current) return;

    pronunciationRecordingStartingQuestionIdRef.current = question.id;
    let pendingRecording: InstanceType<typeof Audio.Recording> | null = null;

    try {
      // Hard cap so a hung native call (setAudioModeAsync / prepareToRecordAsync
      // / startAsync) can never leave the starting ref stuck and block retries.
      await Promise.race([
        (async () => {
          let microphonePermission = await Audio.getPermissionsAsync();
          if (!microphonePermission.granted) {
            microphonePermission = await Audio.requestPermissionsAsync();
          }
          if (!microphonePermission.granted) {
            setPronunciationErrors((prev) => {
              return {
                ...prev,
                [question.id]: tUI(uiLanguage, 'review.micPermissionRequired'),
              };
            });
            setPronunciationRecordingQuestionId(null);
            pronunciationRecordingRef.current = null;
            return;
          }

          // Stop any in-flight TTS playback before switching to recording mode.
          // iOS AVAudioSession may still be in playback mode and reject the
          // recording switch if a sound is mid-playback or was just released.
          await stopDefaultExperiencePronunciation();
          await stopAzureTtsPlayback();
          await waitForActiveAudioSession();
          await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
          pendingRecording = new Audio.Recording();
          await pendingRecording.prepareToRecordAsync(REVIEW_PRONUNCIATION_RECORDING_OPTIONS as any);
          pendingRecording.setProgressUpdateInterval?.(80);
          pendingRecording.setOnRecordingStatusUpdate((status: any) => {
            if (status?.isRecording) {
              updatePronunciationWaveFromMetering(question.id, status.metering);
            }
          });
          await pendingRecording.startAsync();
          pronunciationRecordingRef.current = pendingRecording;
          pendingRecording = null;
          pronunciationRecordingStartedAtRef.current = Date.now();
          setPronunciationErrors((prev) => {
            const next = { ...prev };
            delete next[question.id];
            return next;
          });
          setPronunciationRecordingQuestionId(question.id);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Recording start timed out')), 8000)
        ),
      ]);
    } catch (error) {
      console.error('[ReviewFlow][Pronunciation] recording failed:', error);
      if (pendingRecording) {
        pendingRecording.setOnRecordingStatusUpdate(null);
        await pendingRecording.stopAndUnloadAsync().catch(() => undefined);
      }
      const detail =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error ?? 'unknown');
      void logDiagnosticEvent({
        severity: 'error',
        category: 'pronunciation',
        event: 'recording_failed',
        message: detail,
        context: {
          flow: 'review',
          questionId: question.id,
          wasPlaybackActive: pronunciationPlaybackTarget === question.id,
          wasDownloading: pronunciationDownloadTarget !== null,
        },
      });
      setPronunciationErrors((prev) => ({
        ...prev,
        [question.id]: `${tUI(uiLanguage, 'review.recordFailed')}\n[DEBUG] ${detail}`,
      }));
      setPronunciationRecordingQuestionId(null);
      pronunciationRecordingRef.current = null;
    } finally {
      pronunciationRecordingStartingQuestionIdRef.current = null;
    }
  }, [pronunciationAnalyzingQuestionId, pronunciationRecordingQuestionId, selectedAnswers, stopPronunciationQuestionRecording, uiLanguage, updatePronunciationWaveFromMetering]);

  const handlePlayQuestionPronunciation = React.useCallback((question: ReviewQuestion) => {
    const text = (question.correctAnswer || question.answerWord || '').trim();
    if (!text) return;
    const downloadTarget = `word:${text}`;
    setPronunciationPlaybackTarget(question.id);

    const sourceCard = sourceCards.find((card) => card.id === question.cardId);
    const usesDefaultExperiencePronunciation =
      usesDemoPronunciationBackend ||
      resolvePronunciationAudioSource({
        questionId: question.id,
        targetWord: text,
        sourceCard,
      }) === 'bundled-default-experience';
    if (usesDefaultExperiencePronunciation) {
      void playDefaultExperiencePronunciation({
        onDone: () => {
          setPronunciationPlaybackTarget((current) => (current === question.id ? null : current));
        },
        onError: () => {
          setPronunciationPlaybackTarget((current) => (current === question.id ? null : current));
        },
      });
      return;
    }

    void speakEnglishNaturally(text, {
      onDownloadStart: () => setPronunciationDownloadTarget(downloadTarget),
      onDownloadEnd: () => setPronunciationDownloadTarget((current) => (current === downloadTarget ? null : current)),
      onDone: () => {
        setPronunciationDownloadTarget((current) => (current === downloadTarget ? null : current));
        setPronunciationPlaybackTarget((current) => (current === question.id ? null : current));
      },
      onStopped: () => {
        setPronunciationDownloadTarget((current) => (current === downloadTarget ? null : current));
        setPronunciationPlaybackTarget((current) => (current === question.id ? null : current));
      },
      onError: () => {
        setPronunciationDownloadTarget((current) => (current === downloadTarget ? null : current));
        setPronunciationPlaybackTarget((current) => (current === question.id ? null : current));
      },
    });
  }, [sourceCards, usesDemoPronunciationBackend]);

  const handlePlayQuestionIpaPhoneme = React.useCallback((questionId: string, rawPhoneme: string) => {
    const target = getIpaPhonemeAudioTarget(rawPhoneme);
    if (!target) return;
    const playbackTarget = `${questionId}:${target}`;
    setPronunciationPlaybackTarget(playbackTarget);
    void speakIpaPhoneme(rawPhoneme, {
      demoExperience: usesDemoPronunciationBackend,
      onDownloadStart: () => setPronunciationDownloadTarget(playbackTarget),
      onDownloadEnd: () => setPronunciationDownloadTarget((current) => (current === playbackTarget ? null : current)),
      onDone: () => {
        setPronunciationDownloadTarget((current) => (current === playbackTarget ? null : current));
        setPronunciationPlaybackTarget((current) => (current === playbackTarget ? null : current));
      },
      onStopped: () => {
        setPronunciationDownloadTarget((current) => (current === playbackTarget ? null : current));
        setPronunciationPlaybackTarget((current) => (current === playbackTarget ? null : current));
      },
      onError: () => {
        setPronunciationDownloadTarget((current) => (current === playbackTarget ? null : current));
        setPronunciationPlaybackTarget((current) => (current === playbackTarget ? null : current));
      },
    });
  }, [usesDemoPronunciationBackend]);

  const handleReloadQuestionIpa = React.useCallback(async (question: ReviewQuestion) => {
    const questionId = question.id;
    const sourceCard = allCards.find((card) => card.id === question.cardId);
    setPronunciationIpaLookupQuestionId(questionId);
    setPronunciationIpaLookupErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    try {
      const phonemes = await loadStandardIpaPhonemes(
        question.correctAnswer,
        sourceCard?.phoneticTranscription
      );
      if (phonemes.length === 0) {
        throw new Error('IPA unavailable');
      }
      setRecoveredPronunciationIpa((prev) => ({
        ...prev,
        [questionId]: phonemes,
      }));
    } catch {
      setPronunciationIpaLookupErrors((prev) => ({
        ...prev,
        [questionId]: 'lookup_failed',
      }));
    } finally {
      setPronunciationIpaLookupQuestionId((current) =>
        current === questionId ? null : current
      );
    }
  }, [allCards]);

  const goToSlide = React.useCallback((index: number) => {
    setCurrentIndex(index);
    listRef.current?.scrollToOffset({ offset: index * width, animated: true });
  }, [width]);

  const handleSkipPronunciationQuestion = React.useCallback(async (question: ReviewQuestion) => {
    if (selectedAnswers[question.id] || pronunciationAnalyzingQuestionId) return;

    const recording = pronunciationRecordingRef.current;
    pronunciationRecordingRef.current = null;
    pronunciationRecordingStartedAtRef.current = 0;
    setPronunciationRecordingQuestionId(null);
    setPronunciationAnalyzingQuestionId(null);
    setPronunciationDownloadTarget(null);
    setPronunciationPlaybackTarget(null);
    setPronunciationErrors((prev) => {
      const next = { ...prev };
      delete next[question.id];
      return next;
    });
    setPronunciationScores((prev) => {
      const next = { ...prev };
      delete next[question.id];
      return next;
    });
    setPronunciationPhonemes((prev) => {
      const next = { ...prev };
      delete next[question.id];
      return next;
    });

    if (recording) {
      try {
        recording.setOnRecordingStatusUpdate(null);
        await recording.stopAndUnloadAsync();
      } catch {
        // Skipping should never trap the user on the recording screen.
      }
    }

    setSkippedQuestionIds((prev) => {
      if (prev.has(question.id)) return prev;
      const next = new Set(prev);
      next.add(question.id);
      return next;
    });

    const nextSkippedPronunciation = skippedPronunciationCardIds.includes(question.cardId)
      ? skippedPronunciationCardIds
      : [question.cardId, ...skippedPronunciationCardIds];
    if (nextSkippedPronunciation !== skippedPronunciationCardIds) {
      setSkippedPronunciationCardIds(nextSkippedPronunciation);
      await saveAlbumReviewPreferences(albumId, { skippedPronunciationCardIds: nextSkippedPronunciation });
    }

    void Haptics.selectionAsync();
    const questionIndex = questions.findIndex((item) => item.id === question.id);
    const nextIndex = questionIndex >= 0 ? questionIndex + 1 : currentIndex + 1;
    goToSlide(Math.min(nextIndex, slides.length - 1));
  }, [
    albumId,
    currentIndex,
    goToSlide,
    pronunciationAnalyzingQuestionId,
    questions,
    selectedAnswers,
    skippedPronunciationCardIds,
    slides.length,
  ]);

  const handleTogglePinned = React.useCallback(async (cardId: string) => {
    const nextPinned = pinnedCardIds.includes(cardId)
      ? pinnedCardIds.filter((id) => id !== cardId)
      : [...pinnedCardIds, cardId];

    setPinnedCardIds(nextPinned);
    await saveAlbumReviewPreferences(albumId, { pinnedCardIds: nextPinned });
  }, [albumId, pinnedCardIds]);

  const handleNext = React.useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= slides.length) return;
    goToSlide(nextIndex);
  }, [currentIndex, goToSlide, slides.length]);

  const handleReplay = React.useCallback(() => {
    void buildSession();
  }, [buildSession]);

  const renderQuestionCard = React.useCallback((question: ReviewQuestion) => {
    const flipValue = getFlipValue(flipValuesRef, question.id);
    const frontRotate = flipValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '180deg'],
    });
    const backRotate = flipValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['180deg', '360deg'],
    });
    const celebrationValue = getCelebrationValue(celebrationValuesRef, question.id);
    const celebrationScale = celebrationValue.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.16],
    });
    const celebrationIconOpacity = celebrationValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    const celebrationOverlayOpacity = celebrationValue.interpolate({
      inputRange: [0, 0.15, 1],
      outputRange: [0, 0.3, 0],
    });
    const celebrationFloat = celebrationValue.interpolate({
      inputRange: [0, 1],
      outputRange: [8, -4],
    });
    const selectedAnswer = selectedAnswers[question.id];
    const isCorrect = results[question.id];
    const isPinned = pinnedCardIds.includes(question.cardId);
    const isPronunciationQuestion = question.questionType === 'pronunciation';
    const isFillBlankQuestion = question.questionType === 'fill_blank';
    const isSpellingQuestion = question.questionType === 'spelling';
    const isPartOfSpeechQuestion = question.questionType === 'part_of_speech';
    const isPronunciationRecording = pronunciationRecordingQuestionId === question.id;
    const isPronunciationAnalyzing = pronunciationAnalyzingQuestionId === question.id;
    const pronunciationScore = pronunciationScores[question.id];
    const pronunciationError = pronunciationErrors[question.id];
    const pronunciationPhonemeItems = pronunciationPhonemes[question.id] || [];
    const recoveredIpaItems = recoveredPronunciationIpa[question.id] || [];
    const wordDownloadTarget = `word:${(question.correctAnswer || question.answerWord || '').trim()}`;
    const isPronunciationWordDownloading = pronunciationDownloadTarget === wordDownloadTarget;
    const isPronunciationWordPlaying = pronunciationPlaybackTarget === question.id;
    const isPronunciationPlaybackBusy = isPronunciationWordPlaying || isPronunciationWordDownloading;
    const answerQuickTranslation = (question.answerTranslation || '').trim();
    const spellingDraft = spellingDrafts[question.id] || '';
    const isLongAnswer = isLongAnswerText(question.answerWord);
    const selectedAnswerLabel = isPartOfSpeechQuestion
      ? formatPartOfSpeechLabel(selectedAnswer, uiLanguage)
      : selectedAnswer;
    const selectedAnswerTranslation = selectedAnswer
      ? (question.optionTranslations?.[selectedAnswer] || '').trim()
      : '';
    const shouldShowSelectedAnswerTranslation =
      Boolean(selectedAnswerTranslation) &&
      selectedAnswerTranslation !== '-' &&
      selectedAnswerTranslation !== selectedAnswerLabel;
    const selectedAnswerIsLong = isLongAnswerText(selectedAnswerLabel || '');
    const shouldStackOptions = shouldStackReviewOptions(question);
    const hasVeryLongOptions = hasVeryLongReviewOptions(question);
    const pronunciationWaveValues = getPronunciationWaveValues(question.id);
    const pronunciationResultPassed =
      typeof pronunciationScore === 'number' &&
      pronunciationScore >= PRONUNCIATION_PASS_SCORE;
    const scoredPronunciationPhonemeSectionItems = pronunciationPhonemeItems.flatMap(
      (item, index) => {
        const ipa = getIpaSymbol(item.phoneme);
        if (!ipa) return [];
        const audioTarget = getIpaPhonemeAudioTarget(ipa);
        const playbackTarget = `${question.id}:${audioTarget}`;
        const loading = Boolean(
          audioTarget && pronunciationDownloadTarget === playbackTarget
        );
        return [{
          id: `${playbackTarget}:${index}`,
          value: ipa,
          label: formatIpaPhoneme(ipa),
          accuracy: item.accuracy,
          loading,
          active: Boolean(
            audioTarget &&
              pronunciationPlaybackTarget === playbackTarget &&
              !loading
          ),
        }];
      }
    );
    const recoveredPronunciationPhonemeSectionItems =
      scoredPronunciationPhonemeSectionItems.length > 0
        ? []
        : recoveredIpaItems.flatMap((rawPhoneme, index) => {
            const ipa = getIpaSymbol(rawPhoneme);
            if (!ipa) return [];
            const audioTarget = getIpaPhonemeAudioTarget(ipa);
            const playbackTarget = `${question.id}:${audioTarget}`;
            const loading = Boolean(
              audioTarget && pronunciationDownloadTarget === playbackTarget
            );
            return [{
              id: `${playbackTarget}:recovered:${index}`,
              value: ipa,
              label: formatIpaPhoneme(ipa),
              accuracy: null,
              loading,
              active: Boolean(
                audioTarget &&
                  pronunciationPlaybackTarget === playbackTarget &&
                  !loading
              ),
            }];
          });
    const pronunciationPhonemeSectionItems = [
      ...scoredPronunciationPhonemeSectionItems,
      ...recoveredPronunciationPhonemeSectionItems,
    ];
    const renderPronunciationResult = () => {
      if (!isPronunciationQuestion) return null;
      return (
        <View style={styles.pronunciationResultContent}>
          <View
            style={[
              styles.pronunciationResultTag,
              {
                backgroundColor: pronunciationResultPassed
                  ? palette.successTint
                  : palette.errorTint,
                borderColor: pronunciationResultPassed
                  ? palette.successText
                  : palette.errorText,
              },
            ]}
          >
            <Ionicons
              name={pronunciationResultPassed ? 'checkmark' : 'close'}
              size={12}
              color={
                pronunciationResultPassed
                  ? palette.successText
                  : palette.errorText
              }
            />
            <Text
              style={[
                styles.pronunciationResultTagText,
                {
                  color: pronunciationResultPassed
                    ? palette.successText
                    : palette.errorText,
                },
              ]}
            >
              {tUI(
                uiLanguage,
                pronunciationResultPassed
                  ? 'pronunciation.pass'
                  : 'pronunciation.fail'
              )}
            </Text>
          </View>

          <Text
            style={[
              styles.pronunciationResultWord,
              isLongAnswer ? styles.answerWordLong : null,
              { color: palette.primaryText },
            ]}
            numberOfLines={isLongAnswer ? 2 : 1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {question.answerWord}
          </Text>

          {answerQuickTranslation ? (
            <Text
              style={[
                styles.pronunciationResultTranslation,
                { color: palette.secondaryText },
              ]}
            >
              {answerQuickTranslation}
            </Text>
          ) : null}

          <Text
            style={[
              styles.pronunciationResultScore,
              {
                color: pronunciationResultPassed
                  ? palette.successText
                  : palette.errorText,
              },
            ]}
          >
            {typeof pronunciationScore === 'number'
              ? `${Math.round(pronunciationScore)}%`
              : '—'}
          </Text>

          <AnimatedGlowPressable
            accessibilityRole="button"
            accessibilityLabel={tUI(uiLanguage, 'review.playPronunciation')}
            active={isPronunciationWordPlaying || isPronunciationWordDownloading}
            style={styles.pronunciationAnswerWordButton}
            pressedStyle={!isPronunciationPlaybackBusy ? styles.pronunciationButtonPressed : null}
            idleBackgroundColor={palette.softButtonBg}
            idleBorderColor={palette.softButtonBorder}
            disabled={isPronunciationPlaybackBusy}
            onPress={() => handlePlayQuestionPronunciation(question)}
          >
            {isPronunciationWordDownloading ? (
              <ActivityIndicator size="small" color={palette.optionCorrectBorder} />
            ) : (
              <Ionicons
                name="volume-medium-outline"
                size={28}
                color={isPronunciationWordPlaying ? '#BFE7FF' : palette.primaryText}
              />
            )}
          </AnimatedGlowPressable>

          {pronunciationPhonemeSectionItems.length > 0 ? (
            <PronunciationPhonemeSectionUI
              items={pronunciationPhonemeSectionItems}
              uiLanguage={uiLanguage}
              primaryTextColor={palette.primaryText}
              secondaryTextColor={palette.secondaryText}
              surfaceColor={palette.optionBg}
              borderColor={palette.optionBorder}
              accentColor={palette.optionCorrectBorder}
              onPressItem={(item) =>
                handlePlayQuestionIpaPhoneme(question.id, item.value)
              }
            />
          ) : (
            <View
              style={[
                styles.pronunciationIpaRecovery,
                {
                  backgroundColor: palette.optionBg,
                  borderColor: palette.optionBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.pronunciationIpaRecoveryText,
                  {
                    color: pronunciationIpaLookupErrors[question.id]
                      ? palette.errorText
                      : palette.secondaryText,
                  },
                ]}
              >
                {tUI(
                  uiLanguage,
                  pronunciationIpaLookupErrors[question.id]
                    ? 'pronunciation.ipaLookupFailed'
                    : 'pronunciation.ipaUnavailable'
                )}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={pronunciationIpaLookupQuestionId === question.id}
                style={({ pressed }) => [
                  styles.pronunciationIpaRecoveryButton,
                  {
                    backgroundColor: palette.softButtonBg,
                    borderColor: palette.softButtonBorder,
                  },
                  pressed ? styles.secondaryButtonPressed : null,
                ]}
                onPress={() => void handleReloadQuestionIpa(question)}
              >
                {pronunciationIpaLookupQuestionId === question.id ? (
                  <ActivityIndicator size="small" color={palette.optionCorrectBorder} />
                ) : (
                  <Ionicons name="refresh" size={17} color={palette.primaryText} />
                )}
                <Text
                  style={[
                    styles.pronunciationIpaRecoveryButtonText,
                    { color: palette.primaryText },
                  ]}
                >
                  {tUI(uiLanguage, 'pronunciation.reloadIpa')}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      );
    };

    return (
      <View style={[styles.slide, { width }]}>
        <View style={styles.cardShell}>
          <Animated.View
            style={[
              styles.cardFace,
              { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
              {
                transform: [{ perspective: 1200 }, { rotateY: frontRotate }],
              },
            ]}
          >
            <KeyboardAvoidingView
              style={styles.questionContentAvoider}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
              enabled={isSpellingQuestion}
            >
            <Text style={[styles.questionEyebrow, { color: palette.secondaryText }]}>{question.prompt.toUpperCase()}</Text>
            {isFillBlankQuestion || isSpellingQuestion ? (
              <View style={styles.fillBlankSentenceBlock}>
                <Text style={[styles.sentenceText, styles.fillBlankSentenceText, { color: palette.primaryText }]}>
                  {question.sentence}
                </Text>
                {(question.sentenceTranslation || '').trim() ? (
                  <Text style={[styles.fillBlankTranslationText, { color: palette.secondaryText }]}>
                    {question.sentenceTranslation}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.sentenceText, { color: palette.primaryText }]}>{question.sentence}</Text>
            )}

            {isSpellingQuestion ? (
              <View style={styles.spellingPanel}>
                <AnimatedGlowPressable
                  accessibilityRole="button"
                  accessibilityLabel={tUI(uiLanguage, 'review.playPronunciation')}
                  active={isPronunciationWordPlaying || isPronunciationWordDownloading}
                  style={[styles.pronunciationWordButton, styles.spellingPronunciationButton]}
                  pressedStyle={!isPronunciationPlaybackBusy ? styles.pronunciationButtonPressed : null}
                  idleBackgroundColor={palette.softButtonBg}
                  idleBorderColor={palette.softButtonBorder}
                  disabled={isPronunciationPlaybackBusy}
                  onPress={() => handlePlayQuestionPronunciation(question)}
                >
                  {isPronunciationWordDownloading ? (
                    <ActivityIndicator size="small" color={palette.optionCorrectBorder} />
                  ) : (
                    <Ionicons
                      name="volume-medium-outline"
                      size={40}
                      color={isPronunciationWordPlaying ? '#BFE7FF' : palette.primaryText}
                    />
                  )}
                </AnimatedGlowPressable>
                {answerQuickTranslation &&
                answerQuickTranslation !== '-' &&
                !(question.sentenceTranslation || '').trim() ? (
                  <View
                    style={[
                      styles.spellingTranslationPill,
                      { backgroundColor: palette.softButtonBg, borderColor: palette.softButtonBorder },
                    ]}
                  >
                    <Text style={[styles.spellingTranslationLabel, { color: palette.secondaryText }]}>
                      {tUI(uiLanguage, 'review.wordTranslation')}
                    </Text>
                    <Text style={[styles.spellingTranslationText, { color: palette.primaryText }]}>
                      {answerQuickTranslation}
                    </Text>
                  </View>
                ) : null}
                <TextInput
                  ref={(input) => {
                    spellingInputRefs.current.set(question.id, input);
                  }}
                  value={spellingDraft}
                  onChangeText={(value) => handleChangeSpellingDraft(question.id, value)}
                  placeholder={tUI(uiLanguage, 'review.spellingPlaceholder')}
                  placeholderTextColor={palette.secondaryText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={isSpellingQuestion && !selectedAnswer}
                  returnKeyType="done"
                  editable={!selectedAnswer}
                  onSubmitEditing={() => answerSpellingQuestion(question)}
                  style={[
                    styles.spellingInput,
                    {
                      backgroundColor: palette.optionBg,
                      borderColor: palette.optionBorder,
                      color: palette.primaryText,
                    },
                  ]}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.spellingSubmitButton,
                    {
                      backgroundColor: spellingDraft.trim() ? palette.nextButtonBg : palette.softButtonBg,
                      borderColor: spellingDraft.trim() ? palette.nextButtonBg : palette.softButtonBorder,
                    },
                    pressed && spellingDraft.trim() && !selectedAnswer ? styles.primaryButtonPressed : null,
                  ]}
                  disabled={!spellingDraft.trim() || Boolean(selectedAnswer)}
                  onPress={() => answerSpellingQuestion(question)}
                >
                  <Text style={[styles.spellingSubmitText, { color: spellingDraft.trim() ? palette.nextButtonText : palette.secondaryText }]}>
                    {tUI(uiLanguage, 'review.submitSpelling')}
                  </Text>
                </Pressable>
              </View>
            ) : isPronunciationQuestion ? (
              <View style={styles.pronunciationQuizPanel}>
                <AnimatedGlowPressable
                  accessibilityRole="button"
                  accessibilityLabel={tUI(uiLanguage, 'review.playPronunciation')}
                  active={isPronunciationWordPlaying || isPronunciationWordDownloading}
                  style={styles.pronunciationWordButton}
                  pressedStyle={!isPronunciationPlaybackBusy ? styles.pronunciationButtonPressed : null}
                  idleBackgroundColor={palette.softButtonBg}
                  idleBorderColor={palette.softButtonBorder}
                  disabled={isPronunciationPlaybackBusy}
                  onPress={() => handlePlayQuestionPronunciation(question)}
                >
                  {isPronunciationWordDownloading ? (
                    <ActivityIndicator size="small" color={palette.optionCorrectBorder} />
                  ) : (
                    <Ionicons
                      name="volume-medium-outline"
                      size={40}
                      color={isPronunciationWordPlaying ? '#BFE7FF' : palette.primaryText}
                    />
                  )}
                </AnimatedGlowPressable>
                <Text style={[styles.pronunciationQuizHint, { color: palette.secondaryText }]}>
                  {tUI(uiLanguage, 'review.pronunciationHint')}
                </Text>
                {typeof pronunciationScore === 'number' ? (
                  <Text style={[styles.pronunciationQuizScore, { color: pronunciationScore >= PRONUNCIATION_PASS_SCORE ? palette.successText : palette.errorText }]}>
                    {pronunciationScore}%
                  </Text>
                ) : null}
                {pronunciationError ? (
                  <Text style={[styles.pronunciationQuizError, { color: palette.errorText }]}>{pronunciationError}</Text>
                ) : null}
                <View
                  pointerEvents="none"
                  style={[
                    styles.pronunciationRecordingWaveRow,
                    !isPronunciationRecording ? styles.pronunciationRecordingWaveRowIdle : null,
                  ]}
                >
                  {pronunciationWaveValues.map((value, index) => (
                    <Animated.View
                      key={`record-wave-${question.id}-${index}`}
                      style={[
                        styles.pronunciationRecordingWaveBar,
                        {
                          height: value,
                          backgroundColor: '#4EAFF4',
                        },
                      ]}
                    />
                  ))}
                </View>
                <AnimatedGlowPressable
                  active={isPronunciationRecording}
                  style={styles.pronunciationQuizButton}
                  pressedStyle={!selectedAnswer && !isPronunciationAnalyzing ? styles.pronunciationButtonPressed : null}
                  idleBackgroundColor={palette.nextButtonBg}
                  idleBorderColor={palette.nextButtonBg}
                  disabled={Boolean(selectedAnswer) || isPronunciationAnalyzing}
                  onPress={() => void togglePronunciationQuestionRecording(question)}
                >
                  <Ionicons
                    name={isPronunciationAnalyzing ? 'hourglass-outline' : isPronunciationRecording ? 'stop' : 'mic'}
                    size={30}
                    color={isPronunciationRecording ? '#BFE7FF' : palette.nextButtonText}
                  />
                </AnimatedGlowPressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.pronunciationSkipButton,
                    { backgroundColor: palette.softButtonBg, borderColor: palette.softButtonBorder },
                    pressed && !selectedAnswer && !isPronunciationAnalyzing ? styles.secondaryButtonPressed : null,
                  ]}
                  disabled={Boolean(selectedAnswer) || isPronunciationAnalyzing}
                  onPress={() => void handleSkipPronunciationQuestion(question)}
                >
                  <Text style={[styles.pronunciationSkipText, { color: palette.secondaryText }]}>{tUI(uiLanguage, 'review.cantSpeakNow')}</Text>
                </Pressable>
              </View>
            ) : (
            <View style={[styles.optionsGrid, shouldStackOptions ? styles.optionsGridStacked : null]}>
              {question.options.map((option) => {
                const wasChosen = selectedAnswer === option;
                const isCorrectOption = option === question.correctAnswer;
                const hasAnswered = Boolean(selectedAnswer);
                const optionLabel = isPartOfSpeechQuestion
                  ? formatPartOfSpeechLabel(option, uiLanguage)
                  : option;
                const keepOptionSingleLine =
                  !isTranslationOptionQuestion(question.questionType) &&
                  !/\s/.test(optionLabel.trim());
                return (
                  <Pressable
                    key={option}
                    style={({ pressed }) => [
                      styles.optionCard,
                      shouldStackOptions ? styles.optionCardStacked : null,
                      hasVeryLongOptions ? styles.optionCardVeryLong : null,
                      { backgroundColor: palette.optionBg, borderColor: palette.optionBorder },
                      hasAnswered ? { borderColor: palette.optionAnsweredBorder } : null,
                      hasAnswered && isCorrectOption
                        ? { backgroundColor: palette.optionCorrectBg, borderColor: palette.optionCorrectBorder }
                        : null,
                      hasAnswered && wasChosen && !isCorrectOption
                        ? { backgroundColor: palette.optionWrongBg, borderColor: palette.optionWrongBorder }
                        : null,
                      hasAnswered && !wasChosen && !isCorrectOption ? styles.optionCardDisabled : null,
                      pressed && !hasAnswered ? styles.optionCardPressed : null,
                    ]}
                    disabled={hasAnswered}
                    onPress={() => answerQuestion(question, option)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        shouldStackOptions ? styles.optionTextStacked : null,
                        hasVeryLongOptions ? styles.optionTextVeryLong : null,
                        { color: palette.primaryText },
                      ]}
                      numberOfLines={keepOptionSingleLine ? 1 : 2}
                      ellipsizeMode="tail"
                      adjustsFontSizeToFit
                      minimumFontScale={keepOptionSingleLine ? 0.38 : shouldStackOptions ? 0.36 : 0.56}
                    >
                      {optionLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            )}
            </KeyboardAvoidingView>
          </Animated.View>

          <Animated.View
            pointerEvents={selectedAnswer ? 'auto' : 'none'}
            style={[
              styles.cardFace,
              styles.backFace,
              { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
              {
                transform: [{ perspective: 1200 }, { rotateY: backRotate }],
              },
            ]}
          >
            {isCorrect ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.celebrationOverlay,
                  { opacity: celebrationOverlayOpacity, backgroundColor: palette.celebrationOverlay },
                ]}
              />
            ) : null}
            {isPronunciationQuestion ? (
              renderPronunciationResult()
            ) : (
            <ScrollView
              style={styles.answerContentScroll}
              contentContainerStyle={styles.answerContentContainer}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              bounces={false}
            >
            {!isCorrect && selectedAnswer ? (
              <View style={styles.answerComparisonStack}>
                <View
                  style={[
                    styles.answerComparisonCard,
                    styles.answerComparisonTopCard,
                    { backgroundColor: palette.answerCardBg, borderColor: palette.answerCardBorder },
                  ]}
                >
                  <View style={styles.answerCompactHeader}>
                    <View style={styles.answerPreviewWordWrap}>
                      <View style={styles.answerStatusRow}>
                        <View style={[styles.correctAnswerTag, { backgroundColor: palette.optionCorrectBg, borderColor: palette.optionCorrectBorder }]}>
                          <Text style={[styles.correctAnswerTagText, { color: palette.optionCorrectBorder }]}>
                            {tUI(uiLanguage, 'review.answer')}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.answerWord,
                          isLongAnswer ? styles.answerWordLong : null,
                          { color: palette.primaryText },
                        ]}
                        numberOfLines={isLongAnswer ? 2 : 1}
                        ellipsizeMode="tail"
                        adjustsFontSizeToFit
                        minimumFontScale={isLongAnswer ? 0.5 : 0.68}
                      >
                        {question.answerWord}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.answerQuickTranslation, { color: palette.primaryText }]}
                  >
                    {answerQuickTranslation}
                  </Text>
                </View>

                <View
                  style={[
                    styles.answerComparisonCard,
                    styles.answerComparisonBottomCard,
                    { backgroundColor: palette.answerCardBg, borderColor: palette.answerCardBorder },
                  ]}
                >
                  <View style={styles.answerStatusRow}>
                    <View style={[styles.wrongAnswerTag, { backgroundColor: palette.errorTint, borderColor: palette.errorText }]}>
                      <Ionicons name="close" size={12} color={palette.errorText} />
                      <Text style={[styles.wrongAnswerTagText, { color: palette.errorText }]}>
                        {tUI(uiLanguage, 'review.yourAnswer')}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.answerComparisonValue,
                      selectedAnswerIsLong ? styles.answerComparisonValueLong : null,
                      { color: palette.primaryText },
                    ]}
                    numberOfLines={selectedAnswerIsLong ? 2 : 1}
                    ellipsizeMode="tail"
                    adjustsFontSizeToFit
                    minimumFontScale={selectedAnswerIsLong ? 0.5 : 0.68}
                  >
                    {selectedAnswerLabel}
                  </Text>
                  {shouldShowSelectedAnswerTranslation ? (
                    <Text style={[styles.answerWrongTranslation, { color: palette.secondaryText }]}>
                      {selectedAnswerTranslation}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.answerCompactCard,
                  { backgroundColor: palette.answerCardBg, borderColor: palette.answerCardBorder },
                ]}
              >
                <View style={styles.answerCompactHeader}>
                  <View style={styles.answerPreviewWordWrap}>
                    <View style={styles.answerStatusRow}>
                      <View style={[styles.correctAnswerTag, { backgroundColor: palette.successTint, borderColor: palette.successText }]}>
                        <Text style={[styles.correctAnswerTagText, { color: palette.successText }]}>
                          {tUI(uiLanguage, 'review.correct')}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.answerWord,
                        isLongAnswer ? styles.answerWordLong : null,
                        { color: palette.primaryText },
                      ]}
                      numberOfLines={isLongAnswer ? 2 : 1}
                      ellipsizeMode="tail"
                      adjustsFontSizeToFit
                      minimumFontScale={isLongAnswer ? 0.5 : 0.68}
                    >
                      {question.answerWord}
                    </Text>
                  </View>
                  <View style={styles.resultBadgeRow}>
                    {isCorrect ? (
                      <Animated.View
                        style={[
                          styles.celebrationSpark,
                          {
                            opacity: celebrationIconOpacity,
                            transform: [{ translateY: celebrationFloat }, { scale: celebrationScale }],
                          },
                        ]}
                      >
                        <Ionicons name="sparkles" size={16} color={palette.celebrationIcon} />
                      </Animated.View>
                    ) : null}
                  </View>
                </View>
                <Text
                  style={[styles.answerQuickTranslation, { color: palette.primaryText }]}
                >
                  {answerQuickTranslation}
                </Text>
              </View>
            )}
            </ScrollView>
            )}

            <View style={styles.answerActionFooter}>
              <Pressable
                style={({ pressed }) => [
                  styles.nextTimeButton,
                  { backgroundColor: palette.nextTimeBg, borderColor: palette.nextTimeBorder },
                  isPinned
                    ? { backgroundColor: palette.nextTimeActiveBg, borderColor: palette.nextTimeActiveBorder }
                    : null,
                  pressed ? styles.secondaryButtonPressed : null,
                ]}
                onPress={() => void handleTogglePinned(question.cardId)}
              >
                <Ionicons
                  name={isPinned ? 'bookmark' : 'bookmark-outline'}
                  size={16}
                  color={palette.nextTimeText}
                />
                <Text style={[styles.nextTimeText, { color: palette.nextTimeText }, isPinned && styles.nextTimeTextActive]}>
                  {tUI(uiLanguage, 'review.testMeNextTime')}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.nextButton,
                  { backgroundColor: palette.nextButtonBg },
                  pressed ? styles.primaryButtonPressed : null,
                ]}
                onPress={handleNext}
              >
                <Text style={[styles.nextButtonText, { color: palette.nextButtonText }]}>{tUI(uiLanguage, 'review.next')}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </View>
    );
  }, [
    answerQuestion,
    answerSpellingQuestion,
    getPronunciationWaveValues,
    handleChangeSpellingDraft,
    handleSkipPronunciationQuestion,
    handleNext,
    handlePlayQuestionPronunciation,
    handleReloadQuestionIpa,
    handleTogglePinned,
    palette,
    pinnedCardIds,
    pronunciationAnalyzingQuestionId,
    pronunciationDownloadTarget,
    pronunciationErrors,
    pronunciationPhonemes,
    recoveredPronunciationIpa,
    pronunciationIpaLookupErrors,
    pronunciationIpaLookupQuestionId,
    pronunciationPlaybackTarget,
    pronunciationRecordingQuestionId,
    pronunciationScores,
    results,
    selectedAnswers,
    spellingDrafts,
    togglePronunciationQuestionRecording,
    uiLanguage,
    width,
  ]);

  const handleDone = React.useCallback(async () => {
    const completedQuestions = questions.filter(
      (question) =>
        Boolean(selectedAnswers[question.id]) &&
        !skippedQuestionIds.has(question.id)
    );
    const completedCardIds = Array.from(
      new Set(completedQuestions.map((question) => question.cardId))
    );

    await Promise.all(completedCardIds.map((cardId) => markCardAsQuizReviewed(cardId)));
    analytics.track('review_completed', {
      question_count: completedQuestions.length,
      correct_count: correctCount,
      skipped_count: skippedQuestionIds.size,
      is_tutorial: isDefaultExperienceTutorial,
    });
    if (
      shouldOpenReviewCompletionPaywall({
        isTutorial: isDefaultExperienceTutorial,
        isScreenshotDemo: isScreenshotDemoQuiz,
      })
    ) {
      tabSwipeContext?.openMembershipPaywall({ source: 'review' });
      navigation.goBack();
      return;
    }

    if (isDefaultExperienceTutorial) {
      const userId = await getCurrentSessionUserId();
      if (userId) await completeDefaultExperienceQuizHint(userId);
      traceFirstRun('tutorial', 'quiz_confirmed');
      DeviceEventEmitter.emit(
        DEFAULT_EXPERIENCE_TUTORIAL_COMPLETED_EVENT
      );
      navigation.goBack();
      return;
    }
    void AppReviewService.recordCompletedQuiz(completedQuestions.length);
    navigation.goBack();
  }, [
    isDefaultExperienceTutorial,
    isScreenshotDemoQuiz,
    navigation,
    correctCount,
    questions,
    selectedAnswers,
    skippedQuestionIds,
    tabSwipeContext,
  ]);

  const renderSummaryCard = React.useCallback(() => {
    const total = scoredQuestionCount;
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const summaryTone =
      percentage >= 90
        ? { message: tUI(uiLanguage, 'review.summaryOutstanding'), color: '#4EAFF4' }
        : percentage <= 50
          ? { message: tUI(uiLanguage, 'review.summaryGoodEffort'), color: '#FF6B6B' }
          : { message: tUI(uiLanguage, 'review.summaryGreatJob'), color: palette.primaryText };

    return (
      <View style={[styles.slide, { width }]}>
        <View
          style={[
            styles.cardShell,
            styles.summaryShell,
            { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
          ]}
        >
          <Text style={[styles.summaryScore, { color: palette.primaryText }]}>{correctCount}/{total}</Text>
          <Text style={[styles.summaryPercent, { color: summaryTone.color }]}>{percentage}% {tUI(uiLanguage, 'review.percentCorrect')}</Text>
          <Text style={[styles.summaryBody, { color: palette.secondaryText }]}>{summaryTone.message}</Text>
          {skippedCount > 0 ? (
            <Text style={[styles.summarySkipped, { color: palette.secondaryText }]}>
              {skippedCount} {tUI(uiLanguage, 'review.skippedPronunciation')}
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.summarySecondaryButton,
              { backgroundColor: palette.summarySecondaryBg, borderColor: palette.summarySecondaryBorder },
              pressed ? styles.primaryButtonPressed : null,
            ]}
            onPress={handleReplay}
          >
            <Text style={[styles.summarySecondaryText, { color: palette.summarySecondaryText }]}>{tUI(uiLanguage, 'review.playAgain')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.summaryPrimaryButton,
              { backgroundColor: palette.nextButtonBg },
              pressed ? styles.primaryButtonPressed : null,
            ]}
            onPress={() => {
              void handleDone();
            }}
          >
            <Text style={[styles.summaryPrimaryText, { color: palette.nextButtonText }]}>{tUI(uiLanguage, 'review.done')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }, [correctCount, handleDone, handleReplay, palette.cardBg, palette.cardBorder, palette.nextButtonBg, palette.nextButtonText, palette.primaryText, palette.secondaryText, palette.summarySecondaryBg, palette.summarySecondaryBorder, palette.summarySecondaryText, scoredQuestionCount, skippedCount, uiLanguage, width]);

  const renderItem = React.useCallback(
    ({ item }: { item: ReviewSlide }) => {
      if (item.type === 'summary') {
        return renderSummaryCard();
      }
      return renderQuestionCard(item.question);
    },
    [renderQuestionCard, renderSummaryCard]
  );

  const handleMomentumEnd = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(nextIndex);
  }, [width]);

  const headerProgressLabel =
    currentIndex >= questions.length
      ? tUI(uiLanguage, 'review.finalScore')
      : `${tUI(uiLanguage, 'review.cardProgress')} ${Math.min(currentIndex + 1, questions.length)} / ${questions.length}`;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.screenBg }]} edges={['top']}>
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={palette.primaryText} />
          <Text style={[styles.centerStateText, { color: palette.primaryText }]}>{tUI(uiLanguage, 'review.preparing')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (reviewSetupError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.screenBg }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: palette.softButtonBg, borderColor: palette.softButtonBorder },
              pressed ? styles.iconButtonPressed : null,
            ]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={22} color={palette.primaryText} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: palette.primaryText }]}>{albumName}</Text>
            <Text style={[styles.headerSubTitle, { color: palette.secondaryText }]}>
              {tUI(uiLanguage, 'review.prepareFailedTitle')}
            </Text>
          </View>
        </View>
        <View style={styles.centerState}>
          <Text style={[styles.centerStateText, { color: palette.primaryText }]}>
            {tUI(uiLanguage, 'review.prepareFailedBody')}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.centerStatePrimaryButton,
              { backgroundColor: palette.nextButtonBg },
              pressed ? styles.primaryButtonPressed : null,
            ]}
            onPress={() => {
              void buildSession();
            }}
          >
            <Text style={[styles.centerStatePrimaryButtonText, { color: palette.nextButtonText }]}>
              {tUI(uiLanguage, 'create.retry')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!questions.length) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.screenBg }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: palette.softButtonBg, borderColor: palette.softButtonBorder },
              pressed ? styles.iconButtonPressed : null,
            ]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={22} color={palette.primaryText} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: palette.primaryText }]}>{albumName}</Text>
            <Text style={[styles.headerSubTitle, { color: palette.secondaryText }]}>{tUI(uiLanguage, 'review.noCardsTitle')}</Text>
          </View>
        </View>
        <View style={styles.centerState}>
          <Text style={[styles.centerStateText, { color: palette.primaryText }]}>{tUI(uiLanguage, 'review.noCardsBody')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.screenBg }]} edges={['top']}>
      <View style={styles.keyboardAvoider}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: palette.softButtonBg, borderColor: palette.softButtonBorder },
              pressed ? styles.iconButtonPressed : null,
            ]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={22} color={palette.primaryText} />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: palette.primaryText }]}>{albumName}</Text>
            <Text style={[styles.headerSubTitle, { color: palette.secondaryText }]}>{headerProgressLabel}</Text>
          </View>

          <View style={[styles.scoreChip, { backgroundColor: palette.softButtonBg, borderColor: palette.softButtonBorder }]}>
            <Text style={[styles.scoreChipText, { color: palette.primaryText }]}>{correctCount}</Text>
          </View>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: palette.progressTrack }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${((Math.min(currentIndex, questions.length - 1) + 1) / questions.length) * 100}%`, backgroundColor: themeColor },
            ]}
          />
        </View>

        <FlatList
          ref={listRef}
          data={slides}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={renderItem}
          onMomentumScrollEnd={handleMomentumEnd}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          removeClippedSubviews={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoider: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubTitle: {
    marginTop: 2,
    color: '#9AA2AF',
    fontSize: 13,
    fontWeight: '600',
  },
  scoreChip: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreChipText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  progressTrack: {
    height: 4,
    marginHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
  },
  cardShell: {
    flex: 1,
    position: 'relative',
  },
  cardFace: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    backfaceVisibility: 'hidden',
  },
  questionContentAvoider: {
    flex: 1,
    justifyContent: 'space-between',
  },
  backFace: {
    justifyContent: 'flex-start',
  },
  answerContentScroll: {
    flex: 1,
    minHeight: 0,
  },
  answerContentContainer: {
    paddingBottom: 12,
  },
  answerActionFooter: {
    flexShrink: 0,
    paddingTop: 12,
  },
  questionEyebrow: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  sentenceText: {
    color: '#F8FAFC',
    fontSize: 31,
    lineHeight: 40,
    fontWeight: '700',
    marginTop: 18,
    flex: 1,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionsGridStacked: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    gap: 10,
  },
  optionCard: {
    width: '48%',
    minHeight: 112,
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  optionCardStacked: {
    width: '100%',
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  optionCardVeryLong: {
    minHeight: 68,
    paddingVertical: 10,
  },
  optionCardAnswered: {},
  optionCardCorrect: {},
  optionCardWrong: {},
  optionCardDisabled: {
    opacity: 0.56,
  },
  optionText: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    maxWidth: '100%',
    textAlign: 'center',
  },
  optionTextStacked: {
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'center',
  },
  optionTextVeryLong: {
    fontSize: 15,
    lineHeight: 19,
  },
  spellingPanel: {
    gap: 12,
    marginTop: 'auto',
  },
  spellingPronunciationButton: {
    alignSelf: 'center',
  },
  spellingTranslationPill: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  spellingTranslationLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  spellingTranslationText: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '900',
  },
  spellingInput: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    fontSize: 19,
    fontWeight: '800',
  },
  spellingSubmitButton: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spellingSubmitText: {
    fontSize: 16,
    fontWeight: '900',
  },
  pronunciationQuizPanel: {
    flexShrink: 1,
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 0,
  },
  pronunciationWordButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pronunciationQuizHint: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  pronunciationQuizScore: {
    fontSize: 54,
    lineHeight: 60,
    fontWeight: '900',
    textAlign: 'center',
  },
  pronunciationQuizError: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  pronunciationQuizButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#00E5FF',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  pronunciationQuizButtonRecording: {
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.48,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  pronunciationButtonActive: {
    backgroundColor: 'rgba(28,62,99,0.92)',
    borderColor: '#4EAFF4',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  pronunciationButtonPressed: {
    opacity: 0.9,
    borderColor: '#4EAFF4',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  pronunciationQuizButtonText: {
    fontSize: 17,
    fontWeight: '900',
  },
  pronunciationRecordingWaveRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginVertical: 2,
  },
  pronunciationRecordingWaveRowIdle: {
    opacity: 0,
  },
  pronunciationRecordingWaveBar: {
    width: 5,
    borderRadius: 999,
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.36,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  pronunciationSkipButton: {
    minHeight: 44,
    width: '86%',
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pronunciationSkipText: {
    fontSize: 15,
    fontWeight: '800',
  },
  pronunciationResultContent: {
    flex: 1,
    minHeight: 0,
    gap: 10,
    alignItems: 'center',
    width: '100%',
  },
  pronunciationResultTag: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pronunciationResultTagText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  pronunciationResultWord: {
    alignSelf: 'stretch',
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '900',
  },
  pronunciationResultTranslation: {
    alignSelf: 'stretch',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  pronunciationResultScore: {
    alignSelf: 'stretch',
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '900',
  },
  pronunciationAnswerWordButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pronunciationIpaRecovery: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 9,
  },
  pronunciationIpaRecoveryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  pronunciationIpaRecoveryButton: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
  },
  pronunciationIpaRecoveryButtonText: {
    fontSize: 14,
    fontWeight: '900',
  },
  pronunciationAnswerWaveRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  pronunciationAnswerWaveBar: {
    width: 5,
    borderRadius: 999,
    opacity: 0.86,
  },
  resultBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  resultBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resultBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  answerTitle: {
    marginTop: 22,
    color: '#F8FAFC',
    fontSize: 16,
    letterSpacing: 0.4,
    fontWeight: '800',
  },
  answerSubTitle: {
    marginTop: 8,
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  answerSentenceBlock: {
    gap: 6,
    marginBottom: 14,
  },
  fillBlankSentenceBlock: {
    gap: 10,
    marginBottom: 4,
  },
  fillBlankSentenceText: {
    flex: 0,
    marginTop: 20,
    fontSize: 25,
    lineHeight: 33,
  },
  answerSentenceLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  fillBlankTranslationText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
  },
  answerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  correctAnswerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  correctAnswerTagText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  wrongAnswerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  wrongAnswerTagText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  answerFullSentence: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '800',
  },
  answerTranslatedSentence: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  answerVocabCard: {
    marginTop: 2,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },
  answerPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  answerCompactCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 12,
  },
  answerComparisonStack: {
    width: '100%',
    gap: 12,
  },
  answerComparisonCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 10,
  },
  answerComparisonTopCard: {
    marginTop: 2,
  },
  answerComparisonBottomCard: {
    opacity: 0.96,
  },
  answerCompactHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  answerPreviewWordWrap: {
    flex: 1,
  },
  answerPronounceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerWord: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  answerWordLong: {
    fontSize: 22,
    lineHeight: 27,
  },
  answerPos: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  answerDefinition: {
    color: '#F8FAFC',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  answerQuickTranslation: {
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '800',
  },
  answerComparisonValue: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
  },
  answerComparisonValueLong: {
    fontSize: 18,
    lineHeight: 24,
  },
  answerWrongTranslation: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  answerSentence: {
    marginTop: 2,
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  nextTimeButton: {
    marginTop: 0,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextTimeButtonActive: {},
  nextTimeText: {
    fontSize: 15,
    fontWeight: '800',
  },
  nextTimeTextActive: {
  },
  celebrationSpark: {
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
  },
  nextButton: {
    marginTop: 12,
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    fontSize: 17,
    fontWeight: '800',
  },
  summaryShell: {
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 26,
    paddingVertical: 28,
    justifyContent: 'center',
  },
  summaryEyebrow: {
    color: '#727985',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  summaryScore: {
    marginTop: 18,
    fontSize: 72,
    fontWeight: '900',
  },
  summaryPercent: {
    marginTop: 8,
    color: '#1C3E63',
    fontSize: 24,
    fontWeight: '800',
  },
  summaryBody: {
    marginTop: 18,
    fontSize: 16,
    lineHeight: 24,
  },
  summarySkipped: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  summaryPrimaryButton: {
    marginTop: 28,
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryPrimaryText: {
    fontSize: 17,
    fontWeight: '800',
  },
  summarySecondaryButton: {
    marginTop: 12,
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summarySecondaryText: {
    fontSize: 17,
    fontWeight: '800',
  },
  primaryButtonPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  secondaryButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  optionCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  iconButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  centerState: {
    flex: 1,
    gap: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStateText: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '600',
    textAlign: 'center',
  },
  centerStatePrimaryButton: {
    marginTop: 8,
    minHeight: 52,
    minWidth: 156,
    borderRadius: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStatePrimaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
