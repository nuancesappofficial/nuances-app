// Card Review Screen with flip animation
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
  Modal,
  AppState,
  type AppStateStatus,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
// eslint-disable-next-line import/no-unresolved
import { Audio } from 'expo-av';
// eslint-disable-next-line import/no-unresolved
import * as Speech from 'expo-speech';
import YoutubePlayer from 'react-native-youtube-iframe';
import * as WebBrowser from 'expo-web-browser';
import type Card from '@database/models/Card';
import type CachedItem from '@database/models/CachedItem';
import type { PronunciationFeedback } from '../types/database.types';
import { calculateNextReview, type ReviewRating } from '../services/srs/scheduler';
import { database } from '@database/index';
import {
  buildReferenceWaveform,
  normalizeMeteringToWaveform,
} from '../services/pronunciation/coach';
import SubscriptionService from '../services/subscription/SubscriptionService';
import {
  assessPronunciationCloud,
  type CloudLetterSegmentFeedback,
  type CloudPhonemeFeedback,
  type CloudWordFeedback,
} from '../services/pronunciation/cloudCoach';
import { TabSwipeContext } from '../contexts/TabSwipeContext';

const PRONUNCIATION_RECORDING_OPTIONS = {
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

const MAX_VIDEO_SUGGESTIONS = 3;
const MAX_PRONUNCIATION_RECORDING_MS = 10_000;
const MIN_PRONUNCIATION_RECORDING_MS = 350;

type VideoSuggestion = {
  phrase: string;
  searchQuery: string;
  searchUrl: string;
};

type VideoPlaybackState = {
  candidateVideoIds: string[];
  activeIndex: number;
  isLoading: boolean;
  error: string | null;
};

type Props = {
  navigation: any;
  route: any;
};

type HighlightedToken = {
  text: string;
  level: 'red' | 'yellow' | 'green' | null;
};

/** 判斷字串是否為檔案路徑而非實際文字內容 */
function isFilePath(text: string | undefined | null): boolean {
  if (!text) return true;
  return text.startsWith('file://') || text.startsWith('/') || text.startsWith('http');
}

function sanitizePronunciationText(text: string | undefined | null): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (isFilePath(trimmed)) return '';
  // Skip plain URLs and URI-like strings that are not useful for pronunciation.
  if (/^(https?:\/\/|www\.)/i.test(trimmed)) return '';
  if (/^[a-z]+:\/\/\S+/i.test(trimmed)) return '';
  return trimmed;
}

function normalizeWordToken(text: string): string {
  return text
    .toLowerCase()
    .replace(/^[^a-z']+|[^a-z']+$/g, '')
    .trim();
}

function buildHighlightedTokens(
  sentence: string,
  feedback: CloudWordFeedback[]
): HighlightedToken[] {
  const byWord = new Map<string, CloudWordFeedback[]>();
  for (const item of feedback) {
    const key = normalizeWordToken(item.word);
    if (!key) continue;
    const queue = byWord.get(key) || [];
    queue.push(item);
    byWord.set(key, queue);
  }

  const usedCount = new Map<string, number>();
  return sentence.split(/(\s+)/).map((token) => {
    if (/^\s+$/.test(token)) return { text: token, level: null };
    const key = normalizeWordToken(token);
    if (!key) return { text: token, level: null };
    const matches = byWord.get(key) || [];
    const index = usedCount.get(key) || 0;
    usedCount.set(key, index + 1);
    return {
      text: token,
      level: matches[index]?.level ?? null,
    };
  });
}

function parseCollocationPhrases(collocations: string | undefined | null): string[] {
  if (!collocations) return [];
  const normalized = collocations
    .split('\n')
    .map((line) => line.trim())
    .join(', ');

  const tokens = normalized
    .split(/[,;|]/)
    .map((token) => token.replace(/^[-\d.)\s]+/, '').trim())
    .filter(Boolean);

  const unique: string[] = [];
  for (const token of tokens) {
    if (!unique.includes(token)) unique.push(token);
    if (unique.length >= MAX_VIDEO_SUGGESTIONS) break;
  }
  return unique;
}

function sanitizeCollocationPhrase(phrase: string): string {
  return phrase
    .replace(/（[^）]*）/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCollocationSearchQuery(anchorText: string, rawPhrase: string): string {
  const anchor = anchorText.trim();
  const phrase = sanitizeCollocationPhrase(rawPhrase);
  if (!anchor) return `${phrase} collocation`;
  if (!phrase) return `${anchor} collocation`;

  const anchorLower = anchor.toLowerCase();
  const phraseLower = phrase.toLowerCase();
  if (phraseLower === anchorLower || phraseLower.startsWith(`${anchorLower} `)) {
    return `${phrase} collocation`;
  }
  return `${anchor} ${phrase} collocation`;
}

function buildYouTubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

type ResolvedVideoCandidates = {
  videoIds: string[];
};

async function resolveYouTubeVideoCandidates(searchQuery: string): Promise<ResolvedVideoCandidates> {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&hl=en&gl=US`;
    const response = await fetch(searchUrl);
    if (!response.ok) {
      return { videoIds: [] };
    }
    const html = await response.text();
    const rendererMatches = Array.from(html.matchAll(/"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"/g));
    const uniqueVideoIds: string[] = [];
    for (const match of rendererMatches) {
      const id = match[1];
      if (!id) continue;
      if (!uniqueVideoIds.includes(id)) uniqueVideoIds.push(id);
      if (uniqueVideoIds.length >= MAX_VIDEO_SUGGESTIONS) break;
    }
    return { videoIds: uniqueVideoIds };
  } catch {
    return { videoIds: [] };
  }
}

function WaveformStrip({
  values,
  color,
}: {
  values: number[];
  color: string;
}) {
  return (
    <View style={styles.waveRow}>
      {values.map((value, index) => (
        <View
          key={`${color}-${index}`}
          style={[
            styles.waveBar,
            {
              backgroundColor: color,
              height: 8 + value * 28,
            },
          ]}
        />
      ))}
    </View>
  );
}

const PRONUNCIATION_HINT_THRESHOLD = 90;

export default function CardReviewScreen({ navigation, route }: Props) {
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const params = route.params as {
    card?: Card;
    cardId?: string;
    cardIds?: string[];
    queueIndex?: number;
  };
  const [isFlipped, setIsFlipped] = React.useState(false);
  const [flipAnimation] = React.useState(new Animated.Value(0));
  const [card, setCard] = React.useState<Card | null>(params.card ?? null);
  const [isLoadingCard, setIsLoadingCard] = React.useState(false);
  const [cachedItem, setCachedItem] = React.useState<CachedItem | null>(null);
  const [isSpeakingReference, setIsSpeakingReference] = React.useState(false);
  const [isRecordingPronunciation, setIsRecordingPronunciation] = React.useState(false);
  const [showPronunciationCoach, setShowPronunciationCoach] = React.useState(false);
  const [appState, setAppState] = React.useState<AppStateStatus>(AppState.currentState);
  const [referenceWaveform, setReferenceWaveform] = React.useState<number[]>([]);
  const [userWaveform, setUserWaveform] = React.useState<number[]>([]);
  const [pronunciationScore, setPronunciationScore] = React.useState<number | null>(null);
  const [pronunciationFeedbackLines, setPronunciationFeedbackLines] = React.useState<string[]>([]);
  const [wordFeedbackState, setWordFeedbackState] = React.useState<CloudWordFeedback[]>([]);
  const [phonemeFeedbackState, setPhonemeFeedbackState] = React.useState<CloudPhonemeFeedback[]>([]);
  const [letterSegmentState, setLetterSegmentState] = React.useState<CloudLetterSegmentFeedback[]>([]);
  const [isAnalyzingPronunciation, setIsAnalyzingPronunciation] = React.useState(false);
  const [lastRecordingUri, setLastRecordingUri] = React.useState<string | null>(null);
  const [isPlayingUserRecording, setIsPlayingUserRecording] = React.useState(false);
  const [isVideoSectionExpanded, setIsVideoSectionExpanded] = React.useState(false);
  const [videoPlaybackByQuery, setVideoPlaybackByQuery] = React.useState<
    Record<string, VideoPlaybackState>
  >({});
  const latestFeedbackPayloadRef = React.useRef<PronunciationFeedback | null>(null);
  const recordingRef = React.useRef<any | null>(null);
  const userRecordingSoundRef = React.useRef<any | null>(null);
  const meteringBufferRef = React.useRef<number[]>([]);
  const queueCardIds = React.useMemo(() => {
    if (Array.isArray(params.cardIds) && params.cardIds.length > 0) {
      return params.cardIds;
    }
    if (params.cardId) return [params.cardId];
    if (params.card?.id) return [params.card.id];
    return [];
  }, [params.cardIds, params.cardId, params.card]);
  const queueIndex =
    typeof params.queueIndex === 'number' && params.queueIndex >= 0
      ? params.queueIndex
      : 0;
  const currentCardId =
    queueCardIds[queueIndex] || params.cardId || params.card?.id || null;
  const pronunciationText = React.useMemo(() => {
    return (
      sanitizePronunciationText(card?.targetWord) ||
      sanitizePronunciationText(card?.targetPhrase) ||
      sanitizePronunciationText(card?.originalSentence) ||
      ''
    );
  }, [card?.originalSentence, card?.targetPhrase, card?.targetWord]);
  const collocationPhrases = React.useMemo(
    () => parseCollocationPhrases(card?.frequentCollocations),
    [card?.frequentCollocations]
  );
  const videoSuggestions = React.useMemo(() => {
    const anchorText = card?.targetPhrase?.trim() || card?.targetWord?.trim() || '';
    return collocationPhrases.map((phrase) => {
      const searchQuery = buildCollocationSearchQuery(anchorText, phrase);
      return {
        phrase,
        searchQuery,
        searchUrl: buildYouTubeSearchUrl(searchQuery),
      };
    });
  }, [card?.targetPhrase, card?.targetWord, collocationPhrases]);
  const highlightedPronunciationTokens = React.useMemo(
    () => buildHighlightedTokens(pronunciationText || card?.targetWord || '', wordFeedbackState),
    [card?.targetWord, pronunciationText, wordFeedbackState]
  );
  const weakPhonemeHints = React.useMemo(
    () => phonemeFeedbackState.filter((item) => item.accuracy < PRONUNCIATION_HINT_THRESHOLD),
    [phonemeFeedbackState]
  );

  React.useEffect(() => {
    setIsFlipped(false);
    flipAnimation.setValue(0);
    setIsVideoSectionExpanded(false);
    setVideoPlaybackByQuery({});
  }, [currentCardId, flipAnimation]);

  React.useEffect(() => {
    let active = true;
    const loadCard = async () => {
      if (!currentCardId) {
        setCard(null);
        return;
      }

      if (params.card && params.card.id === currentCardId) {
        setCard(params.card);
        return;
      }

      setIsLoadingCard(true);
      try {
        const loaded = await database.get<Card>('cards').find(currentCardId);
        if (active) {
          setCard(loaded);
        }
      } catch (error) {
        console.error('[CardReview] Failed to load card:', error);
        if (active) {
          setCard(null);
        }
      } finally {
        if (active) {
          setIsLoadingCard(false);
        }
      }
    };

    void loadCard();
    return () => {
      active = false;
    };
  }, [currentCardId, params.card]);

  // 取得關聯的 cachedItem（用於顯示原圖）
  React.useEffect(() => {
    if (!card?.cachedItemId) {
      setCachedItem(null);
      return;
    }

    if (card.cachedItemId) {
      database
        .get<CachedItem>('cached_items')
        .find(card.cachedItemId)
        .then(setCachedItem)
        .catch(() => setCachedItem(null));
    }
  }, [card?.cachedItemId]);

  React.useEffect(() => {
    setReferenceWaveform(buildReferenceWaveform(pronunciationText));
    setUserWaveform([]);
    setPronunciationScore(null);
    setPronunciationFeedbackLines([]);
    setWordFeedbackState([]);
    setPhonemeFeedbackState([]);
    setLetterSegmentState([]);
    setIsAnalyzingPronunciation(false);
    setLastRecordingUri(null);
    latestFeedbackPayloadRef.current = null;
  }, [pronunciationText]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });
    return () => {
      sub.remove();
    };
  }, []);

  React.useEffect(() => {
    return () => {
      Speech.stop();
      const activeRecording = recordingRef.current;
      if (activeRecording) {
        void activeRecording.stopAndUnloadAsync().catch(() => undefined);
      }
      const previewSound = userRecordingSoundRef.current;
      userRecordingSoundRef.current = null;
      if (previewSound) {
        void previewSound.unloadAsync().catch(() => undefined);
      }
    };
  }, []);

  const stopUserRecordingPreview = React.useCallback(async () => {
    const previewSound = userRecordingSoundRef.current;
    userRecordingSoundRef.current = null;
    if (previewSound) {
      await previewSound.stopAsync().catch(() => undefined);
      await previewSound.unloadAsync().catch(() => undefined);
    }
    setIsPlayingUserRecording(false);
  }, []);

  const flipCard = () => {
    Animated.spring(flipAnimation, {
      toValue: isFlipped ? 0 : 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const playReferenceAudio = async () => {
    if (!pronunciationText) return;
    try {
      setIsSpeakingReference(true);
      Speech.stop();
      Speech.speak(pronunciationText, {
        language: 'en-US',
        rate: 0.95,
        pitch: 1.0,
        onDone: () => setIsSpeakingReference(false),
        onStopped: () => setIsSpeakingReference(false),
        onError: () => setIsSpeakingReference(false),
      });
    } catch (error) {
      console.error('[Pronunciation] Failed to speak reference:', error);
      setIsSpeakingReference(false);
    }
  };

  const startPronunciationRecording = async () => {
    try {
      if (isAnalyzingPronunciation) return;
      if (!pronunciationText.trim()) {
        Alert.alert('無可評分句子', '請先選擇有可朗讀句子的卡片再進行發音分析。');
        return;
      }
      if (appState !== 'active') {
        Alert.alert('請回到前景再錄音', 'App 在背景時 iOS 無法啟動錄音音訊工作階段。');
        return;
      }
      if (!card?.userId) {
        Alert.alert('尚未登入', '請先登入後再使用發音教練。');
        return;
      }

      const quota = await SubscriptionService.consumeVoiceQuota(card.userId);
      if (!quota.allowed) {
        Alert.alert(
          '今日免費額度已用完',
          '升級 Premium 解鎖無限次精準發音糾正。',
          [
            { text: '稍後', style: 'cancel' },
            {
              text: '前往設定',
              onPress: () => {
                if (tabSwipeContext) {
                  tabSwipeContext.goToTab(2);
                  return;
                }
                navigation.navigate('Profile');
              },
            },
          ]
        );
        return;
      }

      setPronunciationScore(null);
      setPronunciationFeedbackLines([]);
      setWordFeedbackState([]);
      setPhonemeFeedbackState([]);
      setLetterSegmentState([]);
      latestFeedbackPayloadRef.current = null;
      await stopUserRecordingPreview();

      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要麥克風權限', '請先允許麥克風，才能做發音比對。');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      Speech.stop();
      setIsSpeakingReference(false);

      const recording = new Audio.Recording();
      meteringBufferRef.current = [];
      await recording.prepareToRecordAsync(PRONUNCIATION_RECORDING_OPTIONS as any);
      recording.setProgressUpdateInterval(120);
      recording.setOnRecordingStatusUpdate((status: any) => {
        if (!status.isRecording) return;
        if (typeof status.metering === 'number' && Number.isFinite(status.metering)) {
          meteringBufferRef.current.push(status.metering);
        }
        if (
          typeof status.durationMillis === 'number' &&
          status.durationMillis >= MAX_PRONUNCIATION_RECORDING_MS
        ) {
          void stopPronunciationRecording();
        }
      });
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecordingPronunciation(true);
      setWordFeedbackState([]);
      setPhonemeFeedbackState([]);
      setLetterSegmentState([]);
    } catch (error) {
      console.error('[Pronunciation] start recording failed:', error);
      setIsRecordingPronunciation(false);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('currently in the background')) {
        Alert.alert('請回到前景再錄音', '請將 App 切回前景後重試錄音。');
      } else {
        Alert.alert('錄音失敗', '請再試一次。');
      }
    }
  };

  const stopPronunciationRecording = async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    try {
      const statusBeforeStop = await recording.getStatusAsync();
      const durationMillis =
        statusBeforeStop.isLoaded && typeof statusBeforeStop.durationMillis === 'number'
          ? statusBeforeStop.durationMillis
          : 0;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (Platform.OS === 'ios' && uri && !uri.toLowerCase().endsWith('.wav')) {
        throw new Error(`錄音格式錯誤，預期 .wav，實際 URI: ${uri}`);
      }
      recordingRef.current = null;
      setIsRecordingPronunciation(false);
      setLastRecordingUri(uri || null);

      const userWave = normalizeMeteringToWaveform(meteringBufferRef.current);
      const refWave =
        referenceWaveform.length > 0
          ? referenceWaveform
          : buildReferenceWaveform(pronunciationText);
      setReferenceWaveform(refWave);
      setUserWaveform(userWave);

      if (!uri) {
        throw new Error('錄音檔遺失，請重新錄音');
      }
      if (durationMillis > 0 && durationMillis < MIN_PRONUNCIATION_RECORDING_MS) {
        throw new Error('錄音太短，請至少清楚唸出一個完整單字再送出');
      }

      setIsAnalyzingPronunciation(true);
      const result = await assessPronunciationCloud({
        referenceText: pronunciationText,
        audioUri: uri,
        locale: 'en-US',
      });

      setPronunciationScore(result.score);
      setPronunciationFeedbackLines(result.feedbackLines);
      setWordFeedbackState(result.wordFeedback);
      setPhonemeFeedbackState(result.phonemeFeedback);
      setLetterSegmentState(result.letterSegments);
      latestFeedbackPayloadRef.current = result.feedbackPayload;
    } catch (error) {
      console.error('[Pronunciation] stop recording failed:', error);
      setIsRecordingPronunciation(false);
      const message = error instanceof Error ? error.message : '無法完成發音分析，請稍後再試。';
      Alert.alert('分析失敗', message);
    } finally {
      setIsAnalyzingPronunciation(false);
    }
  };

  const togglePronunciationRecording = async () => {
    if (isAnalyzingPronunciation) return;
    if (isRecordingPronunciation) {
      await stopPronunciationRecording();
      return;
    }
    await startPronunciationRecording();
  };

  const playLastRecordingPreview = async () => {
    if (!lastRecordingUri) {
      Alert.alert('尚無錄音', '請先完成一次錄音後再重播。');
      return;
    }
    if (isRecordingPronunciation || isAnalyzingPronunciation) return;
    if (isPlayingUserRecording) {
      await stopUserRecordingPreview();
      return;
    }
    try {
      await stopUserRecordingPreview();
      const result = await Audio.Sound.createAsync(
        { uri: lastRecordingUri },
        { shouldPlay: true, progressUpdateIntervalMillis: 120 }
      );
      userRecordingSoundRef.current = result.sound;
      setIsPlayingUserRecording(true);
      result.sound.setOnPlaybackStatusUpdate((status: any) => {
        if (!status?.isLoaded) return;
        if (status.didJustFinish) {
          void stopUserRecordingPreview();
        }
      });
    } catch (error) {
      console.error('[Pronunciation] preview playback failed:', error);
      setIsPlayingUserRecording(false);
      Alert.alert('重播失敗', '無法播放這段錄音，請重新錄音再試。');
    }
  };

  const closePronunciationCoach = React.useCallback(() => {
    if (isRecordingPronunciation) {
      const recording = recordingRef.current;
      recordingRef.current = null;
      setIsRecordingPronunciation(false);
      if (recording) {
        void recording.stopAndUnloadAsync().catch(() => undefined);
      }
    }
    Speech.stop();
    setIsSpeakingReference(false);
    setIsAnalyzingPronunciation(false);
    void stopUserRecordingPreview();
    setShowPronunciationCoach(false);
  }, [isRecordingPronunciation, stopUserRecordingPreview]);

  const openVideoSuggestionExternally = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      });
    } catch (error) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (!supported) {
          Alert.alert('無法開啟連結', '目前裝置無法開啟 YouTube 搜尋頁面。');
          return;
        }
        await Linking.openURL(url);
      } catch (innerError) {
        console.error('[CardReview] open video suggestion failed:', innerError);
        Alert.alert('開啟失敗', '請稍後再試。');
      }
    }
  };

  const loadVideoForSuggestion = React.useCallback(async (suggestion: VideoSuggestion) => {
    setVideoPlaybackByQuery((prev) => ({
      ...prev,
      [suggestion.searchQuery]: {
        candidateVideoIds: [],
        activeIndex: 0,
        isLoading: true,
        error: null,
      },
    }));

    const candidates = await resolveYouTubeVideoCandidates(suggestion.searchQuery);
    setVideoPlaybackByQuery((prev) => ({
      ...prev,
      [suggestion.searchQuery]: {
        candidateVideoIds: candidates.videoIds,
        activeIndex: 0,
        isLoading: false,
        error: candidates.videoIds.length > 0 ? null : '找不到可內嵌播放影片，請改用外開。',
      },
    }));
  }, []);

  React.useEffect(() => {
    if (!isVideoSectionExpanded) return;
    videoSuggestions.forEach((suggestion) => {
      const playback = videoPlaybackByQuery[suggestion.searchQuery];
      if (!playback) {
        void loadVideoForSuggestion(suggestion);
      }
    });
  }, [isVideoSectionExpanded, videoSuggestions, videoPlaybackByQuery, loadVideoForSuggestion]);

  const handleInlineVideoError = React.useCallback((searchQuery: string, errorCode?: number) => {
    setVideoPlaybackByQuery((prev) => {
      const current = prev[searchQuery];
      if (!current) return prev;
      const hasNext = current.activeIndex + 1 < current.candidateVideoIds.length;
      if (hasNext) {
        return {
          ...prev,
          [searchQuery]: {
            ...current,
            activeIndex: current.activeIndex + 1,
            isLoading: true,
            error: null,
          },
        };
      }

      const reason =
        errorCode !== undefined
          ? `站內播放失敗（YouTube 錯誤碼 ${String(errorCode)}），請改用外開。`
          : '站內播放失敗，請改用外開。';
      return {
        ...prev,
        [searchQuery]: {
          ...current,
          isLoading: false,
          error: reason,
        },
      };
    });
  }, []);

  const handleRating = async (rating: ReviewRating) => {
    if (!card) return;

    try {
      // Update card with new SRS values
      const newSRSData = calculateNextReview(
        {
          easeFactor: card.easeFactor,
          intervalDays: card.intervalDays,
          repetitions: card.repetitions,
          nextReviewAt: new Date(card.nextReviewAt),
          lastReviewedAt: card.lastReviewedAt ? new Date(card.lastReviewedAt) : null,
        },
        rating
      );

      await database.write(async () => {
        await card.update((c) => {
          c.easeFactor = newSRSData.easeFactor;
          c.intervalDays = newSRSData.intervalDays;
          c.repetitions = newSRSData.repetitions;
          c.nextReviewAt = newSRSData.nextReviewAt;
          c.lastReviewedAt = newSRSData.lastReviewedAt || new Date();
        });
      });

      // Record review history
      const reviewHistoryCollection = database.get('review_history');
      await database.write(async () => {
        await reviewHistoryCollection.create((review: any) => {
          review.userId = card.userId;
          review.cardId = card.id;
          review.rating = rating;
          review.userAudioUrl = lastRecordingUri || undefined;
          review.pronunciationScore = pronunciationScore ?? undefined;
          review.pronunciationFeedback = latestFeedbackPayloadRef.current || undefined;
        });
      });

      const nextQueueIndex = queueIndex + 1;
      if (nextQueueIndex < queueCardIds.length) {
        navigation.replace('CardReview', {
          cardId: queueCardIds[nextQueueIndex],
          cardIds: queueCardIds,
          queueIndex: nextQueueIndex,
        });
        return;
      }

      navigation.goBack();
    } catch (error) {
      console.error('Error updating card:', error);
    }
  };

  const frontAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnimation.interpolate({
          inputRange: [0, 180],
          outputRange: ['0deg', '180deg'],
        }),
      },
    ],
  };

  const backAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnimation.interpolate({
          inputRange: [0, 180],
          outputRange: ['180deg', '360deg'],
        }),
      },
    ],
  };

  if (isLoadingCard || !card) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>複習卡片</Text>
          <View style={styles.closeButton} />
        </View>
        <View style={styles.loadingCardContainer}>
          <Text style={styles.loadingCardText}>載入卡片中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Parse tags if they're stored as JSON string
  let tags: string[] = [];
  if (card.tags) {
    if (typeof card.tags === 'string') {
      try {
        const parsed = JSON.parse(card.tags);
        tags = Array.isArray(parsed) ? parsed : [];
      } catch {
        tags = [];
      }
    } else if (Array.isArray(card.tags)) {
      tags = card.tags;
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with close button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>複習卡片</Text>
        {queueCardIds.length > 1 ? (
          <Text style={styles.queueProgressText}>
            {Math.min(queueIndex + 1, queueCardIds.length)}/{queueCardIds.length}
          </Text>
        ) : (
          <View style={styles.closeButton} />
        )}
      </View>

      <View style={styles.cardContainer}>
        {/* Front Side */}
        {!isFlipped && (
          <Animated.View style={[styles.card, frontAnimatedStyle]}>
            <ScrollView style={styles.cardContent} showsVerticalScrollIndicator={false} contentContainerStyle={styles.cardScrollContent}>
              <Text style={styles.label}>Word</Text>
              <Text style={styles.targetWord}>{card.targetWord}</Text>

              {card.targetPhrase && (
                <>
                  <Text style={styles.label}>Phrase</Text>
                  <Text style={styles.targetPhrase}>{card.targetPhrase}</Text>
                </>
              )}

              {/* 原圖預覽 */}
              {cachedItem?.contentType === 'image' && cachedItem.imageStoragePath && (
                <View style={styles.contextImageContainer}>
                  <Image
                    source={{ uri: cachedItem.imageStoragePath }}
                    style={styles.contextImage}
                    resizeMode="contain"
                  />
                </View>
              )}

              {/* Context：只顯示文字，不顯示路徑 */}
              {!isFilePath(card.originalSentence) && (
                <>
                  <Text style={styles.label}>AI Input Sentence</Text>
                  <Text style={styles.originalSentence}>
                    {card.originalSentence}
                  </Text>
                </>
              )}

              {card.frequentCollocations && (
                <>
                  <Text style={styles.label}>Frequent Collocations</Text>
                  <Text style={styles.originalSentence}>
                    {card.frequentCollocations}
                  </Text>
                </>
              )}

              {videoSuggestions.length > 0 && (
                <View style={styles.videoSection}>
                  <View style={styles.videoSectionHeader}>
                    <Text style={styles.label}>Collocation Videos</Text>
                    <TouchableOpacity
                      style={styles.videoSectionToggleButton}
                      onPress={() => setIsVideoSectionExpanded((prev) => !prev)}
                    >
                      <Text style={styles.videoSectionToggleButtonText}>
                        {isVideoSectionExpanded ? '收合' : '展開全部'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isVideoSectionExpanded && (
                    <View style={styles.inlineVideoList}>
                      {videoSuggestions.map((suggestion, index) => {
                        const playback = videoPlaybackByQuery[suggestion.searchQuery];
                        const activeVideoId =
                          playback &&
                          playback.candidateVideoIds.length > 0 &&
                          playback.activeIndex < playback.candidateVideoIds.length
                            ? playback.candidateVideoIds[playback.activeIndex]
                            : null;
                        return (
                          <View key={`${suggestion.searchQuery}-${index}`} style={styles.inlineVideoContainer}>
                            <View style={styles.inlineVideoHeader}>
                              <Text style={styles.inlineVideoTitle} numberOfLines={1}>
                                {suggestion.phrase}
                              </Text>
                              <TouchableOpacity
                                style={styles.inlineVideoExternalButton}
                                onPress={() => {
                                  void openVideoSuggestionExternally(suggestion.searchUrl);
                                }}
                              >
                                <Text style={styles.inlineVideoExternalButtonText}>外開</Text>
                              </TouchableOpacity>
                            </View>

                            {(!playback || playback.isLoading) && (
                              <View style={styles.inlineVideoLoading}>
                                <ActivityIndicator size="small" color="#1565c0" />
                                <Text style={styles.inlineVideoLoadingText}>載入影片中...</Text>
                              </View>
                            )}

                            {playback && activeVideoId && !playback.isLoading && (
                              <YoutubePlayer
                                key={`${suggestion.searchQuery}-${activeVideoId}`}
                                height={220}
                                play={false}
                                videoId={activeVideoId}
                                onReady={() => {
                                  setVideoPlaybackByQuery((prev) => {
                                    const current = prev[suggestion.searchQuery];
                                    if (!current) return prev;
                                    return {
                                      ...prev,
                                      [suggestion.searchQuery]: {
                                        ...current,
                                        isLoading: false,
                                        error: null,
                                      },
                                    };
                                  });
                                }}
                                onError={(error: unknown) => {
                                  const parsed = Number(error);
                                  handleInlineVideoError(
                                    suggestion.searchQuery,
                                    Number.isFinite(parsed) ? parsed : undefined
                                  );
                                }}
                                webViewStyle={styles.inlineVideoWebView}
                              />
                            )}

                            {playback && !activeVideoId && playback.error && (
                              <View style={styles.inlineVideoErrorBox}>
                                <Text style={styles.inlineVideoErrorText}>{playback.error}</Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {card.phoneticTranscription && (
                <>
                  <View style={styles.pronunciationHeaderRow}>
                    <Text style={styles.label}>Pronunciation</Text>
                    <TouchableOpacity
                      style={styles.coachEntryButton}
                      onPress={() => setShowPronunciationCoach(true)}
                    >
                      <Text style={styles.coachEntryButtonText}>🎙 Coach</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => setShowPronunciationCoach(true)}>
                    <Text style={styles.phonetic}>
                      {card.phoneticTranscription}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {card.partOfSpeech && (
                <>
                  <Text style={styles.label}>Part of Speech</Text>
                  <Text style={styles.originalSentence}>{card.partOfSpeech}</Text>
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.flipButton} onPress={flipCard}>
              <Text style={styles.flipButtonText}>🔄 Show Answer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Back Side */}
        {isFlipped && (
          <Animated.View style={[styles.card, backAnimatedStyle]}>
            <ScrollView style={styles.cardContent} showsVerticalScrollIndicator={false} contentContainerStyle={styles.cardScrollContent}>
              <Text style={styles.label}>Definition</Text>
              <Text style={styles.definition}>{card.definition}</Text>

              {card.contextualExplanation && (
                <>
                  <Text style={styles.label}>Explanation</Text>
                  <Text style={styles.explanation}>
                    {card.contextualExplanation}
                  </Text>
                </>
              )}

              {/* 原圖預覽（背面也顯示） */}
              {cachedItem?.contentType === 'image' && cachedItem.imageStoragePath && (
                <View style={styles.contextImageContainer}>
                  <Image
                    source={{ uri: cachedItem.imageStoragePath }}
                    style={styles.contextImage}
                    resizeMode="contain"
                  />
                </View>
              )}

              {/* Context（背面也顯示短句，不顯示路徑） */}
              {!isFilePath(card.originalSentence) && (
                <>
                  <Text style={styles.label}>Context</Text>
                  <Text style={styles.originalSentence}>
                    {card.originalSentence}
                  </Text>
                </>
              )}

              {tags && tags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {tags.map((tag: string, index: number) => (
                    <View key={index} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.flipButton, styles.flipButtonSecondary]}
              onPress={flipCard}
            >
              <Text style={styles.flipButtonText}>🔄 Show Question</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* Rating Buttons */}
      {isFlipped && (
        <View style={styles.ratingContainer}>
          <Text style={styles.ratingLabel}>How well did you know this?</Text>
          
          <View style={styles.ratingButtons}>
            <TouchableOpacity
              style={[styles.ratingButton, styles.ratingAgain]}
              onPress={() => handleRating(1)}
            >
              <Text style={styles.ratingButtonText}>Again</Text>
              <Text style={styles.ratingInterval}>{'<1m'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ratingButton, styles.ratingHard]}
              onPress={() => handleRating(2)}
            >
              <Text style={styles.ratingButtonText}>Hard</Text>
              <Text style={styles.ratingInterval}>{'<6m'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ratingButton, styles.ratingGood]}
              onPress={() => handleRating(3)}
            >
              <Text style={styles.ratingButtonText}>Good</Text>
              <Text style={styles.ratingInterval}>
                {card.intervalDays}d
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ratingButton, styles.ratingEasy]}
              onPress={() => handleRating(4)}
            >
              <Text style={styles.ratingButtonText}>Easy</Text>
              <Text style={styles.ratingInterval}>
                {Math.round(card.intervalDays * card.easeFactor)}d
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Progress Info */}
      <View style={styles.progressInfo}>
        <Text style={styles.progressText}>
          Reviewed: {card.repetitions} times
        </Text>
        <Text style={styles.progressText}>
          Interval: {card.intervalDays} days
        </Text>
        <Text style={styles.progressText}>
          Ease: {card.easeFactor.toFixed(2)}
        </Text>
      </View>

      <Modal
        visible={showPronunciationCoach}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePronunciationCoach}
      >
        <SafeAreaView style={styles.coachModalContainer}>
          <View style={styles.coachModalHeader}>
            <Text style={styles.coachModalTitle}>Pronunciation Coach</Text>
            <TouchableOpacity onPress={closePronunciationCoach} style={styles.coachModalClose}>
              <Text style={styles.coachModalCloseText}>完成</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.coachModalBody} contentContainerStyle={styles.coachModalBodyContent}>
            <Text style={styles.coachSentenceLabel}>AI Input Sentence</Text>
            <Text style={styles.coachSentenceText}>
              {highlightedPronunciationTokens.length > 0
                ? highlightedPronunciationTokens.map((token, index) => (
                  <Text
                    key={`token-${index}`}
                    style={
                      token.level === 'red'
                        ? styles.wordLevelRed
                        : token.level === 'yellow'
                          ? styles.wordLevelYellow
                          : token.level === 'green'
                            ? styles.wordLevelGreen
                            : undefined
                    }
                  >
                    {token.text}
                  </Text>
                ))
                : pronunciationText || card.targetWord}
            </Text>

            <View style={styles.pronunciationButtonsRow}>
              <TouchableOpacity
                style={[styles.coachButton, styles.referenceButton]}
                onPress={() => {
                  void playReferenceAudio();
                }}
                disabled={isSpeakingReference || isRecordingPronunciation || isAnalyzingPronunciation}
              >
                <Text style={styles.coachButtonText}>
                  {isSpeakingReference ? '播放中...' : '播放參考音'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.coachButton,
                  isRecordingPronunciation ? styles.stopButton : styles.recordButton,
                ]}
                onPress={() => {
                  void togglePronunciationRecording();
                }}
                disabled={isAnalyzingPronunciation}
              >
                <Text style={styles.coachButtonText}>
                  {isAnalyzingPronunciation
                    ? '分析中...'
                    : isRecordingPronunciation
                      ? '停止並分析'
                      : '開始錄音'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.coachButton,
                  styles.replayButton,
                  (!lastRecordingUri || isRecordingPronunciation || isAnalyzingPronunciation)
                    ? styles.replayButtonDisabled
                    : null,
                ]}
                onPress={() => {
                  void playLastRecordingPreview();
                }}
                disabled={!lastRecordingUri || isRecordingPronunciation || isAnalyzingPronunciation}
              >
                <Text style={styles.coachButtonText}>
                  {isPlayingUserRecording ? '停止重播' : '重播錄音'}
                </Text>
              </TouchableOpacity>
            </View>

            {isAnalyzingPronunciation && (
              <View style={styles.analyzingRow}>
                <ActivityIndicator size="small" color="#1565c0" />
                <Text style={styles.analyzingText}>AI 正在分析您的聲紋與連音...</Text>
              </View>
            )}

            <Text style={styles.waveLabel}>Reference Wave</Text>
            <WaveformStrip values={referenceWaveform} color="#4CAF50" />

            <Text style={styles.waveLabel}>Your Wave</Text>
            <WaveformStrip
              values={userWaveform.length > 0 ? userWaveform : new Array(24).fill(0.04)}
              color="#2196F3"
            />

            <Text style={styles.pronunciationScoreText}>
              {pronunciationScore !== null
                ? `Pronunciation Score: ${pronunciationScore}/100`
                : '完成錄音後會顯示分數與口腔動作建議'}
            </Text>

            {letterSegmentState.length > 0 && (
              <View style={styles.segmentSection}>
                <Text style={styles.segmentSectionTitle}>字內區段分析（phoneme 映射）</Text>
                <View style={styles.segmentChipRow}>
                  {letterSegmentState.map((segment, index) => (
                    <View
                      key={`segment-${index}`}
                      style={[
                        styles.segmentChip,
                        segment.level === 'red'
                          ? styles.segmentChipRed
                          : segment.level === 'yellow'
                            ? styles.segmentChipYellow
                            : styles.segmentChipGreen,
                      ]}
                    >
                      <Text style={styles.segmentChipText}>{segment.letters || segment.text}</Text>
                      <Text style={styles.segmentChipMeta}>
                        {segment.accuracy}% / {segment.phoneme}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {weakPhonemeHints.length > 0 && (
              <View style={styles.segmentSection}>
                <Text style={styles.segmentSectionTitle}>音素改進建議（{`<${PRONUNCIATION_HINT_THRESHOLD}%`}）</Text>
                {weakPhonemeHints
                  .slice(0, 4)
                  .map((item, index) => (
                    <View key={`phoneme-hint-${index}`} style={styles.phonemeHintCard}>
                      <Text style={styles.phonemeHintTitle}>
                        {(item.letters || item.phoneme)} · {item.accuracy}%
                      </Text>
                      <Text style={styles.phonemeHintMeta}>
                        目標音 {item.phoneme}
                        {item.spokenPhoneme ? ` / 目前更接近 ${item.spokenPhoneme}` : ''}
                      </Text>
                      {item.suggestion ? (
                        <Text style={styles.phonemeHintBody}>{item.suggestion}</Text>
                      ) : null}
                    </View>
                  ))}
              </View>
            )}

            {pronunciationFeedbackLines.length > 0 && (
              <View style={styles.feedbackList}>
                {pronunciationFeedbackLines.map((line, index) => (
                  <Text key={`feedback-${index}`} style={styles.feedbackText}>
                    • {line}
                  </Text>
                ))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  queueProgressText: {
    minWidth: 40,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  loadingCardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingCardText: {
    fontSize: 15,
    color: '#666',
  },
  cardContainer: {
    flex: 1,
    marginTop: 8,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    backfaceVisibility: 'hidden',
  },
  cardContent: {
    flex: 1,
  },
  cardScrollContent: {
    paddingBottom: 8,
  },
  contextImageContainer: {
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  contextImage: {
    width: '100%',
    height: 160,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
  },
  targetWord: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  targetPhrase: {
    fontSize: 18,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  originalSentence: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
    fontStyle: 'italic',
  },
  phonetic: {
    fontSize: 16,
    color: '#2196F3',
    fontFamily: 'monospace',
  },
  definition: {
    fontSize: 18,
    color: '#333',
    lineHeight: 26,
  },
  explanation: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  pronunciationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  coachEntryButton: {
    backgroundColor: '#e3f2fd',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  coachEntryButtonText: {
    color: '#1565c0',
    fontSize: 12,
    fontWeight: '700',
  },
  coachModalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  coachModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e6edf3',
  },
  coachModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#24323f',
  },
  coachModalClose: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#e3f2fd',
  },
  coachModalCloseText: {
    color: '#1565c0',
    fontSize: 13,
    fontWeight: '700',
  },
  coachModalBody: {
    flex: 1,
  },
  coachModalBodyContent: {
    padding: 16,
    gap: 10,
  },
  coachSentenceLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5b6c7a',
    textTransform: 'uppercase',
  },
  coachSentenceText: {
    fontSize: 16,
    color: '#1f2f3c',
    lineHeight: 24,
    fontStyle: 'italic',
  },
  wordLevelRed: {
    color: '#d32f2f',
    fontWeight: '700',
  },
  wordLevelYellow: {
    color: '#f9a825',
    fontWeight: '700',
  },
  wordLevelGreen: {
    color: '#2e7d32',
    fontWeight: '700',
  },
  pronunciationCoachCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f6fbff',
    borderWidth: 1,
    borderColor: '#d2e7f8',
    gap: 8,
  },
  pronunciationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#245f8a',
  },
  videoSection: {
    marginTop: 12,
  },
  videoSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  videoSectionToggleButton: {
    marginTop: 12,
    backgroundColor: '#e8f2fb',
    borderWidth: 1,
    borderColor: '#c7dff5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  videoSectionToggleButtonText: {
    color: '#235279',
    fontSize: 12,
    fontWeight: '700',
  },
  inlineVideoList: {
    marginTop: 8,
    gap: 10,
  },
  inlineVideoContainer: {
    borderWidth: 1,
    borderColor: '#d2e3f3',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f7fbff',
  },
  inlineVideoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#e8f2fb',
  },
  inlineVideoTitle: {
    flex: 1,
    color: '#1b3f5b',
    fontSize: 13,
    fontWeight: '700',
    marginRight: 10,
  },
  inlineVideoExternalButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#294861',
  },
  inlineVideoExternalButtonText: {
    color: '#d6ebff',
    fontSize: 12,
    fontWeight: '700',
  },
  inlineVideoLoading: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
  },
  inlineVideoLoadingText: {
    color: '#4b6172',
    fontSize: 12,
    fontWeight: '600',
  },
  inlineVideoWebView: {
    height: 220,
    backgroundColor: '#000',
  },
  inlineVideoErrorBox: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  inlineVideoErrorText: {
    color: '#8a3b2c',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
  pronunciationButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  coachButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  referenceButton: {
    backgroundColor: '#4CAF50',
  },
  recordButton: {
    backgroundColor: '#2196F3',
  },
  stopButton: {
    backgroundColor: '#ff7043',
  },
  replayButton: {
    backgroundColor: '#607d8b',
  },
  replayButtonDisabled: {
    backgroundColor: '#b0bec5',
  },
  coachButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  analyzingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  analyzingText: {
    fontSize: 12,
    color: '#1565c0',
    fontWeight: '600',
  },
  waveLabel: {
    fontSize: 11,
    color: '#5a6d7d',
    fontWeight: '600',
    marginTop: 4,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 40,
  },
  waveBar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 4,
  },
  pronunciationScoreText: {
    fontSize: 12,
    color: '#35566f',
    fontWeight: '600',
    marginTop: 4,
  },
  segmentSection: {
    marginTop: 10,
    gap: 8,
  },
  segmentSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#35566f',
  },
  segmentChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentChip: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 72,
  },
  segmentChipRed: {
    backgroundColor: '#fdecea',
    borderWidth: 1,
    borderColor: '#ef9a9a',
  },
  segmentChipYellow: {
    backgroundColor: '#fff8e1',
    borderWidth: 1,
    borderColor: '#ffd54f',
  },
  segmentChipGreen: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#81c784',
  },
  segmentChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#22313f',
  },
  segmentChipMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#4f6170',
  },
  phonemeHintCard: {
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d9e2ec',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  phonemeHintTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22313f',
  },
  phonemeHintMeta: {
    fontSize: 11,
    color: '#5a6d7d',
  },
  phonemeHintBody: {
    fontSize: 12,
    lineHeight: 18,
    color: '#314657',
  },
  feedbackList: {
    gap: 2,
    marginTop: 2,
  },
  feedbackText: {
    fontSize: 12,
    color: '#4f6170',
    lineHeight: 18,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  tag: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '600',
  },
  flipButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  flipButtonSecondary: {
    backgroundColor: '#2196F3',
  },
  flipButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  ratingContainer: {
    marginBottom: 8,
    marginHorizontal: 12,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  ratingButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  ratingAgain: {
    backgroundColor: '#F44336',
  },
  ratingHard: {
    backgroundColor: '#FF9800',
  },
  ratingGood: {
    backgroundColor: '#4CAF50',
  },
  ratingEasy: {
    backgroundColor: '#2196F3',
  },
  ratingButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  ratingInterval: {
    color: '#fff',
    fontSize: 12,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
  },
});
