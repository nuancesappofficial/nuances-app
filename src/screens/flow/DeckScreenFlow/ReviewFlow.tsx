import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';

type Props = {
  navigation: any;
};

type ReviewCard = {
  id: string;
  word: string;
  partOfSpeech: string;
  definition: string;
  cultural: string;
  context: string;
  collocations: string[];
};

type RecordingState = 'idle' | 'recording' | 'analyzing' | 'done';

type WordScore = {
  word: string;
  score: 'good' | 'ok' | 'bad';
};

type Rating = 'again' | 'hard' | 'good' | 'easy';

function parseCollocations(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function toReviewCard(card: Card): ReviewCard {
  return {
    id: card.id,
    word: card.targetWord || card.targetPhrase || '-',
    partOfSpeech: card.partOfSpeech || 'unknown',
    definition: card.definition || 'No definition',
    cultural: card.contextualExplanation || 'No cultural note yet.',
    context: card.originalSentence || card.definition || '-',
    collocations: parseCollocations(card.frequentCollocations),
  };
}

function analyzeSentence(sentence: string): WordScore[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  const scores: Array<'good' | 'ok' | 'bad'> = [
    'good',
    'good',
    'ok',
    'good',
    'bad',
    'good',
    'good',
    'good',
    'ok',
    'good',
    'good',
    'good',
    'good',
  ];
  return words.map((word, i) => ({
    word,
    score: scores[i % scores.length],
  }));
}

function calcSrsUpdate(card: Card, rating: Rating): {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: Date;
} {
  const now = new Date();
  const prevEase = Math.max(1.3, Number(card.easeFactor || 2.5));
  const prevInterval = Math.max(1, Number(card.intervalDays || 1));
  const prevReps = Math.max(0, Number(card.repetitions || 0));

  let repetitions = prevReps;
  let intervalDays = prevInterval;
  let easeFactor = prevEase;

  if (rating === 'again') {
    repetitions = 0;
    intervalDays = 1;
    easeFactor = Math.max(1.3, prevEase - 0.2);
  } else if (rating === 'hard') {
    repetitions = prevReps + 1;
    intervalDays = Math.max(1, Math.round(prevInterval * 1.2));
    easeFactor = Math.max(1.3, prevEase - 0.15);
  } else if (rating === 'good') {
    repetitions = prevReps + 1;
    if (prevReps === 0) intervalDays = 1;
    else if (prevReps === 1) intervalDays = 3;
    else intervalDays = Math.max(1, Math.round(prevInterval * prevEase));
  } else {
    repetitions = prevReps + 1;
    if (prevReps === 0) intervalDays = 2;
    else if (prevReps === 1) intervalDays = 4;
    else intervalDays = Math.max(1, Math.round(prevInterval * prevEase * 1.3));
    easeFactor = Math.max(1.3, prevEase + 0.1);
  }

  const nextReviewAt = new Date(now);
  nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

  return {
    repetitions,
    intervalDays,
    easeFactor,
    nextReviewAt,
  };
}

export default function ReviewScreen({ navigation }: Props) {
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardIndex, setCardIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [recordingState, setRecordingState] = React.useState<RecordingState>('idle');
  const [overallScore, setOverallScore] = React.useState<number | null>(null);
  const [wordScores, setWordScores] = React.useState<WordScore[]>([]);
  const [showCollocations, setShowCollocations] = React.useState(false);
  const [recordProgress, setRecordProgress] = React.useState(0);

  React.useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('deleted_at', null), Q.sortBy('next_review_at', Q.asc));

    const load = async () => {
      try {
        const data = await queryCards.fetch();
        setAllCards(data);
      } catch (error) {
        console.error('[Review] load cards failed:', error);
        setAllCards([]);
      }
    };

    void load();
    const sub = queryCards.observe().subscribe((data) => setAllCards(data));
    return () => sub.unsubscribe();
  }, []);

  const reviewCards = React.useMemo<ReviewCard[]>(() => {
    if (!allCards.length) return [];
    const now = Date.now();
    const due = allCards.filter((card) => new Date(card.nextReviewAt).getTime() <= now);
    const source = due.length > 0 ? due : allCards;
    return source.map(toReviewCard);
  }, [allCards]);

  React.useEffect(() => {
    if (cardIndex < reviewCards.length) return;
    setCardIndex(Math.max(0, reviewCards.length - 1));
  }, [cardIndex, reviewCards.length]);

  const card = reviewCards[cardIndex] || null;

  const resetPerCardUi = React.useCallback(() => {
    setRevealed(false);
    setRecordingState('idle');
    setOverallScore(null);
    setWordScores([]);
    setShowCollocations(false);
    setRecordProgress(0);
  }, []);

  const startRecording = () => {
    if (!card) return;
    setRecordingState('recording');
    setRecordProgress(0);

    const int = setInterval(() => {
      setRecordProgress((p) => {
        if (p >= 100) {
          clearInterval(int);
          setRecordingState('analyzing');
          setTimeout(() => {
            setOverallScore(72);
            setWordScores(analyzeSentence(card.context));
            setRecordingState('done');
          }, 2000);
          return 100;
        }
        return p + 4;
      });
    }, 80);
  };

  const applyRating = async (rating: Rating) => {
    if (!card) return;
    try {
      const record = await database.get<Card>('cards').find(card.id);
      const next = calcSrsUpdate(record, rating);
      await database.write(async () => {
        await record.update((item) => {
          item.repetitions = next.repetitions;
          item.intervalDays = next.intervalDays;
          item.easeFactor = next.easeFactor;
          item.lastReviewedAt = new Date();
          item.nextReviewAt = next.nextReviewAt;
        });
      });
    } catch (error) {
      console.error('[Review] apply rating failed:', error);
      Alert.alert('更新失敗', '無法儲存複習結果，請稍後再試。');
      return;
    }

    if (cardIndex >= reviewCards.length - 1) {
      Alert.alert('完成', '本輪複習已完成。', [
        {
          text: '確定',
          onPress: () => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('Deck');
          },
        },
      ]);
      return;
    }

    setCardIndex((i) => i + 1);
    resetPerCardUi();
  };

  const scoreColor = { good: '#1A8A3A', ok: '#CC6600', bad: '#CC3333' };
  const scoreBg = { good: '#C8F0D8', ok: '#FFD9AA', bad: '#FFCCCC' };
  const progress = reviewCards.length > 0 ? ((cardIndex + 1) / reviewCards.length) * 100 : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('Deck');
          }}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Review</Text>
          <Text style={styles.headerSubTitle}>
            {reviewCards.length > 0 ? `Card ${cardIndex + 1} of ${reviewCards.length}` : 'No cards to review'}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      {card ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.flashCard}>
            <View style={styles.wordSide}>
              <Text style={styles.wordTitle}>{card.word}</Text>
              <Text style={styles.partTag}>{card.partOfSpeech}</Text>
            </View>

            {!revealed ? (
              <TouchableOpacity style={styles.revealBtn} onPress={() => setRevealed(true)}>
                <Text style={styles.revealText}>Tap to reveal</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={styles.sectionBorder}>
                  <Text style={styles.definitionText}>{card.definition}</Text>
                </View>
                <View style={styles.sectionBorder}>
                  <View style={styles.noteTitleRow}>
                    <Text style={styles.noteSparkle}>✦</Text>
                    <Text style={styles.noteTitle}>Cultural Note</Text>
                  </View>
                  <Text style={styles.noteBody}>{card.cultural}</Text>
                </View>
                <View style={styles.sectionBox}>
                  <Text style={styles.contextLabel}>Your Context</Text>
                  <Text style={styles.contextBody}>"{card.context}"</Text>
                </View>
              </>
            )}
          </View>

          {revealed ? (
            <View style={styles.coachCard}>
              <View style={styles.coachHeader}>
                <Text style={styles.coachTitle}>Pronunciation Coach</Text>
                <Text style={styles.coachSub}>
                  {recordingState === 'idle'
                    ? 'Record yourself reading the sentence'
                    : recordingState === 'recording'
                    ? 'Recording...'
                    : recordingState === 'analyzing'
                    ? 'Analyzing your pronunciation...'
                    : `Score: ${overallScore}/100`}
                </Text>
              </View>

              <View style={styles.coachBody}>
                {recordingState === 'done' && wordScores.length > 0 ? (
                  <View style={styles.scoreWordsWrap}>
                    {wordScores.map((ws, i) => (
                      <View
                        key={`${ws.word}-${i}`}
                        style={[styles.scoreWordChip, { backgroundColor: scoreBg[ws.score] }]}
                      >
                        <Text
                          style={[
                            styles.scoreWordText,
                            { color: scoreColor[ws.score], fontWeight: ws.score === 'bad' ? '700' : '500' },
                          ]}
                        >
                          {ws.word}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.quoteSentence}>"{card.context}"</Text>
                )}

                {recordingState === 'analyzing' ? (
                  <View style={styles.analysisWrap}>
                    <View style={styles.analysisRow}>
                      <View style={styles.analysisDot} />
                      <Text style={styles.analysisText}>Analyzing pronunciation...</Text>
                    </View>
                    <View style={styles.analysisTrack}>
                      <View style={[styles.analysisFill, { width: '60%' }]} />
                    </View>
                  </View>
                ) : null}

                {recordingState === 'recording' ? (
                  <View style={styles.recordTrack}>
                    <View style={[styles.recordFill, { width: `${recordProgress}%` }]} />
                  </View>
                ) : null}

                {recordingState === 'done' && overallScore !== null ? (
                  <View style={styles.finalScoreRow}>
                    <View style={styles.finalScoreWrap}>
                      <Text
                        style={[
                          styles.finalScore,
                          {
                            color:
                              overallScore >= 80 ? '#1A8A3A' : overallScore >= 60 ? '#CC6600' : '#CC3333',
                          },
                        ]}
                      >
                        {overallScore}
                      </Text>
                      <Text style={styles.finalScoreOutOf}>/100</Text>
                    </View>

                    <View style={styles.legendWrap}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#C8F0D8' }]} />
                        <Text style={styles.legendText}>Good</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FFD9AA' }]} />
                        <Text style={styles.legendText}>OK</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FFCCCC' }]} />
                        <Text style={styles.legendText}>Retry</Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                {(recordingState === 'idle' || recordingState === 'done') && (
                  <TouchableOpacity
                    onPress={startRecording}
                    style={[
                      styles.recordBtn,
                      recordingState === 'done' ? styles.recordBtnRetry : styles.recordBtnNormal,
                    ]}
                  >
                    <Text
                      style={[
                        styles.recordBtnText,
                        recordingState === 'done' ? styles.recordBtnTextRetry : styles.recordBtnTextNormal,
                      ]}
                    >
                      {recordingState === 'done' ? '↺ Try Again' : '🎤 Record'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : null}

          {revealed ? (
            <View style={styles.collocationCard}>
              <TouchableOpacity
                style={styles.collocationHeader}
                onPress={() => setShowCollocations((prev) => !prev)}
              >
                <Text style={styles.collocationTitle}>Collocations</Text>
                <Text style={styles.collocationArrow}>{showCollocations ? '⌃' : '⌄'}</Text>
              </TouchableOpacity>
              {showCollocations ? (
                <View style={styles.collocationBody}>
                  {card.collocations.length > 0 ? (
                    card.collocations.map((c, i) => (
                      <View key={`${c}-${i}`} style={styles.collocationItem}>
                        <Text style={styles.collocationItemText}>{c}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.collocationItem}>
                      <Text style={styles.collocationItemText}>No collocations</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          {revealed ? (
            <View>
              <Text style={styles.ratingTitle}>How well did you know this?</Text>
              <View style={styles.ratingGrid}>
                {[
                  { key: 'again', label: 'Again', color: '#FFCCCC', text: '#CC3333' },
                  { key: 'hard', label: 'Hard', color: '#FFD9AA', text: '#CC6600' },
                  { key: 'good', label: 'Good', color: '#D4EAFF', text: '#1A5FA6' },
                  { key: 'easy', label: 'Easy', color: '#C8F0D8', text: '#1A8A3A' },
                ].map((btn) => (
                  <TouchableOpacity
                    key={btn.key}
                    onPress={() => void applyRating(btn.key as Rating)}
                    style={[styles.ratingBtn, { backgroundColor: btn.color }]}
                  >
                    <Text style={[styles.ratingBtnText, { color: btn.text }]}>{btn.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No cards to review</Text>
          <Text style={styles.emptySubTitle}>Create cards first, then come back for review.</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate('Deck');
            }}
          >
            <Text style={styles.emptyBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F9' },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: { fontSize: 24, color: '#0D0D0D', marginTop: -2 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0D0D0D' },
  headerSubTitle: { fontSize: 12, color: '#9A9AAA' },
  progressTrack: { width: 80, height: 6, borderRadius: 999, backgroundColor: '#F2F2F5', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#0D0D0D', borderRadius: 999 },
  content: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24, gap: 12 },
  flashCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  wordSide: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#F5F5F8', alignItems: 'center' },
  wordTitle: { fontSize: 36, fontWeight: '800', letterSpacing: -1, color: '#0D0D0D' },
  partTag: {
    marginTop: 8,
    backgroundColor: '#F0F0F4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    color: '#8A8A9A',
    fontWeight: '500',
    overflow: 'hidden',
  },
  revealBtn: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  revealText: { fontSize: 14, color: '#9A9AAA', fontWeight: '500' },
  sectionBorder: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F8' },
  sectionBox: { paddingHorizontal: 16, paddingVertical: 12 },
  definitionText: { fontSize: 15, color: '#0D0D0D', lineHeight: 24 },
  noteTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  noteSparkle: { fontSize: 12, color: '#9A7FCC' },
  noteTitle: {
    fontSize: 11,
    color: '#9A7FCC',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noteBody: { fontSize: 13, color: '#444455', lineHeight: 22 },
  contextLabel: {
    fontSize: 11,
    color: '#9A9AAA',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  contextBody: { fontSize: 13, color: '#444455', fontStyle: 'italic', lineHeight: 22 },
  coachCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  coachHeader: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F8' },
  coachTitle: { fontSize: 14, fontWeight: '700', color: '#0D0D0D' },
  coachSub: { fontSize: 12, color: '#9A9AAA', marginTop: 2 },
  coachBody: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  quoteSentence: { fontSize: 14, color: '#444455', lineHeight: 22, fontStyle: 'italic' },
  scoreWordsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  scoreWordChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  scoreWordText: { fontSize: 14 },
  analysisWrap: { gap: 8 },
  analysisRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  analysisDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9A7FCC' },
  analysisText: { fontSize: 12, color: '#9A7FCC' },
  analysisTrack: { height: 6, borderRadius: 999, backgroundColor: '#F2F2F5', overflow: 'hidden' },
  analysisFill: { height: '100%', borderRadius: 999, backgroundColor: '#9A7FCC' },
  recordTrack: { height: 6, borderRadius: 999, backgroundColor: '#F2F2F5', overflow: 'hidden' },
  recordFill: { height: '100%', borderRadius: 999, backgroundColor: '#0D0D0D' },
  finalScoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  finalScoreWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  finalScore: { fontSize: 28, fontWeight: '800' },
  finalScoreOutOf: { fontSize: 14, color: '#9A9AAA' },
  legendWrap: { flexDirection: 'row', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, color: '#7A7A8A' },
  recordBtn: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  recordBtnNormal: { backgroundColor: '#0D0D0D' },
  recordBtnRetry: { backgroundColor: '#F2F2F5' },
  recordBtnText: { fontSize: 14, fontWeight: '600' },
  recordBtnTextNormal: { color: '#fff' },
  recordBtnTextRetry: { color: '#6A6A7A' },
  collocationCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  collocationHeader: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  collocationTitle: { fontSize: 14, fontWeight: '600', color: '#0D0D0D' },
  collocationArrow: { fontSize: 15, color: '#9A9AAA' },
  collocationBody: { borderTopWidth: 1, borderTopColor: '#F5F5F8', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 8 },
  collocationItem: { borderRadius: 10, backgroundColor: '#F7F7F9', paddingHorizontal: 10, paddingVertical: 9 },
  collocationItemText: { fontSize: 13, color: '#0D0D0D', fontWeight: '600' },
  ratingTitle: { textAlign: 'center', fontSize: 12, color: '#9A9AAA', marginBottom: 10, fontWeight: '500' },
  ratingGrid: { flexDirection: 'row', gap: 8 },
  ratingBtn: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  ratingBtnText: { fontSize: 13, fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#0D0D0D' },
  emptySubTitle: { fontSize: 14, color: '#8A8A9A', textAlign: 'center' },
  emptyBtn: { marginTop: 10, backgroundColor: '#0D0D0D', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
});
