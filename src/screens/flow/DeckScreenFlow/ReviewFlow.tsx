import React from 'react';
import {
  Alert,
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import { SCREEN_BG } from '../../../theme/colors';
import {
  loadAlbumReviewPreferences,
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
      themeColor?: string;
    };
  };
};

type ReviewQuestion = {
  id: string;
  cardId: string;
  questionType: 'fill_blank' | 'translation_to_word' | 'word_to_translation';
  prompt: string;
  correctAnswer: string;
  options: string[];
  sentence: string;
  sourceSentence: string;
  partOfSpeech: string;
  definition: string;
  contextualExplanation: string;
};

type ReviewSlide =
  | { id: string; type: 'question'; question: ReviewQuestion }
  | { id: 'summary'; type: 'summary' };

const OPTION_FEEDBACK_DURATION_MS = 320;

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

function buildMaskedSentence(card: Card): string {
  const target = (card.targetPhrase || card.targetWord || '').trim();
  const baseSentence = (card.originalSentence || '').trim();

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

function buildReviewQuestions(
  sourceCards: Card[],
  allCards: Card[],
  questionCount: number,
  pinnedCardIds: string[]
): ReviewQuestion[] {
  const sourceById = new Map(sourceCards.map((card) => [card.id, card] as const));
  const pinnedCards = pinnedCardIds.map((id) => sourceById.get(id)).filter((card): card is Card => Boolean(card));
  const pinnedSet = new Set(pinnedCards.map((card) => card.id));
  const randomPool = shuffleArray(sourceCards.filter((card) => !pinnedSet.has(card.id)));
  const totalCount = Math.min(sourceCards.length, Math.max(questionCount, pinnedCards.length));
  const selected = [...pinnedCards, ...randomPool].slice(0, totalCount);

  return selected.map((card, index) => {
    const word = pickDisplayAnswer(card);
    const definition = pickDefinitionText(card);
    const partOfSpeech = (card.partOfSpeech || 'word').trim();
    const sourceSentence = (card.originalSentence || card.definition || '').trim();
    const contextualExplanation = (card.contextualExplanation || '').trim();
    const maskedSentence = buildMaskedSentence(card);

    const typePattern = index % 3;
    const questionType: ReviewQuestion['questionType'] =
      typePattern === 0 ? 'fill_blank' : typePattern === 1 ? 'translation_to_word' : 'word_to_translation';

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
  const albumId = route.params?.albumId || 'all-cards';
  const albumName = route.params?.albumName || 'Review';
  const requestedQuestionCount = route.params?.questionCount;
  const themeColor = '#4EAFF4';
  const routeCardIds = route.params?.cardIds || [];

  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [questions, setQuestions] = React.useState<ReviewQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({});
  const [results, setResults] = React.useState<Record<string, boolean>>({});
  const [pinnedCardIds, setPinnedCardIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const listRef = React.useRef<FlatList<ReviewSlide> | null>(null);
  const flipValuesRef = React.useRef<Map<string, Animated.Value>>(new Map());
  const celebrationValuesRef = React.useRef<Map<string, Animated.Value>>(new Map());

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
    const effectiveCount = requestedQuestionCount ?? prefs.questionCount;

    setPinnedCardIds(nextPinned);
    setSelectedAnswers({});
    setResults({});
    setCurrentIndex(0);
    flipValuesRef.current = new Map();
    setQuestions(buildReviewQuestions(sourceCards, allCards, effectiveCount, nextPinned));
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

  const slides = React.useMemo<ReviewSlide[]>(
    () => [...questions.map((question) => ({ id: question.id, type: 'question', question }) as const), { id: 'summary', type: 'summary' }],
    [questions]
  );

  const correctCount = React.useMemo(
    () => Object.values(results).filter(Boolean).length,
    [results]
  );

  const answerQuestion = React.useCallback((question: ReviewQuestion, option: string) => {
    if (selectedAnswers[question.id]) return;

    const isCorrect = option === question.correctAnswer;
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
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  const goToSlide = React.useCallback((index: number) => {
    setCurrentIndex(index);
    listRef.current?.scrollToOffset({ offset: index * width, animated: true });
  }, [width]);

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

    return (
      <View style={[styles.slide, { width }]}>
        <View style={styles.cardShell}>
          <Animated.View
            style={[
              styles.cardFace,
              styles.frontFace,
              {
                transform: [{ perspective: 1200 }, { rotateY: frontRotate }],
              },
            ]}
          >
            <Text style={styles.questionEyebrow}>{question.prompt.toUpperCase()}</Text>
            <Text style={styles.sentenceText}>{question.sentence}</Text>

            <View style={styles.optionsGrid}>
              {question.options.map((option) => {
                const wasChosen = selectedAnswer === option;
                const isCorrectOption = option === question.correctAnswer;
                const hasAnswered = Boolean(selectedAnswer);
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.optionCard,
                      hasAnswered ? styles.optionCardAnswered : null,
                      hasAnswered && isCorrectOption ? styles.optionCardCorrect : null,
                      hasAnswered && wasChosen && !isCorrectOption ? styles.optionCardWrong : null,
                      hasAnswered && !wasChosen && !isCorrectOption ? styles.optionCardDisabled : null,
                    ]}
                    activeOpacity={0.92}
                    disabled={hasAnswered}
                    onPress={() => answerQuestion(question, option)}
                  >
                    <Text style={styles.optionText}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>

          <Animated.View
            pointerEvents={selectedAnswer ? 'auto' : 'none'}
            style={[
              styles.cardFace,
              styles.backFace,
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
                  { opacity: celebrationOverlayOpacity },
                ]}
              />
            ) : null}
            <View style={styles.resultBadgeRow}>
              <Animated.View
                style={[
                  styles.resultBadge,
                  { backgroundColor: isCorrect ? 'rgba(78,175,244,0.18)' : 'rgba(255,107,107,0.15)' },
                  isCorrect ? { transform: [{ scale: celebrationScale }] } : null,
                ]}
              >
                <Text style={[styles.resultBadgeText, { color: isCorrect ? '#4EAFF4' : '#FF6B6B' }]}>
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
                  <Ionicons name="sparkles" size={16} color="#E8FFF5" />
                </Animated.View>
              ) : null}
            </View>

            <Text style={styles.answerTitle}>Correct answer</Text>
            {!isCorrect ? (
              <Text style={styles.answerSubTitle}>
                Your answer: {selectedAnswer}
              </Text>
            ) : null}
            <View style={styles.answerVocabCard}>
              <Text style={styles.answerWord}>{question.correctAnswer}</Text>
              <Text style={styles.answerPos}>{question.partOfSpeech || 'word'}</Text>
              {question.definition ? (
                <Text style={styles.answerDefinition}>{question.definition}</Text>
              ) : null}
              {question.contextualExplanation ? (
                <Text style={styles.answerSentence}>{question.contextualExplanation}</Text>
              ) : question.sourceSentence ? (
                <Text style={styles.answerSentence}>{question.sourceSentence}</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.nextTimeButton, isPinned && styles.nextTimeButtonActive]}
              onPress={() => void handleTogglePinned(question.cardId)}
            >
                <Ionicons
                  name={isPinned ? 'bookmark' : 'bookmark-outline'}
                  size={16}
                  color={isPinned ? '#EAF6FF' : '#FFFFFF'}
                />
              <Text style={[styles.nextTimeText, isPinned && styles.nextTimeTextActive]}>
                test me next time
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }, [answerQuestion, handleNext, handleTogglePinned, pinnedCardIds, results, selectedAnswers, width]);

  const renderSummaryCard = React.useCallback(() => {
    const total = questions.length;
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const summaryTone =
      percentage >= 90
        ? { message: 'Outstanding. You are mastering these words.', color: '#4EAFF4' }
        : percentage <= 50
          ? { message: 'Good effort. One more round and you will level up fast.', color: '#FF6B6B' }
          : { message: 'Great job. Your retention is getting really solid.', color: '#F8FAFC' };

    return (
      <View style={[styles.slide, { width }]}>
        <View style={[styles.cardShell, styles.summaryShell]}>
          <Text style={styles.summaryScore}>{correctCount}/{total}</Text>
          <Text style={[styles.summaryPercent, { color: summaryTone.color }]}>{percentage}% correct</Text>
          <Text style={styles.summaryBody}>{summaryTone.message}</Text>

          <TouchableOpacity style={styles.summarySecondaryButton} onPress={handleReplay}>
            <Text style={styles.summarySecondaryText}>Play Again</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.summaryPrimaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.summaryPrimaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [correctCount, handleReplay, navigation, questions.length, width]);

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
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerState}>
          <Text style={styles.centerStateText}>Preparing your review…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!questions.length) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>{albumName}</Text>
            <Text style={styles.headerSubTitle}>No cards available</Text>
          </View>
        </View>
        <View style={styles.centerState}>
          <Text style={styles.centerStateText}>This album does not have enough cards to build a quiz yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>{albumName}</Text>
          <Text style={styles.headerSubTitle}>{headerProgressLabel}</Text>
        </View>

        <View style={styles.scoreChip}>
          <Text style={styles.scoreChipText}>{correctCount}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
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
    backgroundColor: SCREEN_BG,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.12)',
  },
  optionCardAnswered: {
    borderColor: 'rgba(248,250,252,0.2)',
  },
  optionCardCorrect: {
    backgroundColor: 'rgba(52,211,153,0.22)',
    borderColor: '#34D399',
  },
  optionCardWrong: {
    backgroundColor: 'rgba(255,107,107,0.22)',
    borderColor: '#FF6B6B',
  },
  optionCardDisabled: {
    opacity: 0.56,
  },
  optionText: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 26,
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
    textDecorationLine: 'line-through',
  },
  answerVocabCard: {
    marginTop: 10,
    borderRadius: 20,
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
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
    borderColor: '#334155',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextTimeButtonActive: {
    backgroundColor: '#334155',
    borderColor: '#4EAFF4',
  },
  nextTimeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  nextTimeTextActive: {
    color: '#FFFFFF',
  },
  celebrationSpark: {
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    backgroundColor: 'rgba(78,175,244,0.18)',
  },
  nextButton: {
    marginTop: 12,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#4EAFF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  summaryShell: {
    borderRadius: 28,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
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
    color: '#F8FAFC',
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
    color: '#94A3B8',
    fontSize: 16,
    lineHeight: 24,
  },
  summaryPrimaryButton: {
    marginTop: 28,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#4EAFF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryPrimaryText: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  summarySecondaryButton: {
    marginTop: 12,
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summarySecondaryText: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
  },
  centerState: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStateText: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '600',
    textAlign: 'center',
  },
});
