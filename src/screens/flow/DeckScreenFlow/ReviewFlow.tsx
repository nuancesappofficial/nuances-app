import React from 'react';
import {
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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
import { assessPronunciationCloud } from '@services/pronunciation/cloudCoach';
import { speakEnglishNaturally } from '@services/tts/localSpeech';
import { parseCardContextSections } from '../../../features/cards/cardContextSections';
import { resolveThemeColors } from '../../../theme/colors';
import {
  DEFAULT_REVIEW_QUESTION_TYPES,
  loadAlbumReviewPreferences,
  type ReviewQuestionType,
  saveAlbumReviewPreferences,
} from '../../../features/deck/reviewPreferences';
import { markCardAsQuizReviewed } from '../../../features/deck/cardDetailSeen';

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
    };
  };
};

type ReviewQuestion = {
  id: string;
  cardId: string;
  questionType: ReviewQuestionType;
  prompt: string;
  correctAnswer: string;
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

function looksLikeEnglishAnswer(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[A-Za-z][A-Za-z0-9\s'’\-.,!?/()]*$/.test(trimmed);
}

function pickEnglishAnswer(card: Card): string {
  const candidates = [card.targetWord, card.targetPhrase]
    .map((value) => (value || '').trim())
    .filter(Boolean)
    .filter(looksLikeEnglishAnswer);

  return candidates[0] || '-';
}

function pickDisplayAnswer(card: Card): string {
  return pickEnglishAnswer(card);
}

function pickDefinitionText(card: Card): string {
  const definition = (card.definition || '').trim();
  if (definition) return definition;
  const contextual = (card.contextualExplanation || '').trim();
  if (contextual) return contextual;
  return (card.originalSentence || '').trim() || '-';
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickFillBlankSentence(card: Card): string {
  const target = (card.targetPhrase || card.targetWord || '').trim();
  const contextSections = parseCardContextSections({
    raw: card.contextualExplanation,
    displayWord: target,
    definition: card.definition,
    sourceSentence: card.originalSentence,
  });
  const candidates = [
    contextSections.exampleSentence,
    card.originalSentence,
  ]
    .map((value) => (value || '').trim())
    .filter(Boolean);

  if (!target) return candidates[0] || '';

  const targetMatcher = new RegExp(escapeRegex(target), 'i');
  return candidates.find((sentence) => targetMatcher.test(sentence)) || candidates[0] || '';
}

function buildMaskedSentence(card: Card): string {
  const target = (card.targetPhrase || card.targetWord || '').trim();
  const baseSentence = pickFillBlankSentence(card);

  if (!baseSentence) {
    return `_____`;
  }

  if (!target) {
    return baseSentence;
  }

  const matcher = new RegExp(escapeRegex(target), 'i');
  if (matcher.test(baseSentence)) {
    return baseSentence.replace(matcher, '_____');
  }

  return `${baseSentence}\n\nMissing word: _____`;
}

function quoteTargetInText(text: string, target: string): string {
  const trimmedText = (text || '').trim();
  const trimmedTarget = (target || '').trim();
  if (!trimmedText || !trimmedTarget) return trimmedText;

  const hasCjk = /[\u3040-\u30ff\u3400-\u9fff]/.test(trimmedText);
  const [openQuote, closeQuote] = hasCjk ? ['「', '」'] : ['“', '”'];
  const bracketMatcher = new RegExp(`\\[\\s*${escapeRegex(trimmedTarget)}\\s*\\]`, 'i');
  if (bracketMatcher.test(trimmedText)) {
    return trimmedText.replace(bracketMatcher, `${openQuote}${trimmedTarget}${closeQuote}`);
  }
  const genericBracketMatcher = /\[\s*([^\]]+?)\s*\]/;
  if (genericBracketMatcher.test(trimmedText)) {
    return trimmedText.replace(genericBracketMatcher, (_match, bracketedTarget: string) => {
      return `${openQuote}${String(bracketedTarget).trim()}${closeQuote}`;
    });
  }

  const targetMatcher = new RegExp(escapeRegex(trimmedTarget), 'i');
  if (!targetMatcher.test(trimmedText)) return trimmedText;
  return trimmedText.replace(targetMatcher, (match) => `${openQuote}${match}${closeQuote}`);
}

function normalizeAnswerTranslation(raw: string, fullSentence: string, target: string, fallback: string): string {
  const quotedFullSentence = quoteTargetInText(fullSentence, target);
  const normalizedFullSentence = fullSentence.trim().toLowerCase();
  const normalizedQuotedFullSentence = quotedFullSentence.trim().toLowerCase();
  const lines = (raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalizedLine = line.toLowerCase();
      return normalizedLine !== normalizedFullSentence && normalizedLine !== normalizedQuotedFullSentence;
    });
  const translation = lines.join('\n').trim() || fallback.trim() || '-';
  return quoteTargetInText(translation, target);
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
  const fullSentence = pickFillBlankSentence(card) || (card.originalSentence || '').trim() || '-';
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

function buildOptionPool(allCards: Card[], currentCard: Card): string[] {
  const correct = pickDisplayAnswer(currentCard).toLowerCase();
  const seen = new Set<string>();
  const pool: string[] = [];

  allCards.forEach((card) => {
    const candidates = [card.targetWord, card.targetPhrase];
    candidates.forEach((candidate) => {
      const value = (candidate || '').trim();
      if (!value) return;
      if (!looksLikeEnglishAnswer(value)) return;
      const key = value.toLowerCase();
      if (key === correct || seen.has(key)) return;
      seen.add(key);
      pool.push(value);
    });
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

function buildPartOfSpeechOptionPool(allCards: Card[], currentCard: Card): string[] {
  const correct = ((currentCard.partOfSpeech || 'word').trim() || 'word').toLowerCase();
  const seen = new Set<string>([correct]);
  const pool: string[] = [];

  allCards.forEach((card) => {
    const value = ((card.partOfSpeech || 'word').trim() || 'word');
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pool.push(value);
  });

  const fallback = ['noun', 'verb', 'adjective', 'adverb', 'phrase'];
  fallback.forEach((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pool.push(value);
  });

  return shuffleArray(pool);
}

function buildReviewQuestions(
  sourceCards: Card[],
  allCards: Card[],
  questionCount: number,
  pinnedCardIds: string[],
  skippedPronunciationCardIds: string[],
  selectedQuestionTypes: ReviewQuestionType[]
): ReviewQuestion[] {
  const sourceById = new Map(sourceCards.map((card) => [card.id, card] as const));
  const skippedPronunciationCards = skippedPronunciationCardIds
    .map((id) => sourceById.get(id))
    .filter((card): card is Card => Boolean(card));
  const skippedPronunciationSet = new Set(skippedPronunciationCards.map((card) => card.id));
  const pinnedCards = pinnedCardIds
    .map((id) => sourceById.get(id))
    .filter((card): card is Card => Boolean(card && !skippedPronunciationSet.has(card.id)));
  const pinnedSet = new Set([...pinnedCards.map((card) => card.id), ...skippedPronunciationSet]);
  const randomPool = shuffleArray(sourceCards.filter((card) => !pinnedSet.has(card.id)));
  const baseQuestionCount = Math.min(
    Math.max(0, sourceCards.length - skippedPronunciationCards.length),
    Math.max(questionCount, pinnedCards.length)
  );
  const selected = [...skippedPronunciationCards, ...[...pinnedCards, ...randomPool].slice(0, baseQuestionCount)].slice(
    0,
    sourceCards.length
  );

  const questionTypes = DEFAULT_REVIEW_QUESTION_TYPES;

  return selected.map((card, index) => {
    const word = pickDisplayAnswer(card);
    const definition = pickDefinitionText(card);
    const partOfSpeech = (card.partOfSpeech || 'word').trim();
    const sourceSentence = (card.originalSentence || card.definition || '').trim();
    const contextualExplanation = (card.contextualExplanation || '').trim();
    const maskedSentence = buildMaskedSentence(card);
    const answerDetail = buildAnswerDetailText(card);

    const questionType: ReviewQuestion['questionType'] = skippedPronunciationSet.has(card.id)
      ? 'pronunciation'
      : questionTypes[index % questionTypes.length];

    if (questionType === 'translation_to_word') {
      const distractors = buildOptionPool(allCards, card).slice(0, 3);
      while (distractors.length < 3) {
        distractors.push(`${word} ${distractors.length + 1}`);
      }
      return {
        id: card.id,
        cardId: card.id,
        questionType,
        prompt: 'Choose the correct word',
        correctAnswer: word,
        options: shuffleArray([word, ...distractors]),
        sentence: definition,
        sourceSentence,
        partOfSpeech,
        definition,
        contextualExplanation,
        ...answerDetail,
      };
    }

    if (questionType === 'word_to_translation') {
      const distractors = buildDefinitionOptionPool(allCards, card).slice(0, 3);
      while (distractors.length < 3) {
        distractors.push(`${definition} (${distractors.length + 1})`);
      }
      return {
        id: card.id,
        cardId: card.id,
        questionType,
        prompt: 'Choose the correct translation',
        correctAnswer: definition,
        options: shuffleArray([definition, ...distractors]),
        sentence: word,
        sourceSentence,
        partOfSpeech,
        definition,
        contextualExplanation,
        ...answerDetail,
      };
    }

    if (questionType === 'sentence_to_translation') {
      const distractors = buildDefinitionOptionPool(allCards, card).slice(0, 3);
      while (distractors.length < 3) {
        distractors.push(`${definition} (${distractors.length + 1})`);
      }
      return {
        id: card.id,
        cardId: card.id,
        questionType,
        prompt: 'Choose the meaning used in this sentence',
        correctAnswer: definition,
        options: shuffleArray([definition, ...distractors]),
        sentence: sourceSentence || maskedSentence,
        sourceSentence,
        partOfSpeech,
        definition,
        contextualExplanation,
        ...answerDetail,
      };
    }

    if (questionType === 'part_of_speech') {
      const correctPartOfSpeech = partOfSpeech || 'word';
      const distractors = buildPartOfSpeechOptionPool(allCards, card)
        .filter((value) => value.toLowerCase() !== correctPartOfSpeech.toLowerCase())
        .slice(0, 3);
      while (distractors.length < 3) {
        distractors.push(`type ${distractors.length + 1}`);
      }
      return {
        id: card.id,
        cardId: card.id,
        questionType,
        prompt: 'Choose the correct part of speech',
        correctAnswer: correctPartOfSpeech,
        options: shuffleArray([correctPartOfSpeech, ...distractors]),
        sentence: word,
        sourceSentence,
        partOfSpeech,
        definition,
        contextualExplanation,
        ...answerDetail,
      };
    }

    if (questionType === 'pronunciation') {
      return {
        id: card.id,
        cardId: card.id,
        questionType,
        prompt: `Pronounce the word (${PRONUNCIATION_PASS_SCORE}%+ to pass)`,
        correctAnswer: word,
        options: [],
        sentence: word,
        sourceSentence,
        partOfSpeech,
        definition,
        contextualExplanation,
        ...answerDetail,
      };
    }

    const distractors = buildOptionPool(allCards, card).slice(0, 3);
    while (distractors.length < 3) {
      distractors.push(`${word} ${distractors.length + 1}`);
    }
    return {
      id: card.id,
      cardId: card.id,
      questionType,
      prompt: (card.partOfSpeech || 'word').trim(),
      correctAnswer: word,
      options: shuffleArray([word, ...distractors]),
      sentence: maskedSentence,
      sourceSentence,
      partOfSpeech,
      definition: (card.definition || '').trim(),
      contextualExplanation,
      ...answerDetail,
    };
  });
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
  const theme = resolveThemeColors(colorScheme);
  const isLightMode = colorScheme === 'light';
  const albumId = route.params?.albumId || 'all-cards';
  const albumName = route.params?.albumName || 'Review';
  const requestedQuestionCount = route.params?.questionCount;
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
            successTint: 'rgba(78,175,244,0.16)',
            errorTint: 'rgba(255,107,107,0.14)',
            successText: '#4EAFF4',
            errorText: '#FF6B6B',
            celebrationIcon: '#4EAFF4',
            celebrationOverlay: 'rgba(78,175,244,0.12)',
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
            optionCorrectBg: 'rgba(52,211,153,0.22)',
            optionCorrectBorder: '#34D399',
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
            successTint: 'rgba(78,175,244,0.18)',
            errorTint: 'rgba(255,107,107,0.15)',
            successText: '#4EAFF4',
            errorText: '#FF6B6B',
            celebrationIcon: '#E8FFF5',
            celebrationOverlay: 'rgba(78,175,244,0.18)',
          },
    [isLightMode, theme]
  );

  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [questions, setQuestions] = React.useState<ReviewQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({});
  const [results, setResults] = React.useState<Record<string, boolean>>({});
  const [skippedQuestionIds, setSkippedQuestionIds] = React.useState<Set<string>>(() => new Set());
  const [pinnedCardIds, setPinnedCardIds] = React.useState<string[]>([]);
  const [skippedPronunciationCardIds, setSkippedPronunciationCardIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pronunciationRecordingQuestionId, setPronunciationRecordingQuestionId] = React.useState<string | null>(null);
  const [pronunciationAnalyzingQuestionId, setPronunciationAnalyzingQuestionId] = React.useState<string | null>(null);
  const [pronunciationPlaybackQuestionId, setPronunciationPlaybackQuestionId] = React.useState<string | null>(null);
  const [pronunciationScores, setPronunciationScores] = React.useState<Record<string, number>>({});
  const [pronunciationErrors, setPronunciationErrors] = React.useState<Record<string, string>>({});
  const listRef = React.useRef<FlatList<ReviewSlide> | null>(null);
  const flipValuesRef = React.useRef<Map<string, Animated.Value>>(new Map());
  const celebrationValuesRef = React.useRef<Map<string, Animated.Value>>(new Map());
  const pronunciationRecordingRef = React.useRef<any | null>(null);
  const pronunciationRecordingStartedAtRef = React.useRef<number>(0);

  React.useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const loadCards = async () => {
      try {
        const data = await queryCards.fetch();
        setAllCards(data);
      } catch (error) {
        console.error('[ReviewFlow] load cards failed:', error);
        setAllCards([]);
      }
    };

    void loadCards();
    const sub = queryCards.observe().subscribe((data) => setAllCards(data));
    return () => sub.unsubscribe();
  }, []);

  const sourceCards = React.useMemo(() => {
    if (!routeCardIds.length) return allCards;
    const allowed = new Set(routeCardIds);
    return routeCardIds
      .map((id) => allCards.find((card) => card.id === id) || null)
      .filter((card): card is Card => Boolean(card && allowed.has(card.id)));
  }, [allCards, routeCardIds]);

  const buildSession = React.useCallback(async () => {
    setLoading(true);
    const prefs = await loadAlbumReviewPreferences(albumId);
    const nextPinned = prefs.pinnedCardIds.filter((id) => sourceCards.some((card) => card.id === id));
    const nextSkippedPronunciation = prefs.skippedPronunciationCardIds.filter((id) =>
      sourceCards.some((card) => card.id === id)
    );
    const effectiveCount = requestedQuestionCount ?? prefs.questionCount;

    setPinnedCardIds(nextPinned);
    setSkippedPronunciationCardIds(nextSkippedPronunciation);
    setSelectedAnswers({});
    setResults({});
    setSkippedQuestionIds(new Set());
    setPronunciationScores({});
    setPronunciationErrors({});
    setPronunciationRecordingQuestionId(null);
    setPronunciationAnalyzingQuestionId(null);
    setPronunciationPlaybackQuestionId(null);
    setCurrentIndex(0);
    flipValuesRef.current = new Map();
    setQuestions(
      buildReviewQuestions(
        sourceCards,
        allCards,
        effectiveCount,
        nextPinned,
        nextSkippedPronunciation,
        DEFAULT_REVIEW_QUESTION_TYPES
      )
    );
    setLoading(false);

    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [albumId, allCards, requestedQuestionCount, sourceCards]);

  React.useEffect(() => {
    if (!allCards.length || !sourceCards.length) {
      if (!sourceCards.length) {
        setQuestions([]);
        setLoading(false);
      }
      return;
    }

    void buildSession();
  }, [allCards.length, buildSession, sourceCards.length]);

  React.useEffect(() => {
    return () => {
      const recording = pronunciationRecordingRef.current;
      pronunciationRecordingRef.current = null;
      if (!recording) return;
      try {
        recording.setOnRecordingStatusUpdate(null);
        void recording.stopAndUnloadAsync().catch(() => undefined);
      } catch {
        // ignore cleanup errors
      }
    };
  }, []);

  const slides = React.useMemo<ReviewSlide[]>(
    () => [...questions.map((question) => ({ id: question.id, type: 'question', question }) as const), { id: 'summary', type: 'summary' }],
    [questions]
  );

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
    void markCardAsQuizReviewed(question.cardId);
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
  }, [albumId, selectedAnswers, skippedPronunciationCardIds]);

  const stopPronunciationQuestionRecording = React.useCallback(async (question: ReviewQuestion) => {
    const recording = pronunciationRecordingRef.current;
    if (!recording) return;

    try {
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

      if (!uri) {
        throw new Error('錄音檔遺失，請重新錄音');
      }
      if (durationMillis > 0 && durationMillis < MIN_PRONUNCIATION_RECORDING_MS) {
        throw new Error('錄音太短，請清楚唸出完整單字再送出');
      }
      if (Platform.OS === 'ios' && !uri.toLowerCase().endsWith('.wav')) {
        throw new Error('錄音格式錯誤，請重新錄音');
      }

      setPronunciationAnalyzingQuestionId(question.id);
      setPronunciationErrors((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      const result = await assessPronunciationCloud({
        referenceText: question.correctAnswer,
        audioUri: uri,
        locale: 'en-US',
      });
      const score = Math.round(result.score);
      const passed = score >= PRONUNCIATION_PASS_SCORE;
      setPronunciationScores((prev) => ({ ...prev, [question.id]: score }));
      finishQuestionWithResult(question, `${score}% pronunciation accuracy`, passed);
    } catch (error) {
      console.error('[ReviewFlow][Pronunciation] assess failed:', error);
      const message = error instanceof Error ? error.message : '發音評分失敗，請再試一次。';
      setPronunciationErrors((prev) => ({ ...prev, [question.id]: message }));
      setPronunciationScores((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
    } finally {
      pronunciationRecordingRef.current = null;
      setPronunciationRecordingQuestionId(null);
      setPronunciationAnalyzingQuestionId(null);
    }
  }, [finishQuestionWithResult]);

  const togglePronunciationQuestionRecording = React.useCallback(async (question: ReviewQuestion) => {
    if (selectedAnswers[question.id] || pronunciationAnalyzingQuestionId) return;
    if (pronunciationRecordingQuestionId === question.id) {
      await stopPronunciationQuestionRecording(question);
      return;
    }
    if (pronunciationRecordingRef.current) return;

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setPronunciationErrors((prev) => ({ ...prev, [question.id]: '需要麥克風權限才能進行發音題。' }));
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(REVIEW_PRONUNCIATION_RECORDING_OPTIONS as any);
      await recording.startAsync();
      pronunciationRecordingRef.current = recording;
      pronunciationRecordingStartedAtRef.current = Date.now();
      setPronunciationErrors((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      setPronunciationRecordingQuestionId(question.id);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('[ReviewFlow][Pronunciation] recording failed:', error);
      const message = error instanceof Error ? error.message : '錄音失敗，請再試一次。';
      setPronunciationErrors((prev) => ({ ...prev, [question.id]: message }));
      setPronunciationRecordingQuestionId(null);
      pronunciationRecordingRef.current = null;
    }
  }, [pronunciationAnalyzingQuestionId, pronunciationRecordingQuestionId, selectedAnswers, stopPronunciationQuestionRecording]);

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

  const handlePlayPronunciationAnswer = React.useCallback((question: ReviewQuestion) => {
    if (question.questionType !== 'pronunciation') return;
    const text = question.correctAnswer.trim();
    if (!text) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPronunciationPlaybackQuestionId(question.id);
    void speakEnglishNaturally(text, {
      onDownloadStart: () => setPronunciationPlaybackQuestionId(question.id),
      onDownloadEnd: () => setPronunciationPlaybackQuestionId((current) => (current === question.id ? null : current)),
      onDone: () => setPronunciationPlaybackQuestionId((current) => (current === question.id ? null : current)),
      onStopped: () => setPronunciationPlaybackQuestionId((current) => (current === question.id ? null : current)),
      onError: () => setPronunciationPlaybackQuestionId((current) => (current === question.id ? null : current)),
    });
  }, []);

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
    const isPronunciationRecording = pronunciationRecordingQuestionId === question.id;
    const isPronunciationAnalyzing = pronunciationAnalyzingQuestionId === question.id;
    const isPronunciationPlaybackLoading = pronunciationPlaybackQuestionId === question.id;
    const pronunciationScore = pronunciationScores[question.id];
    const pronunciationError = pronunciationErrors[question.id];

    return (
      <View style={[styles.slide, { width }]}>
        <View style={styles.cardShell}>
          <Animated.View
            style={[
              styles.cardFace,
              styles.frontFace,
              { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
              {
                transform: [{ perspective: 1200 }, { rotateY: frontRotate }],
              },
            ]}
          >
            <Text style={[styles.questionEyebrow, { color: palette.secondaryText }]}>{question.prompt.toUpperCase()}</Text>
            <Text style={[styles.sentenceText, { color: palette.primaryText }]}>{question.sentence}</Text>

            {isPronunciationQuestion ? (
              <View style={styles.pronunciationQuizPanel}>
                <Text style={[styles.pronunciationQuizHint, { color: palette.secondaryText }]}>
                  Say this word clearly. Accuracy over {PRONUNCIATION_PASS_SCORE}% passes.
                </Text>
                {typeof pronunciationScore === 'number' ? (
                  <Text style={[styles.pronunciationQuizScore, { color: pronunciationScore >= PRONUNCIATION_PASS_SCORE ? palette.successText : palette.errorText }]}>
                    {pronunciationScore}%
                  </Text>
                ) : null}
                {pronunciationError ? (
                  <Text style={[styles.pronunciationQuizError, { color: palette.errorText }]}>{pronunciationError}</Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.pronunciationQuizButton,
                    {
                      backgroundColor: isPronunciationRecording ? '#FF6B6B' : palette.nextButtonBg,
                      borderColor: isPronunciationRecording ? '#4EAFF4' : palette.nextButtonBg,
                    },
                    isPronunciationRecording ? styles.pronunciationQuizButtonRecording : null,
                    pressed && !selectedAnswer && !isPronunciationAnalyzing ? styles.primaryButtonPressed : null,
                  ]}
                  disabled={Boolean(selectedAnswer) || isPronunciationAnalyzing}
                  onPress={() => void togglePronunciationQuestionRecording(question)}
                >
                  <Ionicons
                    name={isPronunciationAnalyzing ? 'hourglass-outline' : isPronunciationRecording ? 'stop' : 'mic'}
                    size={24}
                    color={palette.nextButtonText}
                  />
                  <Text style={[styles.pronunciationQuizButtonText, { color: palette.nextButtonText }]}>
                    {isPronunciationAnalyzing
                      ? 'Scoring...'
                      : isPronunciationRecording
                        ? 'Stop and score'
                        : 'Record pronunciation'}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.pronunciationSkipButton,
                    { backgroundColor: palette.softButtonBg, borderColor: palette.softButtonBorder },
                    pressed && !selectedAnswer && !isPronunciationAnalyzing ? styles.secondaryButtonPressed : null,
                  ]}
                  disabled={Boolean(selectedAnswer) || isPronunciationAnalyzing}
                  onPress={() => void handleSkipPronunciationQuestion(question)}
                >
                  <Text style={[styles.pronunciationSkipText, { color: palette.secondaryText }]}>Can&apos;t speak now</Text>
                </Pressable>
              </View>
            ) : (
            <View style={styles.optionsGrid}>
              {question.options.map((option) => {
                const wasChosen = selectedAnswer === option;
                const isCorrectOption = option === question.correctAnswer;
                const hasAnswered = Boolean(selectedAnswer);
                return (
                  <Pressable
                    key={option}
                    style={({ pressed }) => [
                      styles.optionCard,
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
                    <Text style={[styles.optionText, { color: palette.primaryText }]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
            )}
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
            <View style={styles.answerSentenceBlock}>
              <Text style={[styles.answerSentenceLabel, { color: palette.secondaryText }]}>Sentence</Text>
              <Text style={[styles.answerFullSentence, { color: palette.primaryText }]}>{question.fullSentence}</Text>
            </View>

            <View style={styles.answerSentenceBlock}>
              <Text style={[styles.answerSentenceLabel, { color: palette.secondaryText }]}>Translation</Text>
              <Text style={[styles.answerTranslatedSentence, { color: palette.primaryText }]}>
                {question.sentenceTranslation}
              </Text>
            </View>

            <View
              style={[
                styles.answerVocabCard,
                { backgroundColor: palette.answerCardBg, borderColor: palette.answerCardBorder },
              ]}
            >
              <View style={styles.answerPreviewHeader}>
                <View style={styles.answerPreviewWordWrap}>
                  <Text style={[styles.answerSentenceLabel, { color: palette.secondaryText }]}>Card detail</Text>
                  <Text style={[styles.answerWord, { color: palette.primaryText }]}>{question.correctAnswer}</Text>
                </View>
                {isPronunciationQuestion ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.answerPronounceButton,
                      { backgroundColor: palette.softButtonBg, borderColor: palette.softButtonBorder },
                      pressed ? styles.iconButtonPressed : null,
                    ]}
                    onPress={() => handlePlayPronunciationAnswer(question)}
                  >
                    <Ionicons
                      name={isPronunciationPlaybackLoading ? 'hourglass-outline' : 'volume-medium-outline'}
                      size={22}
                      color={palette.primaryText}
                    />
                  </Pressable>
                ) : null}
                <View style={styles.resultBadgeRow}>
                  <Animated.View
                    style={[
                      styles.resultBadge,
                      { backgroundColor: isCorrect ? palette.successTint : palette.errorTint },
                      isCorrect ? { transform: [{ scale: celebrationScale }] } : null,
                    ]}
                  >
                    <Text style={[styles.resultBadgeText, { color: isCorrect ? palette.successText : palette.errorText }]}>
                      {isCorrect ? 'Correct' : 'Not quite'}
                    </Text>
                  </Animated.View>
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
              {!isCorrect ? (
                <Text style={[styles.answerSubTitle, { color: palette.secondaryText }]}>
                  {isPronunciationQuestion ? `Your score: ${selectedAnswer}` : `Your answer: ${selectedAnswer}`}
                </Text>
              ) : null}
              <Text style={[styles.answerPos, { color: palette.secondaryText }]}>{question.partOfSpeech || 'word'}</Text>
              {question.definition ? (
                <Text style={[styles.answerDefinition, { color: palette.primaryText }]}>{question.definition}</Text>
              ) : null}
              {question.contextPreview ? (
                <Text style={[styles.answerSentence, { color: palette.secondaryText }]}>{question.contextPreview}</Text>
              ) : null}
            </View>

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
                test me next time
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
              <Text style={[styles.nextButtonText, { color: palette.nextButtonText }]}>Next</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    );
  }, [
    answerQuestion,
    handleSkipPronunciationQuestion,
    handleNext,
    handleTogglePinned,
    handlePlayPronunciationAnswer,
    palette,
    pinnedCardIds,
    pronunciationAnalyzingQuestionId,
    pronunciationErrors,
    pronunciationPlaybackQuestionId,
    pronunciationRecordingQuestionId,
    pronunciationScores,
    results,
    selectedAnswers,
    togglePronunciationQuestionRecording,
    width,
  ]);

  const renderSummaryCard = React.useCallback(() => {
    const total = scoredQuestionCount;
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const summaryTone =
      percentage >= 90
        ? { message: 'Outstanding. You are mastering these words.', color: '#4EAFF4' }
        : percentage <= 50
          ? { message: 'Good effort. One more round and you will level up fast.', color: '#FF6B6B' }
          : { message: 'Great job. Your retention is getting really solid.', color: palette.primaryText };

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
          <Text style={[styles.summaryPercent, { color: summaryTone.color }]}>{percentage}% correct</Text>
          <Text style={[styles.summaryBody, { color: palette.secondaryText }]}>{summaryTone.message}</Text>
          {skippedCount > 0 ? (
            <Text style={[styles.summarySkipped, { color: palette.secondaryText }]}>
              {skippedCount} pronunciation {skippedCount === 1 ? 'question was' : 'questions were'} skipped and saved for next time.
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
            <Text style={[styles.summarySecondaryText, { color: palette.summarySecondaryText }]}>Play Again</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.summaryPrimaryButton,
              { backgroundColor: palette.nextButtonBg },
              pressed ? styles.primaryButtonPressed : null,
            ]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.summaryPrimaryText, { color: palette.nextButtonText }]}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }, [correctCount, handleReplay, navigation, palette.cardBg, palette.cardBorder, palette.nextButtonBg, palette.nextButtonText, palette.primaryText, palette.secondaryText, palette.summarySecondaryBg, palette.summarySecondaryBorder, palette.summarySecondaryText, scoredQuestionCount, skippedCount, width]);

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
      ? 'Final score'
      : `Card ${Math.min(currentIndex + 1, questions.length)} of ${questions.length}`;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.screenBg }]} edges={['top']}>
        <View style={styles.centerState}>
          <Text style={[styles.centerStateText, { color: palette.primaryText }]}>Preparing your review…</Text>
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
            <Text style={[styles.headerSubTitle, { color: palette.secondaryText }]}>No cards available</Text>
          </View>
        </View>
        <View style={styles.centerState}>
          <Text style={[styles.centerStateText, { color: palette.primaryText }]}>This album does not have enough cards to build a quiz yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

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
        renderItem={renderItem}
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        removeClippedSubviews={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  frontFace: {
    justifyContent: 'space-between',
  },
  backFace: {
    justifyContent: 'flex-start',
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
  optionCard: {
    width: '48%',
    minHeight: 112,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 18,
    justifyContent: 'center',
    borderWidth: 1,
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
  },
  pronunciationQuizPanel: {
    gap: 14,
    alignItems: 'center',
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
    minHeight: 62,
    width: '100%',
    borderRadius: 22,
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
    shadowColor: '#FF6B6B',
    shadowOpacity: 0.32,
  },
  pronunciationQuizButtonText: {
    fontSize: 17,
    fontWeight: '900',
  },
  pronunciationSkipButton: {
    minHeight: 48,
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pronunciationSkipText: {
    fontSize: 15,
    fontWeight: '800',
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
  answerSentenceLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
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
  answerSentence: {
    marginTop: 2,
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  nextTimeButton: {
    marginTop: 'auto',
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
});
