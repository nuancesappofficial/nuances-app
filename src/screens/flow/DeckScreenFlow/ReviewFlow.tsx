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
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import {
  loadAlbumReviewPreferences,
  saveAlbumReviewPreferences,
} from '../../../features/deck/reviewPreferences';

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
  prompt: string;
  correctAnswer: string;
  options: string[];
  sentence: string;
  sourceSentence: string;
};

type ReviewSlide =
  | { id: string; type: 'question'; question: ReviewQuestion }
  | { id: 'summary'; type: 'summary' };

const OPTION_COLORS = ['#FF7A7A', '#7D8CFF', '#5BCB96', '#F4B942'];

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

  return selected.map((card) => {
    const correctAnswer = pickDisplayAnswer(card);
    const distractors = buildOptionPool(allCards, card).slice(0, 3);

    while (distractors.length < 3) {
      distractors.push(`${correctAnswer} ${distractors.length + 1}`);
    }

    return {
      id: card.id,
      cardId: card.id,
      prompt: (card.partOfSpeech || 'word').trim(),
      correctAnswer,
      options: shuffleArray([correctAnswer, ...distractors]),
      sentence: buildMaskedSentence(card),
      sourceSentence: (card.originalSentence || card.definition || '').trim(),
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

export default function ReviewFlow({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  const albumId = route.params?.albumId || 'all-cards';
  const albumName = route.params?.albumName || 'Review';
  const requestedQuestionCount = route.params?.questionCount;
  const themeColor = route.params?.themeColor || '#8B5CF6';
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

    const flipValue = getFlipValue(flipValuesRef, question.id);
    Animated.timing(flipValue, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    }).start();
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
              {question.options.map((option, index) => {
                const wasChosen = selectedAnswer === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.optionCard,
                      { backgroundColor: OPTION_COLORS[index % OPTION_COLORS.length] },
                      selectedAnswer && !wasChosen && styles.optionCardDisabled,
                    ]}
                    activeOpacity={0.92}
                    disabled={Boolean(selectedAnswer)}
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
            <View style={styles.resultBadgeRow}>
              <View
                style={[
                  styles.resultBadge,
                  { backgroundColor: isCorrect ? 'rgba(91,203,150,0.16)' : 'rgba(255,122,122,0.16)' },
                ]}
              >
                <Text style={[styles.resultBadgeText, { color: isCorrect ? '#5BCB96' : '#FF7A7A' }]}>
                  {isCorrect ? 'Correct' : 'Not quite'}
                </Text>
              </View>
            </View>

            <Text style={styles.answerTitle}>{question.correctAnswer}</Text>
            {!isCorrect ? (
              <Text style={styles.answerSubTitle}>
                Your answer: {selectedAnswer}
              </Text>
            ) : null}
            {question.sourceSentence ? (
              <Text style={styles.answerSentence}>{question.sourceSentence}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.nextTimeButton, isPinned && styles.nextTimeButtonActive]}
              onPress={() => void handleTogglePinned(question.cardId)}
            >
              <Ionicons
                name={isPinned ? 'bookmark' : 'bookmark-outline'}
                size={16}
                color={isPinned ? '#101010' : '#FFFFFF'}
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

    return (
      <View style={[styles.slide, { width }]}>
        <View style={[styles.cardShell, styles.summaryShell]}>
          <Text style={styles.summaryEyebrow}>SESSION COMPLETE</Text>
          <Text style={styles.summaryScore}>{correctCount}/{total}</Text>
          <Text style={styles.summaryPercent}>{percentage}% correct</Text>
          <Text style={styles.summaryBody}>
            Nice run. You can play again right away, or head back to the album.
          </Text>

          <TouchableOpacity style={[styles.summaryPrimaryButton, { backgroundColor: themeColor }]} onPress={handleReplay}>
            <Text style={styles.summaryPrimaryText}>Play Again</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.summarySecondaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.summarySecondaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [correctCount, handleReplay, navigation, questions.length, themeColor, width]);

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
    backgroundColor: '#07080B',
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
    backgroundColor: '#F6F6F3',
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
    color: '#727985',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  sentenceText: {
    color: '#101218',
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
  },
  optionCardDisabled: {
    opacity: 0.4,
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
    color: '#0F1115',
    fontSize: 34,
    fontWeight: '800',
  },
  answerSubTitle: {
    marginTop: 8,
    color: '#5C6470',
    fontSize: 15,
    fontWeight: '600',
  },
  answerSentence: {
    marginTop: 18,
    color: '#1D2128',
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '600',
  },
  nextTimeButton: {
    marginTop: 'auto',
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#101010',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextTimeButtonActive: {
    backgroundColor: '#E5FF4F',
    borderColor: '#E5FF4F',
  },
  nextTimeText: {
    color: '#101010',
    fontSize: 15,
    fontWeight: '800',
  },
  nextTimeTextActive: {
    color: '#101010',
  },
  nextButton: {
    marginTop: 12,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#12151B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  summaryShell: {
    borderRadius: 28,
    backgroundColor: '#101217',
    paddingHorizontal: 26,
    paddingVertical: 28,
    justifyContent: 'center',
  },
  summaryEyebrow: {
    color: '#9AA2AF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  summaryScore: {
    marginTop: 18,
    color: '#FFFFFF',
    fontSize: 72,
    fontWeight: '900',
  },
  summaryPercent: {
    marginTop: 8,
    color: '#E5FF4F',
    fontSize: 24,
    fontWeight: '800',
  },
  summaryBody: {
    marginTop: 18,
    color: '#B2B9C5',
    fontSize: 16,
    lineHeight: 24,
  },
  summaryPrimaryButton: {
    marginTop: 28,
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryPrimaryText: {
    color: '#101010',
    fontSize: 17,
    fontWeight: '800',
  },
  summarySecondaryButton: {
    marginTop: 12,
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summarySecondaryText: {
    color: '#FFFFFF',
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
