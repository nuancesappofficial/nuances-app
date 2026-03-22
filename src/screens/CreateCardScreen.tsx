import React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { generateContentForWord } from '@services/ai';

type Props = {
  navigation: any;
  route: any;
};

type GeneratingCard = {
  word: string;
  progress: number;
  completed: boolean;
};

type CollocationItem = {
  phrase: string;
  example: string;
};

type CompletedCard = {
  word: string;
  partOfSpeech: string;
  definition: string;
  cultural: string;
  collocations: CollocationItem[];
  note: string;
  addedToDeck: boolean;
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you',
  'he', 'she', 'it', 'we', 'they',
]);

function getAnnotationsArray(val: unknown): { text?: string }[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }
  return [];
}

function getCachedItemSourceText(cachedItem: CachedItem): string {
  if (cachedItem.contentText?.trim()) return cachedItem.contentText.trim();

  const annotations = getAnnotationsArray(cachedItem.imageAnnotations);
  const fromAnnotations = annotations
    .map((ann) => ann.text?.trim() || '')
    .filter(Boolean)
    .join(' ');
  if (fromAnnotations) return fromAnnotations;

  return cachedItem.contentUrl || '';
}

function extractWords(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z'-]+\b/g) || [];
  return Array.from(new Set(words)).filter(
    (word) => !STOP_WORDS.has(word) && word.length > 2
  );
}

function normalizeWord(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z'-]/g, '').trim();
}

function collocationsFromText(raw: string): CollocationItem[] {
  if (!raw.trim()) return [];
  const phrases = raw
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  return phrases.map((phrase) => ({
    phrase,
    example: `Example: ${phrase}`,
  }));
}

export default function CreateCardScreen({ navigation, route }: Props) {
  const { cachedItem } = route.params as { cachedItem: CachedItem };

  const sourceText = React.useMemo(() => getCachedItemSourceText(cachedItem), [cachedItem]);
  const sourceTokens = React.useMemo(() => {
    const fromText = sourceText.trim() ? sourceText.trim().split(/\s+/) : [];
    if (fromText.length > 0) return fromText;

    const highlights = Array.isArray(cachedItem.aiHighlightedTerms)
      ? cachedItem.aiHighlightedTerms.filter(Boolean)
      : [];
    if (highlights.length > 0) return highlights;

    return ['example', 'word'];
  }, [cachedItem.aiHighlightedTerms, sourceText]);

  const [selectedWords, setSelectedWords] = React.useState<string[]>([]);
  const [hasStarted, setHasStarted] = React.useState(false);
  const [generatingCards, setGeneratingCards] = React.useState<GeneratingCard[]>([]);
  const [completedCards, setCompletedCards] = React.useState<CompletedCard[]>([]);
  const [showCollocations, setShowCollocations] = React.useState<Record<string, boolean>>({});
  const [generatedWords, setGeneratedWords] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);

  const timersRef = React.useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  React.useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearInterval(timer));
      timersRef.current.clear();
    };
  }, []);

  React.useEffect(() => {
    if (!sourceText.trim()) return;
    const auto = extractWords(sourceText).slice(0, 4);
    if (auto.length > 0) {
      setSelectedWords((prev) => (prev.length > 0 ? prev : auto));
    }
  }, [sourceText]);

  const toggleWord = (word: string) => {
    const cleanWord = normalizeWord(word);
    if (!cleanWord) return;

    setSelectedWords((prev) =>
      prev.includes(cleanWord) ? prev.filter((w) => w !== cleanWord) : [...prev, cleanWord]
    );
  };

  const startProgressTimer = (word: string) => {
    const timer = setInterval(() => {
      setGeneratingCards((prev) =>
        prev.map((card) => {
          if (card.word !== word || card.completed) return card;
          return {
            ...card,
            progress: Math.min(92, card.progress + Math.random() * 18),
          };
        })
      );
    }, 150);
    timersRef.current.set(word, timer);
  };

  const stopProgressTimer = (word: string) => {
    const timer = timersRef.current.get(word);
    if (timer) {
      clearInterval(timer);
      timersRef.current.delete(word);
    }
  };

  const processWord = React.useCallback(
    async (word: string) => {
      startProgressTimer(word);
      try {
        const generated = await generateContentForWord(word, sourceText || word);
        const card: CompletedCard = {
          word,
          partOfSpeech: generated.partOfSpeech || 'noun',
          definition: generated.definition || `${word}（待補充定義）`,
          cultural: generated.contextualExplanation || '',
          collocations: collocationsFromText(generated.frequentCollocations || ''),
          note: '',
          addedToDeck: false,
        };

        stopProgressTimer(word);
        setGeneratingCards((prev) =>
          prev.map((item) =>
            item.word === word ? { ...item, progress: 100, completed: true } : item
          )
        );
        setCompletedCards((prev) => [...prev, card]);
        setGeneratedWords((prev) => new Set([...prev, word]));
      } catch (error) {
        console.error('[CreateCard] generate failed:', word, error);
        stopProgressTimer(word);
        setGeneratingCards((prev) =>
          prev.map((item) =>
            item.word === word ? { ...item, progress: 100, completed: true } : item
          )
        );
        setCompletedCards((prev) => [
          ...prev,
          {
            word,
            partOfSpeech: 'noun',
            definition: `${word}（待補充定義）`,
            cultural: '',
            collocations: [{ phrase: word, example: `Example of ${word}.` }],
            note: '',
            addedToDeck: false,
          },
        ]);
        setGeneratedWords((prev) => new Set([...prev, word]));
      }
    },
    [sourceText]
  );

  const handleGenerate = async () => {
    if (selectedWords.length === 0) return;

    const newWords = selectedWords.filter((word) => !generatedWords.has(word));
    if (newWords.length === 0) return;

    setHasStarted(true);
    setGeneratingCards(newWords.map((word) => ({ word, progress: 0, completed: false })));

    await Promise.all(newWords.map((word) => processWord(word)));

    setTimeout(() => {
      setHasStarted(false);
      setGeneratingCards([]);
    }, 220);
  };

  const updateNote = (word: string, note: string) => {
    setCompletedCards((prev) => prev.map((card) => (card.word === word ? { ...card, note } : card)));
  };

  const toggleCollocations = (word: string) => {
    setShowCollocations((prev) => ({ ...prev, [word]: !prev[word] }));
  };

  const toggleAddToDeck = (word: string) => {
    setCompletedCards((prev) =>
      prev.map((card) => (card.word === word ? { ...card, addedToDeck: !card.addedToDeck } : card))
    );
  };

  const cardsToSave = completedCards.filter((card) => card.addedToDeck);
  const newSelectedWords = selectedWords.filter((word) => !generatedWords.has(word));
  const hasNewWords = newSelectedWords.length > 0;

  const handleSave = async () => {
    if (cardsToSave.length === 0) {
      Alert.alert('尚未選擇', '請先勾選至少一張要加入 Deck 的卡片。');
      return;
    }

    setSaving(true);
    try {
      const cardsCollection = database.get<Card>('cards');
      await database.write(async () => {
        for (const cardDraft of cardsToSave) {
          await cardsCollection.create((card) => {
            card.userId = cachedItem.userId;
            card.cachedItemId = cachedItem.id;
            card.targetWord = cardDraft.word;
            card.targetPhrase = undefined;
            card.originalSentence = sourceText;
            card.definition = cardDraft.definition;
            card.partOfSpeech = cardDraft.partOfSpeech || undefined;
            card.contextualExplanation = cardDraft.cultural || undefined;
            card.frequentCollocations = cardDraft.collocations.map((c) => c.phrase).join(', ') || undefined;
            card.phoneticTranscription = undefined;
            const tags = [cachedItem.sourceApp, 'create-flow'].filter(Boolean) as string[];
            card.tags = tags.length > 0 ? tags : undefined;
            card.sourceApp = cachedItem.sourceApp;
            card.easeFactor = 2.5;
            card.intervalDays = 1;
            card.repetitions = 0;
            card.nextReviewAt = new Date();
          });
        }

        await cachedItem.update((item) => {
          item.convertedToCard = true;
        });
      });

      Alert.alert('完成', `已建立 ${cardsToSave.length} 張卡片`, [
        {
          text: '確定',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('[CreateCard] save failed:', error);
      Alert.alert('錯誤', '儲存卡片失敗，請稍後再試。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Create Card</Text>
          <Text style={styles.headerSubTitle}>Select words to learn</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Original Context</Text>
          <View style={styles.wordsWrap}>
            {sourceTokens.map((token, idx) => {
              const clean = normalizeWord(token);
              const isSelected = selectedWords.includes(clean);
              return (
                <TouchableOpacity
                  key={`${token}-${idx}`}
                  style={[styles.tokenBtn, isSelected && styles.tokenBtnSelected]}
                  onPress={() => toggleWord(token)}
                >
                  <Text style={[styles.tokenText, isSelected && styles.tokenTextSelected]}>{token}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {selectedWords.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Keywords</Text>
            <View style={styles.wordsWrap}>
              {selectedWords.map((word) => {
                const isGenerated = generatedWords.has(word);
                return (
                  <TouchableOpacity
                    key={word}
                    style={[styles.keywordBtn, isGenerated ? styles.keywordBtnGenerated : styles.keywordBtnDefault]}
                    onPress={() => toggleWord(word)}
                  >
                    <Text style={styles.keywordText}>{word}{isGenerated ? ' ✓' : ''}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {hasNewWords && completedCards.length > 0 ? (
              <View style={styles.generateInlineWrap}>
                <TouchableOpacity style={styles.generateInlineBtn} onPress={() => void handleGenerate()}>
                  <Text style={styles.generateInlineText}>
                    + Create {newSelectedWords.length} New Card{newSelectedWords.length > 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {!hasStarted && completedCards.length === 0 ? (
          <View>
            {selectedWords.length > 0 ? (
              <View style={styles.selectedSummary}>
                <Text style={styles.selectedSummaryText}>
                  ✨ {selectedWords.length} word{selectedWords.length > 1 ? 's' : ''} selected
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => void handleGenerate()}
              disabled={selectedWords.length === 0}
              style={[styles.generateButton, selectedWords.length === 0 && styles.generateButtonDisabled]}
            >
              <Text style={styles.generateButtonText}>
                Generate {selectedWords.length > 0 ? `${selectedWords.length} Card${selectedWords.length > 1 ? 's' : ''}` : 'Cards'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {hasStarted && generatingCards.some((card) => !card.completed) ? (
          <View style={styles.generatingWrap}>
            {generatingCards.map((card) => (
              <View key={card.word} style={styles.generatingCard}>
                <View style={styles.generatingHeader}>
                  <Text style={styles.generatingWord}>{card.word}</Text>
                  {card.completed ? <Text style={styles.generatingDone}>✓</Text> : <ActivityIndicator size="small" color="#5B4BD6" />}
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.max(4, card.progress)}%` }]} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {!hasStarted && completedCards.length > 0 ? (
          <View style={styles.completedWrap}>
            {completedCards.map((card) => (
              <View key={card.word} style={styles.cardBlock}>
                <View style={styles.cardHead}>
                  <View>
                    <Text style={styles.cardWord}>{card.word}</Text>
                    <Text style={styles.cardPos}>{card.partOfSpeech}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.pickBtn, card.addedToDeck ? styles.pickBtnOn : styles.pickBtnOff]}
                    onPress={() => toggleAddToDeck(card.word)}
                  >
                    <Text style={[styles.pickBtnText, card.addedToDeck && styles.pickBtnTextOn]}>✓</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.cardSection}>
                  <Text style={styles.cardDefinition}>{card.definition}</Text>
                </View>

                <View style={styles.cardSection}>
                  <Text style={styles.noteLabel}>Your Note</Text>
                  <TextInput
                    value={card.note}
                    onChangeText={(value) => updateNote(card.word, value)}
                    placeholder="Add a personal note..."
                    multiline
                    style={styles.noteInput}
                  />
                </View>

                <TouchableOpacity style={styles.collocationToggle} onPress={() => toggleCollocations(card.word)}>
                  <Text style={styles.collocationTitle}>Collocations</Text>
                  <Text style={styles.collocationArrow}>{showCollocations[card.word] ? '⌃' : '⌄'}</Text>
                </TouchableOpacity>

                {showCollocations[card.word] ? (
                  <View style={styles.collocationBody}>
                    {card.collocations.length > 0 ? (
                      card.collocations.map((col, idx) => (
                        <View key={`${card.word}-col-${idx}`} style={styles.collocationRow}>
                          <Text style={styles.collocationPhrase}>{col.phrase}</Text>
                          <Text style={styles.collocationExample}>"{col.example}"</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.collocationExample}>No collocations generated.</Text>
                    )}
                  </View>
                ) : null}
              </View>
            ))}

            <View style={styles.saveWrap}>
              <TouchableOpacity
                onPress={() => void handleSave()}
                disabled={cardsToSave.length === 0 || saving}
                style={[styles.saveButton, (cardsToSave.length === 0 || saving) && styles.saveButtonDisabled]}
              >
                <Text style={styles.saveButtonText}>
                  {saving
                    ? 'Saving...'
                    : `Save ${cardsToSave.length > 0 ? `${cardsToSave.length} Card${cardsToSave.length > 1 ? 's' : ''}` : 'Cards'} to Deck`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F9',
  },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: '#0D0D0D',
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0D0D0D',
  },
  headerSubTitle: {
    fontSize: 12,
    color: '#9A9AAA',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  block: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
  },
  blockTitle: {
    fontSize: 11,
    color: '#9A9AAA',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  wordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tokenBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F2F2F5',
  },
  tokenBtnSelected: {
    backgroundColor: '#007AFF',
  },
  tokenText: {
    fontSize: 14,
    color: '#0D0D0D',
  },
  tokenTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  keywordBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  keywordBtnDefault: {
    backgroundColor: '#007AFF',
  },
  keywordBtnGenerated: {
    backgroundColor: '#10B981',
  },
  keywordText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  generateInlineWrap: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  generateInlineBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  generateInlineText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedSummary: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  selectedSummaryText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },
  generateButton: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  generatingWrap: {
    gap: 10,
  },
  generatingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
  },
  generatingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  generatingWord: {
    fontSize: 15,
    color: '#0D0D0D',
    fontWeight: '600',
  },
  generatingDone: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '800',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#F2F2F5',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  completedWrap: {
    gap: 12,
  },
  cardBlock: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardHead: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardWord: {
    fontSize: 26,
    color: '#0D0D0D',
    fontWeight: '700',
  },
  cardPos: {
    marginTop: 2,
    fontSize: 12,
    color: '#8A8A9A',
  },
  pickBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickBtnOff: {
    backgroundColor: '#F2F2F5',
  },
  pickBtnOn: {
    backgroundColor: '#10B981',
  },
  pickBtnText: {
    color: '#0D0D0D',
    fontWeight: '800',
    fontSize: 16,
  },
  pickBtnTextOn: {
    color: '#fff',
  },
  cardSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F8',
  },
  cardDefinition: {
    fontSize: 15,
    color: '#0D0D0D',
    lineHeight: 22,
  },
  noteLabel: {
    fontSize: 11,
    color: '#9A9AAA',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  noteInput: {
    minHeight: 68,
    borderRadius: 10,
    backgroundColor: '#F7F7F9',
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlignVertical: 'top',
    fontSize: 13,
    color: '#0D0D0D',
  },
  collocationToggle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collocationTitle: {
    fontSize: 14,
    color: '#0D0D0D',
    fontWeight: '600',
  },
  collocationArrow: {
    fontSize: 15,
    color: '#63637A',
  },
  collocationBody: {
    borderTopWidth: 1,
    borderTopColor: '#F5F5F8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  collocationRow: {
    gap: 4,
  },
  collocationPhrase: {
    fontSize: 13,
    color: '#0D0D0D',
    fontWeight: '600',
  },
  collocationExample: {
    fontSize: 12,
    color: '#7A7A8A',
    fontStyle: 'italic',
  },
  saveWrap: {
    paddingTop: 2,
    paddingBottom: 20,
  },
  saveButton: {
    backgroundColor: '#0D0D0D',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
  },
});
