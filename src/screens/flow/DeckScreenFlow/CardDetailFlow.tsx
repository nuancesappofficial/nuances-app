import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
  Animated,
  Easing,
  Vibration,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Q } from '@nozbe/watermelondb';
import Reanimated, {
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type CachedItem from '@database/models/CachedItem';
import SubscriptionService from '@services/subscription/SubscriptionService';
import {
  assessPronunciationCloud,
  type CloudPhonemeFeedback,
} from '@services/pronunciation/cloudCoach';
import { resolveCardImageUri } from '@services/media/cardImage';
import { speakEnglishNaturally } from '@services/tts/localSpeech';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import CardDetailCarouselUI from '../../../components/UI/DeckScreenUI/CardDetailCarouselUI';
import CardAlbumSheetModalUI from '../../../components/UI/DeckScreenUI/CardAlbumSheetModalUI';
import CardDetailCarouselCardUI from '../../../components/UI/DeckScreenUI/CardDetailCarouselCardUI';
import PronunciationCoachUI from '../../../components/UI/DeckScreenUI/PronunciationCoachUI';
import CreateAlbumModalUI from '../../../components/UI/DeckScreenUI/CreateAlbumModalUI';
import type { DeckAlbum } from '../../../components/UI/DeckScreenUI/deckTypes';
import {
  CARD_WIDTH,
  SPACING,
  SIDE_PADDING,
  SIDE_PEEK_SHIFT,
  SNAP_INTERVAL,
} from '../../../components/UI/DeckScreenUI/cardCarouselConfig';
import {
  ALBUM_TAG_PREFIX,
  ALL_CARDS_ALBUM_ID,
  FAVORITES_ALBUM_ID,
  buildDeckAlbums,
  createCustomAlbum,
  loadDeckAlbumPreferences,
  saveDeckAlbumPreferences,
  type DeckAlbumPreferences,
} from '../../../features/deck/albums';
import { markCardAsSeen } from '../../../features/deck/cardDetailSeen';
import { loadCardStickyNotes, saveCardStickyNotes } from '../../../features/deck/cardStickyNotes';
import { SCREEN_BG, resolveThemeColors } from '../../../theme/colors';

type Props = {
  navigation: any;
  route: { params?: { cardId?: string; cardIds?: string[]; albumName?: string; headerTitle?: string } };
};
type PronunciationResult = {
  score: number | null;
  feedbackLines: string[];
  phonemeFeedback: CloudPhonemeFeedback[];
  showFeedback: boolean;
};

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

const MAX_PRONUNCIATION_RECORDING_MS = 10_000;
const MIN_PRONUNCIATION_RECORDING_MS = 350;
const CARD_DETAIL_FONT_SCALE = 0.7;

const albumIdToCategoryTag: Record<string, string> = {
  slang: 'slang',
  culture: 'culture',
  work: 'work',
};
const HEADER_BUTTON_TOP_OFFSET = 0;
function scaleFont(size: number): number {
  return Math.round(size * CARD_DETAIL_FONT_SCALE * 100) / 100;
}

function getFloatingHeaderTop(insetTop: number): number {
  return insetTop + HEADER_BUTTON_TOP_OFFSET;
}

function isFilePath(text: string | undefined | null): boolean {
  if (!text) return true;
  return text.startsWith('file://') || text.startsWith('/') || text.startsWith('http');
}

function sanitizePronunciationText(text: string | undefined | null): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (isFilePath(trimmed)) return '';
  if (/^(https?:\/\/|www\.)/i.test(trimmed)) return '';
  if (/^[a-z]+:\/\/\S+/i.test(trimmed)) return '';
  return trimmed;
}

function buildPronunciation(word: string): string {
  const cleaned = word.trim().toLowerCase();
  if (!cleaned) return '/-/';
  return `/${cleaned.replace(/\s+/g, '-')}/`;
}

function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (typeof tags === 'string') {
    const trimmed = tags.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
    } catch {
      return trimmed
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function deriveSelectedAlbums(tags: string[]): string[] {
  const result = new Set<string>();
  tags.forEach((tag) => {
    const lower = tag.toLowerCase();
    if (lower.startsWith(ALBUM_TAG_PREFIX)) {
      const albumId = lower.slice(ALBUM_TAG_PREFIX.length).trim();
      if (albumId) result.add(albumId);
    }
    if (lower === 'slang') result.add('slang');
    if (lower === 'culture') result.add('culture');
    if (lower === 'work') result.add('work');
  });
  return Array.from(result);
}

function hasSecondaryAlbumBookmark(albumIds: string[]): boolean {
  return albumIds.some((id) => id !== ALL_CARDS_ALBUM_ID && id !== FAVORITES_ALBUM_ID);
}

function formatCardDate(input: Date | string | undefined | null): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function CardDetailScreen({ navigation, route }: Props) {
  const colorScheme = useColorScheme();
  const isLightMode = colorScheme === 'light';
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const floatingHeaderTop = getFloatingHeaderTop(insets.top);
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const cardId = route.params?.cardId;
  const routeCardIds = route.params?.cardIds;
  const headerTitle = route.params?.headerTitle || route.params?.albumName || 'Deck';
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [currentIndex, setCurrentIndex] = React.useState<number | null>(null);
  const [displayIndex, setDisplayIndex] = React.useState<number | null>(null);

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isTtsDownloading, setIsTtsDownloading] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [hasRecorded, setHasRecorded] = React.useState(false);
  const [showFeedback, setShowFeedback] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [pronunciationScore, setPronunciationScore] = React.useState<number | null>(null);
  const [pronunciationFeedbackLines, setPronunciationFeedbackLines] = React.useState<string[]>([]);
  const [phonemeFeedback, setPhonemeFeedback] = React.useState<CloudPhonemeFeedback[]>([]);
  const [pronunciationResultsByCardId, setPronunciationResultsByCardId] = React.useState<
    Record<string, PronunciationResult>
  >({});
  const [lastRecordingUriByCardId, setLastRecordingUriByCardId] = React.useState<Record<string, string>>({});
  const ttsDownloadCountRef = React.useRef(0);

  const [showAlbumSheet, setShowAlbumSheet] = React.useState(false);
  const [showStickyNoteModal, setShowStickyNoteModal] = React.useState(false);
  const [showPronunciationModal, setShowPronunciationModal] = React.useState(false);
  const [stickyNotesByCardId, setStickyNotesByCardId] = React.useState<Record<string, string>>({});
  const [stickyDraft, setStickyDraft] = React.useState('');
  const [isCreateAlbumModalVisible, setIsCreateAlbumModalVisible] = React.useState(false);
  const [isFullscreenViewerVisible, setIsFullscreenViewerVisible] = React.useState(false);
  const [fullscreenCardIndex, setFullscreenCardIndex] = React.useState<number | null>(null);
  const [selectedAlbums, setSelectedAlbums] = React.useState<string[]>([]);
  const [customAlbums, setCustomAlbums] = React.useState<DeckAlbum[]>([]);
  const [albumNameOverrides, setAlbumNameOverrides] = React.useState<Record<string, string>>({});
  const [albumEmojiOverrides, setAlbumEmojiOverrides] = React.useState<Record<string, string>>({});
  const [albumColorOverrides, setAlbumColorOverrides] = React.useState<Record<string, string>>({});
  const [albumCoverOverrides, setAlbumCoverOverrides] = React.useState<Record<string, string>>({});
  const [deletedAlbumIds, setDeletedAlbumIds] = React.useState<string[]>([]);
  const [newAlbumName, setNewAlbumName] = React.useState('');

  const waveformValues = React.useRef(Array.from({ length: 24 }, () => new Animated.Value(8))).current;
  const recordingRef = React.useRef<any | null>(null);
  const pronunciationTargetCardIdRef = React.useRef<string | null>(null);
  const recordingTransitionRef = React.useRef(false);
  const lastRecordingUriRef = React.useRef<string | null>(null);
  const userRecordingSoundRef = React.useRef<any | null>(null);
  const waveformPointerRef = React.useRef(0);
  const flatListRef = React.useRef<FlatList<Card> | null>(null);
  const initialScrollDone = React.useRef(false);
  const didMountIndexRef = React.useRef(false);
  const scrollX = useSharedValue(0);
  const activeIndexUI = useSharedValue(currentIndex ?? 0);
  const fullscreenDragY = React.useRef(new Animated.Value(0)).current;
  const fullscreenBackdropOpacity = React.useRef(new Animated.Value(1)).current;
  const fullscreenEntryProgress = React.useRef(new Animated.Value(0)).current;
  const fullscreenOriginDeltaX = React.useRef(new Animated.Value(0)).current;
  const fullscreenOriginDeltaY = React.useRef(new Animated.Value(0)).current;
  const fullscreenDragYValueRef = React.useRef(0);
  const stickyModalAnim = React.useRef(new Animated.Value(0)).current;
  const pronunciationModalAnim = React.useRef(new Animated.Value(0)).current;

  const hydrateAlbumPrefs = React.useCallback(async () => {
    const prefs = await loadDeckAlbumPreferences();
    setCustomAlbums(prefs.customAlbums);
    setAlbumNameOverrides(prefs.albumNameOverrides);
    setAlbumEmojiOverrides(prefs.albumEmojiOverrides);
    setAlbumColorOverrides(prefs.albumColorOverrides);
    setAlbumCoverOverrides(prefs.albumCoverOverrides);
    setDeletedAlbumIds(prefs.deletedAlbumIds);
  }, []);

  React.useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const loadCards = async () => {
      try {
        const data = await queryCards.fetch();
        setAllCards(data);
      } catch (error) {
        console.error('[CardDetail] load failed:', error);
        setAllCards([]);
      } finally {
        setLoading(false);
      }
    };

    void loadCards();
    const sub = queryCards.observe().subscribe((data) => {
      setAllCards(data);
      setLoading(false);
    });
    return () => sub.unsubscribe();
  }, [cardId]);

  React.useEffect(() => {
    void hydrateAlbumPrefs();
  }, [hydrateAlbumPrefs]);

  useFocusEffect(
    React.useCallback(() => {
      void hydrateAlbumPrefs();
    }, [hydrateAlbumPrefs])
  );

  const scopedCards = React.useMemo(() => {
    if (!routeCardIds?.length) return allCards;
    const allowed = new Set(routeCardIds);
    const byId = new Map(allCards.map((item) => [item.id, item] as const));
    return routeCardIds
      .map((id) => byId.get(id))
      .filter((item): item is Card => item != null && allowed.has(item.id));
  }, [allCards, routeCardIds]);

  const card = currentIndex === null ? null : scopedCards[currentIndex] ?? null;
  React.useEffect(() => {
    if (!card?.id) {
      setPronunciationScore(null);
      setPronunciationFeedbackLines([]);
      setPhonemeFeedback([]);
      setShowFeedback(false);
      return;
    }
    const data = pronunciationResultsByCardId[card.id];
    if (!data) {
      setPronunciationScore(null);
      setPronunciationFeedbackLines([]);
      setPhonemeFeedback([]);
      setShowFeedback(false);
      return;
    }
    setPronunciationScore(data.score);
    setPronunciationFeedbackLines(data.feedbackLines);
    setPhonemeFeedback(data.phonemeFeedback);
    setShowFeedback(data.showFeedback);
  }, [card?.id, pronunciationResultsByCardId]);

  const resolvedImageUri = card ? cardImageMap[card.id] ?? null : null;
  const markCenteredCardSeen = React.useCallback(
    (index: number) => {
      const targetCard = scopedCards[index];
      if (!targetCard) return;
      void markCardAsSeen(targetCard.id);
    },
    [scopedCards]
  );

  React.useEffect(() => {
    if (!scopedCards.length || initialScrollDone.current) {
      if (!scopedCards.length) {
        setCurrentIndex(null);
        setDisplayIndex(null);
      }
      return;
    }

    const targetIndex = !cardId
      ? 0
      : Math.max(0, scopedCards.findIndex((item) => item.id === cardId));

    initialScrollDone.current = true;
    didMountIndexRef.current = true;
    activeIndexUI.value = targetIndex;
    setCurrentIndex(targetIndex);
    setDisplayIndex(targetIndex);
    markCenteredCardSeen(targetIndex);

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({
        offset: targetIndex * SNAP_INTERVAL,
        animated: false,
      });
    });
  }, [activeIndexUI, cardId, markCenteredCardSeen, scopedCards]);

  React.useEffect(() => {
    if (!scopedCards.length) {
      setCurrentIndex(null);
      setDisplayIndex(null);
      return;
    }
    const targetIndex = !cardId
      ? 0
      : Math.max(0, scopedCards.findIndex((item) => item.id === cardId));
    activeIndexUI.value = targetIndex;
    setCurrentIndex(targetIndex);
    setDisplayIndex(targetIndex);
  }, [activeIndexUI, cardId, scopedCards, scopedCards.length]);

  React.useEffect(() => {
    let active = true;
    if (!scopedCards.length) return () => undefined;

    const resolveImages = async () => {
      const isLocalPath = (uri: string): boolean => uri.startsWith('file://') || uri.startsWith('/');
      const hasExistingLocalFile = async (uri: string): Promise<boolean> => {
        if (!isLocalPath(uri)) return true;
        try {
          const info = await FileSystemLegacy.getInfoAsync(uri);
          return Boolean(info.exists);
        } catch {
          return false;
        }
      };

      const cachedItemById: Record<string, CachedItem> = {};
      const cachedItemIds = Array.from(
        new Set(
          scopedCards
            .map((item) => item.cachedItemId)
            .filter((id): id is string => Boolean(id))
        )
      );

      await Promise.all(
        cachedItemIds.map(async (id) => {
          try {
            const cachedItem = await database.get<CachedItem>('cached_items').find(id);
            cachedItemById[id] = cachedItem;
          } catch {
            // 卡片可能已與快取項目解關聯，忽略即可
          }
        })
      );

      const nextEntries = await Promise.all(
        scopedCards.map(async (item) => {
          const cachedItem = item.cachedItemId ? cachedItemById[item.cachedItemId] : undefined;
          const candidates = [
            cachedItem?.mediaUri || null,
            item.imageUrl || null,
            cachedItem?.imageStoragePath || null,
          ].filter((value): value is string => Boolean(value));

          let resolvedUri: string | null = null;
          for (const candidate of candidates) {
            const uri = await resolveCardImageUri({
              cardId: item.id,
              remoteUri: candidate,
            });
            if (!uri) continue;
            const localExists = await hasExistingLocalFile(uri);
            if (!localExists) continue;
            resolvedUri = uri;
            break;
          }

          if (candidates.length > 0 && !resolvedUri) {
            console.warn('[CardDetail] card image resolve failed', {
              cardId: item.id,
              imageCandidates: candidates,
            });
          }
          return [item.id, resolvedUri] as const;
        })
      );

      if (!active) return;
      setCardImageMap((prev) => {
        const merged = { ...prev };
        nextEntries.forEach(([id, uri]) => {
          if (uri) {
            merged[id] = uri;
          } else {
            delete merged[id];
          }
        });
        return merged;
      });
    };

    void resolveImages();
    return () => {
      active = false;
    };
  }, [scopedCards]);

  React.useEffect(() => {
    const hydrateStickyNotes = async () => {
      const parsed = await loadCardStickyNotes();
      setStickyNotesByCardId(parsed);
    };
    void hydrateStickyNotes();
  }, []);

  React.useEffect(() => {
    return () => {
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (recording) {
        void recording.stopAndUnloadAsync().catch(() => undefined);
      }
      const sound = userRecordingSoundRef.current;
      userRecordingSoundRef.current = null;
      if (sound) {
        void sound.stopAsync().catch(() => undefined);
        void sound.unloadAsync().catch(() => undefined);
      }
      Speech.stop();
    };
  }, []);

  React.useEffect(() => {
    if (!card) return;
    const tags = parseTags(card.tags).map((tag) => tag.toLowerCase());
    setSelectedAlbums(deriveSelectedAlbums(tags));
  }, [card]);

  const allAlbums = React.useMemo(
    () =>
      buildDeckAlbums(allCards, cardImageMap, {
        customAlbums,
        albumNameOverrides,
        albumEmojiOverrides,
        albumColorOverrides,
        albumCoverOverrides,
        deletedAlbumIds,
      }).filter((album) => album.id !== 'all'),
    [allCards, cardImageMap, customAlbums, albumNameOverrides, albumEmojiOverrides, albumColorOverrides, albumCoverOverrides, deletedAlbumIds]
  );
  const isFavorite = selectedAlbums.includes(FAVORITES_ALBUM_ID);

  const displayWord = card?.targetWord || card?.targetPhrase || '-';
  const pronunciationText = React.useMemo(() => {
    return (
      sanitizePronunciationText(card?.targetWord) ||
      sanitizePronunciationText(card?.targetPhrase) ||
      sanitizePronunciationText(card?.originalSentence) ||
      ''
    );
  }, [card?.originalSentence, card?.targetPhrase, card?.targetWord]);
  const pronunciation = buildPronunciation(displayWord);

  const stopUserRecordingPreview = React.useCallback(async () => {
    const sound = userRecordingSoundRef.current;
    userRecordingSoundRef.current = null;
    if (!sound) return;
    try {
      await sound.stopAsync();
    } catch {
      // noop
    }
    try {
      await sound.unloadAsync();
    } catch {
      // noop
    }
  }, []);

  const stopActiveAudio = React.useCallback(async () => {
    setIsPlaying(false);
    await stopUserRecordingPreview();
    await Speech.stop();
  }, [stopUserRecordingPreview]);

  const handleTtsDownloadStart = React.useCallback(() => {
    ttsDownloadCountRef.current += 1;
    setIsTtsDownloading(true);
  }, []);

  const handleTtsDownloadEnd = React.useCallback(() => {
    ttsDownloadCountRef.current = Math.max(0, ttsDownloadCountRef.current - 1);
    if (ttsDownloadCountRef.current === 0) {
      setIsTtsDownloading(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        void stopActiveAudio();
      };
    }, [stopActiveAudio])
  );

  const handlePlay = () => {
    if (!pronunciationText) {
      Alert.alert('無可朗讀內容', '這張卡片沒有可用於發音播放的文字。');
      return;
    }
    setIsPlaying(true);
    Vibration.vibrate(8);
    void speakEnglishNaturally(pronunciationText, {
      onDownloadStart: handleTtsDownloadStart,
      onDownloadEnd: handleTtsDownloadEnd,
      onDone: () => setIsPlaying(false),
      onStopped: () => setIsPlaying(false),
      onError: () => {
        handleTtsDownloadEnd();
        setIsPlaying(false);
      },
    });
  };

  const updateWaveByMetering = (metering: number) => {
    const normalized = Math.max(8, Math.min(72, ((metering + 60) / 60) * 72));
    const index = waveformPointerRef.current % waveformValues.length;
    waveformPointerRef.current += 1;
    waveformValues[index].setValue(normalized);
  };

  const startPronunciationRecording = async () => {
    if (recordingTransitionRef.current) return;
    recordingTransitionRef.current = true;
    try {
      if (!card) return;
      const targetCardId = card.id;
      if (isAnalyzing) return;
      if (!pronunciationText.trim()) {
        Alert.alert('無可評分句子', '請先選擇有可朗讀句子的卡片再進行發音分析。');
        return;
      }
      if (!card.userId) {
        Alert.alert('尚未登入', '請先登入後再使用發音教練。');
        return;
      }

      const quota = await SubscriptionService.consumeVoiceQuota(card.userId);
      if (!quota.allowed) {
        Alert.alert('升級解鎖發音評分', '免費版保留 OCR 與手動建卡；發音評分需要試用版或 Premium。', [
          { text: '稍後', style: 'cancel' },
          {
            text: '前往設定',
            onPress: () => {
              if (tabSwipeContext) {
                tabSwipeContext.goToTab(2);
              }
            },
          },
        ]);
        return;
      }

      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要麥克風權限', '請先允許麥克風，才能做發音比對。');
        return;
      }

      setPronunciationScore(null);
      setPronunciationFeedbackLines([]);
      setPhonemeFeedback([]);
      setShowFeedback(false);
      setHasRecorded(false);
      pronunciationTargetCardIdRef.current = targetCardId;
      await stopUserRecordingPreview();
      const staleRecording = recordingRef.current;
      if (staleRecording) {
        try {
          staleRecording.setOnRecordingStatusUpdate(null);
          await staleRecording.stopAndUnloadAsync();
        } catch {
          // ignore stale recorder cleanup errors
        } finally {
          recordingRef.current = null;
        }
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      await stopActiveAudio();

      const recording = new Audio.Recording();
      waveformPointerRef.current = 0;
      waveformValues.forEach((v) => v.setValue(8));

      await recording.prepareToRecordAsync(PRONUNCIATION_RECORDING_OPTIONS as any);
      recording.setProgressUpdateInterval(120);
      recording.setOnRecordingStatusUpdate((status: any) => {
        if (!status?.isRecording) return;
        if (typeof status.metering === 'number' && Number.isFinite(status.metering)) {
          updateWaveByMetering(status.metering);
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
      setIsRecording(true);
      Vibration.vibrate(10);
    } catch (error) {
      console.error('[CardDetail][Pronunciation] start recording failed:', error);
      setIsRecording(false);
      Alert.alert('錄音失敗', '請再試一次。');
    } finally {
      recordingTransitionRef.current = false;
    }
  };

  const stopPronunciationRecording = async () => {
    if (recordingTransitionRef.current) return;
    recordingTransitionRef.current = true;
    const recording = recordingRef.current;
    if (!recording) {
      recordingTransitionRef.current = false;
      return;
    }

    try {
      const statusBeforeStop = await recording.getStatusAsync();
      const durationMillis =
        statusBeforeStop.isLoaded && typeof statusBeforeStop.durationMillis === 'number'
          ? statusBeforeStop.durationMillis
          : 0;

      recording.setOnRecordingStatusUpdate(null);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      setHasRecorded(Boolean(uri));
      const currentCardId = pronunciationTargetCardIdRef.current;
      lastRecordingUriRef.current = uri || null;
      if (currentCardId && uri) {
        setLastRecordingUriByCardId((prev) => ({ ...prev, [currentCardId]: uri }));
      }

      if (!uri) {
        throw new Error('錄音檔遺失，請重新錄音');
      }
      if (durationMillis > 0 && durationMillis < MIN_PRONUNCIATION_RECORDING_MS) {
        throw new Error('錄音太短，請至少清楚唸出一個完整單字再送出');
      }
      if (Platform.OS === 'ios' && !uri.toLowerCase().endsWith('.wav')) {
        throw new Error(`錄音格式錯誤，預期 .wav，實際 URI: ${uri}`);
      }

      setIsAnalyzing(true);
      const result = await assessPronunciationCloud({
        referenceText: pronunciationText,
        audioUri: uri,
        locale: 'en-US',
      });

      setPronunciationScore(result.score);
      setPronunciationFeedbackLines(result.feedbackLines);
      setPhonemeFeedback(result.phonemeFeedback || []);
      setShowFeedback(true);
      const analyzedCardId = pronunciationTargetCardIdRef.current;
      if (analyzedCardId) {
        setPronunciationResultsByCardId((prev) => ({
          ...prev,
          [analyzedCardId]: {
            score: result.score,
            feedbackLines: result.feedbackLines || [],
            phonemeFeedback: result.phonemeFeedback || [],
            showFeedback: true,
          },
        }));
      }
      Vibration.vibrate(20);
    } catch (error) {
      console.error('[CardDetail][Pronunciation] analyze failed:', error);
      const message = error instanceof Error ? error.message : '無法完成發音分析，請稍後再試。';
      Alert.alert('分析失敗', message);
    } finally {
      setIsAnalyzing(false);
      pronunciationTargetCardIdRef.current = null;
      recordingTransitionRef.current = false;
    }
  };

  const togglePronunciationRecording = async () => {
    if (isAnalyzing) return;
    if (isRecording) {
      await stopPronunciationRecording();
      return;
    }
    await startPronunciationRecording();
  };

  const playUserRecordingPreview = async () => {
    const uri = card?.id ? lastRecordingUriByCardId[card.id] || null : null;
    if (!uri) {
      Alert.alert('尚無錄音', '請先完成一次錄音後再重播。');
      return;
    }
    if (isRecording || isAnalyzing) return;
    try {
      await stopUserRecordingPreview();
      const result = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, progressUpdateIntervalMillis: 120 }
      );
      userRecordingSoundRef.current = result.sound;
      result.sound.setOnPlaybackStatusUpdate((status: any) => {
        if (!status?.isLoaded) return;
        if (status.didJustFinish) {
          void stopUserRecordingPreview();
        }
      });
    } catch (error) {
      console.error('[CardDetail][Pronunciation] preview playback failed:', error);
      Alert.alert('重播失敗', '無法播放這段錄音，請重新錄音再試。');
    }
  };

  const handleReset = async () => {
    setHasRecorded(false);
    setShowFeedback(false);
    setIsRecording(false);
    setIsAnalyzing(false);
    setPronunciationScore(null);
    setPronunciationFeedbackLines([]);
    setPhonemeFeedback([]);
    if (card?.id) {
      setPronunciationResultsByCardId((prev) => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });
      setLastRecordingUriByCardId((prev) => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });
    }
    lastRecordingUriRef.current = null;
    waveformValues.forEach((v) => v.setValue(8));
    await stopUserRecordingPreview();
  };

  const toggleAlbum = (albumId: string) => {
    setSelectedAlbums((prev) =>
      prev.includes(albumId) ? prev.filter((id) => id !== albumId) : [...prev, albumId]
    );
  };

  const createAlbum = async () => {
    const name = newAlbumName.trim();
    if (!name) return;

    const newAlbum = createCustomAlbum(name);
    const nextCustomAlbums = [newAlbum, ...customAlbums];
    const nextPrefs: DeckAlbumPreferences = {
      customAlbums: nextCustomAlbums,
      albumNameOverrides,
      albumEmojiOverrides,
      albumColorOverrides,
      albumCoverOverrides,
      deletedAlbumIds,
    };

    try {
      await saveDeckAlbumPreferences(nextPrefs);
      setCustomAlbums(nextCustomAlbums);
      setSelectedAlbums((prev) => (prev.includes(newAlbum.id) ? prev : [...prev, newAlbum.id]));
      setIsCreateAlbumModalVisible(false);
      setNewAlbumName('');
    } catch (error) {
      console.error('[CardDetail] create album failed:', error);
      Alert.alert('建立失敗', '建立資料夾時發生問題，請再試一次。');
    }
  };

  const saveAlbumSelection = async () => {
    if (!card) return;
    try {
      const currentTags = parseTags(card.tags).map((tag) => tag.toLowerCase());
      const reservedCategoryTags = new Set(Object.values(albumIdToCategoryTag));
      const preserved = currentTags.filter(
        (tag) => !tag.startsWith(ALBUM_TAG_PREFIX) && !reservedCategoryTags.has(tag)
      );

      const albumTags = selectedAlbums.map((id) => `${ALBUM_TAG_PREFIX}${id}`);
      const categoryTags = selectedAlbums
        .map((id) => albumIdToCategoryTag[id])
        .filter((tag): tag is string => Boolean(tag));
      const nextTags = Array.from(new Set([...preserved, ...albumTags, ...categoryTags]));

      await database.write(async () => {
        await card.update((record) => {
          record.tags = nextTags;
        });
      });

      setShowAlbumSheet(false);
    } catch (error) {
      console.error('[CardDetail] save albums failed:', error);
      Alert.alert('儲存失敗', '更新資料夾關聯時發生問題，請再試一次。');
    }
  };

  const toggleFavorite = React.useCallback(async () => {
    if (!card) return;
    try {
      const currentTags = parseTags(card.tags).map((tag) => tag.toLowerCase());
      const favoriteTag = `${ALBUM_TAG_PREFIX}${FAVORITES_ALBUM_ID}`;
      const hasFavorite = currentTags.includes(favoriteTag);
      const nextTags = hasFavorite
        ? currentTags.filter((tag) => tag !== favoriteTag)
        : Array.from(new Set([...currentTags, favoriteTag]));

      await database.write(async () => {
        await card.update((record) => {
          record.tags = nextTags;
        });
      });

      setSelectedAlbums((prev) =>
        hasFavorite
          ? prev.filter((id) => id !== FAVORITES_ALBUM_ID)
          : prev.includes(FAVORITES_ALBUM_ID)
            ? prev
            : [...prev, FAVORITES_ALBUM_ID]
      );
    } catch (error) {
      console.error('[CardDetail] toggle favorite failed:', error);
      Alert.alert('更新失敗', '無法更新我的最愛狀態，請再試一次。');
    }
  }, [card]);

  const openStickyNoteModal = React.useCallback(() => {
    if (!card) return;
    setStickyDraft(stickyNotesByCardId[card.id] || '');
    setShowStickyNoteModal(true);
  }, [card, stickyNotesByCardId]);
  React.useEffect(() => {
    if (!showStickyNoteModal) return;
    stickyModalAnim.setValue(0);
    Animated.spring(stickyModalAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 230,
      mass: 0.92,
      useNativeDriver: true,
    }).start();
  }, [showStickyNoteModal, stickyModalAnim]);
  React.useEffect(() => {
    if (!showPronunciationModal) return;
    pronunciationModalAnim.setValue(0);
    Animated.spring(pronunciationModalAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 230,
      mass: 0.92,
      useNativeDriver: true,
    }).start();
  }, [showPronunciationModal, pronunciationModalAnim]);

  const openPronunciationModal = React.useCallback(() => {
    setShowPronunciationModal(true);
  }, []);

  const saveStickyNote = React.useCallback(async () => {
    if (!card) return;
    const nextText = stickyDraft.trim();
    const nextMap = { ...stickyNotesByCardId };
    if (nextText) {
      nextMap[card.id] = nextText;
    } else {
      delete nextMap[card.id];
    }
    setStickyNotesByCardId(nextMap);
    setShowStickyNoteModal(false);
    try {
      await saveCardStickyNotes(nextMap);
    } catch (error) {
      console.warn('[CardDetail] save sticky note failed:', error);
    }
  }, [card, stickyDraft, stickyNotesByCardId]);

  const navigateToIndex = React.useCallback(
    (targetIndex: number, animated = true) => {
      const safeIndex = Math.max(0, Math.min(targetIndex, scopedCards.length - 1));
      if (!scopedCards[safeIndex]) return;

      void stopActiveAudio();
      flatListRef.current?.scrollToOffset({
        offset: safeIndex * SNAP_INTERVAL,
        animated,
      });
      setDisplayIndex(safeIndex);
    },
    [scopedCards, stopActiveAudio]
  );
  const closeFullscreenViewer = React.useCallback((_mode: 'tap' | 'swipe' = 'tap') => {
    Animated.parallel([
      Animated.timing(fullscreenBackdropOpacity, {
        toValue: 0,
        duration: 230,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fullscreenDragY, {
        toValue: 0,
        duration: 230,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fullscreenEntryProgress, {
        toValue: 0,
        duration: 230,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      fullscreenDragYValueRef.current = 0;
      void Haptics.selectionAsync();
      setIsFullscreenViewerVisible(false);
      if (fullscreenCardIndex !== null) {
        requestAnimationFrame(() => {
          navigateToIndex(fullscreenCardIndex, false);
        });
      }
    });
  }, [fullscreenBackdropOpacity, fullscreenCardIndex, fullscreenDragY, fullscreenEntryProgress, navigateToIndex]);
  const handleOpenFullscreen = React.useCallback(
    (targetIndex: number, origin?: { x: number; y: number }) => {
      const safeIndex = Math.max(0, Math.min(targetIndex, scopedCards.length - 1));
      if (!scopedCards[safeIndex]) return;
      setFullscreenCardIndex(safeIndex);
      fullscreenDragYValueRef.current = 0;
      fullscreenDragY.setValue(0);
      fullscreenBackdropOpacity.setValue(1);
      fullscreenEntryProgress.setValue(0);
      const centerX = screenWidth / 2;
      const centerY = screenHeight / 2;
      fullscreenOriginDeltaX.setValue((origin?.x ?? centerX) - centerX);
      fullscreenOriginDeltaY.setValue((origin?.y ?? centerY) - centerY);
      setIsFullscreenViewerVisible(true);
    },
    [
      fullscreenBackdropOpacity,
      fullscreenDragY,
      fullscreenEntryProgress,
      fullscreenOriginDeltaX,
      fullscreenOriginDeltaY,
      scopedCards,
      screenHeight,
      screenWidth,
    ]
  );
  const fullscreenPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 4,
        onPanResponderMove: (_, gestureState) => {
          fullscreenDragY.setValue(gestureState.dy);
          fullscreenDragYValueRef.current = gestureState.dy;
          const dragFactor = Math.min(1, Math.abs(gestureState.dy) / 320);
          fullscreenBackdropOpacity.setValue(Math.max(0.3, 1 - dragFactor * 0.7));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (Math.abs(gestureState.dy) > 120) {
            closeFullscreenViewer('swipe');
            return;
          }
          Animated.parallel([
            Animated.spring(fullscreenDragY, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 6,
              speed: 18,
            }),
            Animated.spring(fullscreenBackdropOpacity, {
              toValue: 1,
              useNativeDriver: true,
              bounciness: 6,
              speed: 18,
            }),
          ]).start();
          fullscreenDragYValueRef.current = 0;
        },
        onPanResponderTerminate: () => {
          Animated.parallel([
            Animated.spring(fullscreenDragY, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 6,
              speed: 18,
            }),
            Animated.spring(fullscreenBackdropOpacity, {
              toValue: 1,
              useNativeDriver: true,
              bounciness: 6,
              speed: 18,
            }),
          ]).start();
          fullscreenDragYValueRef.current = 0;
        },
      }),
    [closeFullscreenViewer, fullscreenBackdropOpacity, fullscreenDragY]
  );
  React.useEffect(() => {
    if (!isFullscreenViewerVisible || fullscreenCardIndex === null) return;
    Animated.timing(fullscreenEntryProgress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fullscreenCardIndex, fullscreenEntryProgress, isFullscreenViewerVisible]);

  const phonemeChips = phonemeFeedback.slice(0, 5);
  const fullscreenCard = fullscreenCardIndex === null ? null : scopedCards[fullscreenCardIndex] ?? null;
  const fullscreenImageUri = fullscreenCard ? cardImageMap[fullscreenCard.id] ?? null : null;
  const handlePlayPronunciationWord = React.useCallback(
    (word: string) => {
      const text = (word || '').trim();
      if (!text) return;
      void speakEnglishNaturally(text, {
        onDownloadStart: handleTtsDownloadStart,
        onDownloadEnd: handleTtsDownloadEnd,
        onError: handleTtsDownloadEnd,
      });
    },
    [handleTtsDownloadEnd, handleTtsDownloadStart]
  );
  const handlePlayPronunciationSyllable = React.useCallback((syllable: string) => {
    const raw = (syllable || '').trim();
    if (!raw) return;
    const cleaned = raw.replace(/^\/+|\/+$/g, '').trim();
    const phonemeApproxMap: Record<string, string> = {
      // Common IPA/phoneme fallbacks for better TTS output.
      'ə': 'uh',
      'ɚ': 'er',
      'ɝ': 'er',
      'æ': 'a',
      'ɑ': 'ah',
      'ɔ': 'aw',
      'ʌ': 'uh',
      'ɪ': 'ih',
      'i': 'ee',
      'u': 'oo',
      'ʊ': 'oo',
      'ɛ': 'eh',
      'ŋ': 'ng',
      'θ': 'th',
      'ð': 'th',
      'ʃ': 'sh',
      'ʒ': 'zh',
      'tʃ': 'ch',
      'dʒ': 'j',
    };
    const text = phonemeApproxMap[cleaned] || cleaned;
    if (!text) return;
    void speakEnglishNaturally(text, {
      onDownloadStart: handleTtsDownloadStart,
      onDownloadEnd: handleTtsDownloadEnd,
      onError: handleTtsDownloadEnd,
    });
  }, [handleTtsDownloadEnd, handleTtsDownloadStart]);
  const triggerHapticFeedback = React.useCallback(() => {
    if (!didMountIndexRef.current) return;
    void Haptics.selectionAsync();
  }, []);

  const handleMomentumEnd = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SNAP_INTERVAL);
    if (nextIndex !== currentIndex) {
      void stopActiveAudio();
      setCurrentIndex(nextIndex);
      setDisplayIndex(nextIndex);
    }
    const targetCard = scopedCards[nextIndex];
    markCenteredCardSeen(nextIndex);
    if (targetCard && route.params?.cardId !== targetCard.id) {
      navigation.setParams({ cardId: targetCard.id });
    }
  }, [currentIndex, markCenteredCardSeen, navigation, route.params?.cardId, scopedCards, stopActiveAudio]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      const nextIndex = Math.round(event.contentOffset.x / SNAP_INTERVAL);
      if (nextIndex !== activeIndexUI.value) {
        activeIndexUI.value = nextIndex;
        runOnJS(triggerHapticFeedback)();
      }
    },
  });

  const handlePlayCard = React.useCallback(
    (itemPronunciationText: string, isActiveCard: boolean, index: number) => {
      if (!isActiveCard) {
        navigateToIndex(index);
        return;
      }
      if (!itemPronunciationText) {
        Alert.alert('無可朗讀內容', '這張卡片沒有可用於發音播放的文字。');
        return;
      }
      setIsPlaying(true);
      void speakEnglishNaturally(itemPronunciationText, {
        onDownloadStart: handleTtsDownloadStart,
        onDownloadEnd: handleTtsDownloadEnd,
        onDone: () => setIsPlaying(false),
        onStopped: () => setIsPlaying(false),
        onError: () => {
          handleTtsDownloadEnd();
          setIsPlaying(false);
        },
      });
    },
    [handleTtsDownloadEnd, handleTtsDownloadStart, navigateToIndex]
  );

  const handleToggleRecordCard = React.useCallback(
    (isActiveCard: boolean, index: number) => {
      if (!isActiveCard) {
        navigateToIndex(index);
        return;
      }
      void togglePronunciationRecording();
    },
    [navigateToIndex]
  );

  const openCreateAlbumModal = React.useCallback(() => {
    setShowAlbumSheet(false);
    requestAnimationFrame(() => {
      setIsCreateAlbumModalVisible(true);
    });
  }, []);

  const renderCarouselCard = React.useCallback(
    ({ item, index }: { item: Card; index: number }) => {
      // 判斷該卡片是否為我的最愛
      const isThisCardFavorite =
        item.id === card?.id
          ? isFavorite
          : deriveSelectedAlbums(parseTags(item.tags)).includes(FAVORITES_ALBUM_ID);
      const isThisCardBookmarked =
        item.id === card?.id
          ? hasSecondaryAlbumBookmark(selectedAlbums)
          : hasSecondaryAlbumBookmark(deriveSelectedAlbums(parseTags(item.tags)));

      return (
        <CardDetailCarouselCardUI
          item={item}
          index={index}
          currentIndex={currentIndex}
          scrollX={scrollX}
          itemImageUri={cardImageMap[item.id] ?? null}
          isPlaying={isPlaying}
          isRecording={isRecording}
          isAnalyzing={isAnalyzing}
          hasRecorded={hasRecorded}
          showFeedback={showFeedback}
          pronunciationScore={pronunciationScore}
          pronunciationFeedbackLines={pronunciationFeedbackLines}
          phonemeChips={phonemeChips}
          waveformValues={waveformValues}
          onPlayCard={handlePlayCard}
          onToggleRecord={handleToggleRecordCard}
          onPlayPreview={() => void playUserRecordingPreview()}
          onReset={() => void handleReset()}
          onOpenFullscreen={handleOpenFullscreen}
          cardDetailFontScale={CARD_DETAIL_FONT_SCALE}
          snapInterval={SNAP_INTERVAL}
          sidePeekShift={SIDE_PEEK_SHIFT}
          sanitizePronunciationText={sanitizePronunciationText}
          formatCardDate={formatCardDate}
          styles={styles}
          // 新增的屬性
          isFavorite={isThisCardFavorite}
          isBookmarked={isThisCardBookmarked}
          onOpenAlbumSheet={() => setShowAlbumSheet(true)}
          onToggleFavorite={() => void toggleFavorite()}
          onOpenStickyNote={openStickyNoteModal}
          stickyNoteText={stickyNotesByCardId[item.id] || ''}
          onOpenPronunciationModal={openPronunciationModal}
          isLightMode={isLightMode}
        />
      );
    },
    [
      card?.id,
      isFavorite,
      selectedAlbums,
      toggleFavorite,
      openStickyNoteModal,
      openPronunciationModal,
      cardImageMap,
      currentIndex,
      handlePlayCard,
      handleReset,
      handleOpenFullscreen,
      handleToggleRecordCard,
      hasRecorded,
      isAnalyzing,
      isPlaying,
      isRecording,
      navigateToIndex,
      phonemeChips,
      pronunciationFeedbackLines,
      pronunciationScore,
      scrollX,
      showFeedback,
      waveformValues,
      playUserRecordingPreview,
      isLightMode,
      stickyNotesByCardId,
    ]
  );

  if (loading || currentIndex === null || displayIndex === null) {
    return (
      <View style={[styles.loadingWrap, isLightMode ? { backgroundColor: '#FFFFFF' } : null]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!card) {
    return (
      <View style={[styles.loadingWrap, isLightMode ? { backgroundColor: '#FFFFFF' } : null]}>
        <Text style={[styles.errorText, isLightMode ? { color: '#111111' } : null]}>找不到這張卡片</Text>
        <TouchableOpacity style={styles.errorBackBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.errorBackText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.screenBg }]} edges={[]}>
      <View pointerEvents="box-none" style={styles.floatingHeaderLayer}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.floatingIconButton, styles.floatingBackButton, { top: floatingHeaderTop }]}
        >
          <Ionicons name="chevron-back" size={30} color={isLightMode ? '#111111' : '#F4EDE6'} />
        </TouchableOpacity>

        {/* 新增的置中標題與卡片計數 */}
        <View style={[styles.floatingHeaderCenter, { top: floatingHeaderTop }]}>
          <Text style={[styles.headerTitleText, isLightMode ? styles.headerTitleTextLight : null]}>
            {headerTitle}{' '}
            <Text style={[styles.headerCountText, isLightMode ? styles.headerCountTextLight : null]}>
              ({displayIndex !== null ? displayIndex + 1 : 0}/{scopedCards.length})
            </Text>
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <CardDetailCarouselUI
          scopedCards={scopedCards}
          flatListRef={flatListRef}
          currentIndex={currentIndex}
          displayIndex={displayIndex}
          extraData={cardImageMap}
          renderItem={renderCarouselCard}
          scrollHandler={scrollHandler}
          onMomentumScrollEnd={handleMomentumEnd}
          snapInterval={SNAP_INTERVAL}
          sidePadding={SIDE_PADDING}
        />
      </View>

      <Modal visible={isTtsDownloading} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.ttsDownloadBackdrop}>
          <View style={styles.ttsDownloadModal}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.ttsDownloadText}>downloading...</Text>
          </View>
        </View>
      </Modal>

      <CardAlbumSheetModalUI
        visible={showAlbumSheet}
        displayWord={displayWord}
        partOfSpeech={card.partOfSpeech || 'unknown'}
        selectedAlbums={selectedAlbums}
        allAlbums={allAlbums}
        onClose={() => setShowAlbumSheet(false)}
        onDone={() => void saveAlbumSelection()}
        onOpenCreateAlbum={openCreateAlbumModal}
        onToggleAlbum={toggleAlbum}
      />

      <CreateAlbumModalUI
        visible={isCreateAlbumModalVisible}
        albumName={newAlbumName}
        onChangeAlbumName={setNewAlbumName}
        onCancel={() => {
          setIsCreateAlbumModalVisible(false);
          setNewAlbumName('');
        }}
        onConfirm={() => void createAlbum()}
      />

      <Modal
        visible={showStickyNoteModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowStickyNoteModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowStickyNoteModal(false)}
          style={styles.stickyBackdrop}
        >
          <Animated.View
            style={[
              styles.stickySheet,
              {
                opacity: stickyModalAnim,
                transform: [
                  {
                    scale: stickyModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <Text style={styles.stickyTitle}>Card note</Text>
            <TextInput
              value={stickyDraft}
              onChangeText={setStickyDraft}
              placeholder="Write your sticky note..."
              placeholderTextColor="#64748B"
              multiline
              textAlignVertical="top"
              style={styles.stickyInput}
            />
            <View style={styles.stickyButtonRow}>
              <TouchableOpacity style={styles.stickyCancelBtn} onPress={() => setShowStickyNoteModal(false)}>
                <Text style={styles.stickyCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stickySaveBtn} onPress={() => void saveStickyNote()}>
                <Text style={styles.stickySaveText}>Save</Text>
              </TouchableOpacity>
            </View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showPronunciationModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowPronunciationModal(false)}
      >
        <Pressable style={styles.pronunciationBackdrop} onPress={() => setShowPronunciationModal(false)}>
          <Animated.View
            style={[
              styles.pronunciationSheet,
              {
                opacity: pronunciationModalAnim,
                transform: [
                  {
                    scale: pronunciationModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable onPress={() => {}}>
              <PronunciationCoachUI
                isActiveCard
                isRecording={isRecording}
                hasRecorded={hasRecorded}
                showFeedback={showFeedback}
                isAnalyzing={isAnalyzing}
                pronunciationScore={pronunciationScore}
                pronunciationFeedbackLines={pronunciationFeedbackLines}
                phonemeChips={phonemeChips}
                syllableRowPattern={undefined}
                waveformValues={waveformValues}
                itemWord={displayWord}
                onPlayWord={handlePlayPronunciationWord}
                onPlaySyllable={handlePlayPronunciationSyllable}
                onReset={() => void handleReset()}
                onPrimaryAction={() => void togglePronunciationRecording()}
                onPlayPreview={() => void playUserRecordingPreview()}
              />
              <View style={[styles.stickyButtonRow, { marginTop: 12 }]}>
                <TouchableOpacity style={styles.stickyCancelBtn} onPress={() => setShowPronunciationModal(false)}>
                  <Text style={styles.stickyCancelText}>Close</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal
        visible={isFullscreenViewerVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => closeFullscreenViewer('tap')}
      >
        {(() => {
          const entryTranslateY = fullscreenEntryProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
            extrapolate: 'clamp',
          });
          const entryTranslateX = fullscreenEntryProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
            extrapolate: 'clamp',
          });
          const entryScale = fullscreenEntryProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.8, 1],
            extrapolate: 'clamp',
          });
          const dragScale = fullscreenDragY.interpolate({
            inputRange: [-320, 0, 320],
            outputRange: [0.82, 1, 0.82],
            extrapolate: 'clamp',
          });
          return (
        <View style={{ flex: 1, backgroundColor: '#000000' }}>
          <Animated.View
            style={{
              ...StyleSheet.absoluteFillObject,
              opacity: Animated.multiply(fullscreenBackdropOpacity, fullscreenEntryProgress),
            }}
          >
            <View style={{ flex: 1, backgroundColor: '#000000' }} />
          </Animated.View>

          <Animated.View
            {...fullscreenPanResponder.panHandlers}
            style={{
              flex: 1,
              transform: [
                {
                  translateX: Animated.multiply(fullscreenOriginDeltaX, entryTranslateX),
                },
                {
                  translateY: Animated.add(
                    fullscreenDragY,
                    Animated.multiply(fullscreenOriginDeltaY, entryTranslateY)
                  ),
                },
                { scale: Animated.multiply(dragScale, entryScale) },
              ],
            }}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => closeFullscreenViewer('tap')}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' }}
            >
              {fullscreenImageUri ? (
                <Image
                  source={{ uri: fullscreenImageUri }}
                  style={{ width: screenWidth, height: '100%' }}
                  resizeMode="contain"
                />
              ) : (
                <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#F4EDE6', fontSize: 18, fontWeight: '700' }}>無圖片可顯示</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => closeFullscreenViewer('tap')}
              activeOpacity={0.85}
              style={[
                styles.fullscreenCloseButton,
                { top: Math.max(insets.top, 14), left: 14 },
              ]}
            >
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        </View>
          );
        })()}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_BG },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: SCREEN_BG },
  errorText: { color: '#F4EDE6', fontSize: 16, fontWeight: '600' },
  errorBackBtn: {
    marginTop: 10,
    backgroundColor: '#7D2A2E',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorBackText: { color: '#F9F4EE', fontWeight: '700' },
  floatingHeaderLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  floatingIconButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  floatingBackButton: {
    left: 16,
    flexDirection: 'row',
    gap: 3,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  floatingHeaderCenter: {
    position: 'absolute',
    left: 10,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    zIndex: -1, 
  },
  headerTitleText: {
    fontSize: 30,
    color: '#F4EDE6',
    fontWeight: '700',
  },
  headerCountText: {
    fontSize: 25,
    color: 'rgba(244, 237, 230, 0.6)',
    fontWeight: '500',
  },
  headerTitleTextLight: {
    color: '#0F172A',
  },
  headerCountTextLight: {
    color: 'rgba(15, 23, 42, 0.62)',
  },
  fullscreenCloseButton: {
    position: 'absolute',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    zIndex: 12,
  },
  floatingHeaderAction: {
    width: 40,
    height: 40,
  },
  backText: { fontSize: 17, color: '#F4EDE6', fontWeight: '500' },
  content: { flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  ttsDownloadBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.46)',
  },
  ttsDownloadModal: {
    minWidth: 168,
    minHeight: 88,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(15,23,42,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  ttsDownloadText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  stageSection: {
    flex: 1,
    paddingTop: 4,
  },
  carouselStage: {
    flex: 1,
    minHeight: 620,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  carouselContent: {
    paddingHorizontal: SIDE_PADDING,
  },
  carouselCardContainer: {
    width: CARD_WIDTH,
    marginHorizontal: SPACING / 2,
    height: '100%',
    paddingVertical: 4,
  },
  detailCardShell: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  detailCardShellInactive: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  detailCardScroll: {
    flex: 1,
  },
  detailCardScrollContent: {
    padding: 18,
    paddingTop: 100,
    gap: 18,
    paddingBottom: 32,
  },
  detailPaper: {
    backgroundColor: '#1E293B',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    elevation: 20,
    padding: 18,
    gap: 18,
  },
  heroMediaWrap: {
    marginTop: -18,
    marginHorizontal: -18,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  heroMedia: {
    width: '100%',
    height: 250,
  },
  heroMediaFallback: {
    width: '100%',
    height: 340,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECEFF5',
  },
  heroMediaFallbackWord: {
    color: '#111',
    fontSize: scaleFont(44),
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  referenceWordCard: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  referenceRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  referenceWordLeft: { flex: 1, paddingRight: 8 },
  referenceWord: {
    color: '#F8FAFC',
    fontSize: scaleFont(52),
    lineHeight: scaleFont(56),
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  referencePronunciation: {
    marginTop: 6,
    color: '#848891',
    fontSize: scaleFont(19),
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  referencePlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F2F3F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  referencePlayIcon: { fontSize: 19 },
  referenceMeaningRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  referencePosBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#334155',
  },
  referencePosText: {
    color: '#F8FAFC',
    fontSize: scaleFont(20),
    fontWeight: '800',
  },
  referenceMeaning: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: scaleFont(30),
    lineHeight: scaleFont(42),
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  referenceDivider: {
    marginTop: 16,
    marginBottom: 14,
    height: 1,
    backgroundColor: '#334155',
  },
  referenceExample: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: scaleFont(30),
    lineHeight: scaleFont(38),
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  referenceTranslation: {
    marginTop: 14,
    color: '#F8FAFC',
    fontSize: scaleFont(25),
    lineHeight: scaleFont(42),
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  referenceSubSection: {
    marginTop: 14,
  },
  referenceSubLabel: {
    color: '#94A3B8',
    fontSize: scaleFont(12),
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  stickyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pronunciationBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.66)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  stickySheet: {
    borderRadius: 18,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    gap: 12,
  },
  stickyTitle: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
  },
  stickyInput: {
    minHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    color: '#F8FAFC',
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stickyButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stickyCancelBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  stickyCancelText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  stickySaveBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#4EAFF4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  stickySaveText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  pronunciationSheet: {
    borderRadius: 18,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    padding: 18,
    width: '99%',
    maxWidth: 760,
    minHeight: 420,
    alignSelf: 'center',
  },
  referenceSubText: {
    color: '#94A3B8',
    fontSize: scaleFont(20),
    lineHeight: scaleFont(30),
    fontWeight: '500',
  },
  referenceCollocationSection: {
    marginTop: 0,
    paddingTop: 0,
    gap: 8,
  },
  referenceCollocationTitle: {
    color: '#94A3B8',
    fontSize: scaleFont(20),
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  referenceCollocationItem: {
    color: '#F8FAFC',
    fontSize: scaleFont(25),
    lineHeight: scaleFont(28),
    fontWeight: '600',
  },
  referenceFooterRow: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  referenceFooterText: {
    color: '#B2B6BF',
    fontSize: scaleFont(20),
    fontWeight: '600',
  },
  referenceActionBadge: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#EEF0FF',
  },
  referenceActionText: {
    color: '#1F2230',
    fontSize: scaleFont(24),
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  posterCard: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.36,
    shadowRadius: 28,
    elevation: 16,
  },
  posterCardCenter: {
    minHeight: 420,
    padding: 18,
  },
  posterCardSide: {
    minHeight: 420,
    padding: 16,
    borderRadius: 24,
  },
  posterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  posterTitle: {
    color: '#111111',
    fontSize: 38,
    fontWeight: '300',
    letterSpacing: -1,
    textAlign: 'center',
  },
  posterTitleSide: {
    fontSize: 20,
    lineHeight: 24,
  },
  posterMeta: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '700',
    opacity: 0.7,
  },
  posterMetaSide: {
    fontSize: 9,
  },
  posterPhotoFrame: {
    marginTop: 14,
    backgroundColor: '#F4F4F4',
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 0,
  },
  posterPhotoFrameSide: {
    marginTop: 10,
    borderRadius: 18,
  },
  posterPhoto: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
  },
  posterPhotoSide: {
    opacity: 0.06,
  },
  posterGhostWordWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  posterGhostWordWrapSide: {
    paddingHorizontal: 16,
  },
  posterBottomBar: {
    marginTop: 12,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  posterActionIconSide: {
    fontSize: 13,
  },
  posterBookmark: {
    color: '#111111',
    fontSize: 18,
  },
  posterFooterRow: {
    display: 'none',
  },
  posterBrand: {
    flex: 1,
    color: '#111111',
    fontSize: 14,
    fontWeight: '700',
  },
  posterBrandSide: {
    fontSize: 10,
  },
  posterDate: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.6,
  },
  posterDateSide: {
    fontSize: 9,
  },
  sideHintWrap: {
    position: 'absolute',
    bottom: 18,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sideHintLeft: {
    left: 10,
  },
  sideHintRight: {
    right: 10,
  },
  sideHintText: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '700',
  },
  stageFooterRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 4,
  },
  edgeTapHint: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  stageNavButtonDisabled: {
    opacity: 0.32,
  },
  edgeTapHintText: {
    color: '#9F9FAD',
    fontSize: 12,
    fontWeight: '600',
  },
  paginationDots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  paginationDotActive: {
    backgroundColor: '#4C4CE8',
    transform: [{ scale: 1.15 }],
  },
  inactiveDetailBlock: {
    opacity: 0.9,
  },
  wordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  wordTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  wordLeft: { flex: 1 },
  word: { fontSize: 34, fontWeight: '800', color: '#141414', letterSpacing: -1, lineHeight: 38 },
  wordMetaRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  posBadge: {
    backgroundColor: '#F2F2F6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  posText: { fontSize: 13, fontWeight: '600', color: '#666A73' },
  pronunciation: { fontSize: 16, color: '#666A73', fontFamily: 'Courier' },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F2F2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: { color: '#111111', fontSize: 22 },
  infoGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  infoPill: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F5F6FA',
  },
  infoPillLabel: {
    color: '#8A8E97',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoPillValue: {
    marginTop: 6,
    color: '#141414',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionBlock: { marginTop: 14 },
  sectionLabel: {
    fontSize: 12,
    color: '#8A8E97',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionValue: { fontSize: 17, color: '#161616', lineHeight: 26 },
  sectionExample: { fontSize: 17, color: '#161616', lineHeight: 26, fontStyle: 'italic' },
  coachCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#143D89',
  },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  coachIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachIcon: { fontSize: 20 },
  coachTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  coachSubTitle: { fontSize: 13, color: 'rgba(255,255,255,0.82)' },
  waveContainer: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  waveRow: {
    height: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  waveBar: {
    width: 3,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  coachControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  sidePlaceholder: { width: 48, height: 48 },
  smallControlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallControlBtnDisabled: { opacity: 0.5 },
  smallControlTxt: { color: '#fff', fontSize: 22, fontWeight: '700' },
  recordBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtnActive: { backgroundColor: '#FF3B30' },
  recordBtnDisabled: { opacity: 0.6 },
  recordBtnText: { fontSize: 30, color: '#007AFF' },
  recordBtnTextActive: { color: '#fff', fontSize: 24 },
  analyzingWrap: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  analyzingText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  feedbackBox: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    padding: 14,
  },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feedbackCheck: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackCheckText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  feedbackTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  feedbackSub: { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 2 },
  feedbackScore: { color: '#fff', fontSize: 24, fontWeight: '800' },
  phonemeRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  phonemeBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  phonemeGood: { backgroundColor: 'rgba(52,199,89,0.3)' },
  phonemeBad: { backgroundColor: 'rgba(255,59,48,0.3)' },
  phonemeText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Courier' },
  phonemeHint: { marginTop: 8, textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  coachHint: { marginTop: 12, textAlign: 'center', color: 'rgba(255,255,255,0.82)', fontSize: 13 },
  tipsCard: {
    backgroundColor: '#120F0F',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(247,240,234,0.08)',
  },
  tipsTitle: { fontSize: scaleFont(17), fontWeight: '700', color: '#F8F2EC', marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  tipIcon: { fontSize: 16, marginTop: 1 },
  tipText: { flex: 1, color: '#D1BDAF', fontSize: scaleFont(15), lineHeight: scaleFont(22) },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetContainer: {
    backgroundColor: '#FAF7F3',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#C7C7CC',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#000' },
  sheetDone: { color: '#7D2A2E', fontSize: 17, fontWeight: '600' },
  sheetCardPreview: {
    backgroundColor: '#F0E7DF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetCardWord: { fontSize: 17, fontWeight: '700', color: '#000' },
  sheetCardPos: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  sheetCountBadge: { backgroundColor: '#7D2A2E', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  sheetCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sheetScrollContent: { paddingBottom: 10, gap: 8 },
  createAlbumBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#7D2A2E',
  },
  createAlbumIcon: { color: '#fff', fontSize: 18 },
  createAlbumText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  newAlbumForm: {
    backgroundColor: '#F4ECE5',
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  formLabel: { fontSize: 13, fontWeight: '700', color: '#8E8E93', marginBottom: 8, marginTop: 8 },
  formInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  emojiWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  emojiBtnActive: { borderColor: '#007AFF', backgroundColor: '#E8F1FF' },
  emojiText: { fontSize: 22 },
  colorWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorBtnActive: { borderWidth: 2, borderColor: '#007AFF' },
  colorCheck: { color: '#007AFF', fontSize: 16, fontWeight: '800' },
  formActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  formCancelBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  formCancelText: { fontSize: 16, color: '#8E8E93', fontWeight: '700' },
  formCreateBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#7D2A2E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  formCreateBtnDisabled: { opacity: 0.4 },
  formCreateText: { fontSize: 16, color: '#fff', fontWeight: '700' },
  albumRow: {
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  albumEmojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  albumEmoji: { fontSize: 24 },
  albumNameText: { flex: 1, fontSize: 16, color: '#000', fontWeight: '600' },
  albumCheckWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7D2A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumCheckText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
