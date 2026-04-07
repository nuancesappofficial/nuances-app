import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Q } from '@nozbe/watermelondb';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import SubscriptionService from '@services/subscription/SubscriptionService';
import {
  assessPronunciationCloud,
  type CloudPhonemeFeedback,
} from '@services/pronunciation/cloudCoach';
import { resolveCardImageUri } from '@services/media/cardImage';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import PronunciationCoachUI from '../../../components/UI/DeckScreenUI/PronunciationCoachUI';
import CardDetailCarouselUI from '../../../components/UI/DeckScreenUI/CardDetailCarouselUI';
import CardAlbumSheetModalUI from '../../../components/UI/DeckScreenUI/CardAlbumSheetModalUI';
import CreateAlbumModalUI from '../../../components/UI/DeckScreenUI/CreateAlbumModalUI';
import type { DeckAlbum } from '../../../components/UI/DeckScreenUI/deckTypes';
import {
  ALBUM_TAG_PREFIX,
  buildDeckAlbums,
  createCustomAlbum,
  loadDeckAlbumPreferences,
  saveDeckAlbumPreferences,
  type DeckAlbumPreferences,
} from '../../../features/deck/albums';

type Props = {
  navigation: any;
  route: { params?: { cardId?: string; cardIds?: string[] } };
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

const albumIdToCategoryTag: Record<string, string> = {
  slang: 'slang',
  culture: 'culture',
  work: 'work',
};
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.99;
const SPACING = 8;
const SNAP_INTERVAL = CARD_WIDTH + SPACING;
const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2 - SPACING / 2;
const SIDE_PEEK_SHIFT = 60;
const HEADER_BUTTON_TOP_OFFSET = 0;

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

type CarouselCardProps = {
  item: Card;
  index: number;
  currentIndex: number | null;
  scrollX: SharedValue<number>;
  itemImageUri: string | null;
  isPlaying: boolean;
  isRecording: boolean;
  isAnalyzing: boolean;
  hasRecorded: boolean;
  showFeedback: boolean;
  pronunciationScore: number | null;
  pronunciationFeedbackLines: string[];
  phonemeChips: CloudPhonemeFeedback[];
  waveformValues: Animated.Value[];
  onPlayCard: (text: string, isActiveCard: boolean, index: number) => void;
  onToggleRecord: (isActiveCard: boolean, index: number) => void;
  onPlayPreview: () => void;
  onReset: () => void;
  navigateToIndex: (index: number) => void;
  snapInterval: number;
  sidePeekShift: number;
};

function renderPosterCard(
  item: Card | null,
  imageUri: string | null,
  variant: 'center' | 'side',
  edge?: 'left' | 'right'
) {
  if (!item) return null;

  const word = item.targetWord || item.targetPhrase || '-';
  const topRightLabel = item.partOfSpeech || item.sourceApp || 'CARD';
  const footLabel = item.sourceApp || 'nuances';
  const posterDate = formatCardDate(item.createdAt);
  const isCenter = variant === 'center';

  return (
    <View style={[styles.posterCard, isCenter ? styles.posterCardCenter : styles.posterCardSide]}>
      <View style={styles.posterTopRow}>
        <Text style={[styles.posterMeta, !isCenter && styles.posterMetaSide]} numberOfLines={1}>
          {topRightLabel}
        </Text>
        <Text style={[styles.posterDate, !isCenter && styles.posterDateSide]} numberOfLines={1}>
          {posterDate}
        </Text>
      </View>

      <View style={[styles.posterPhotoFrame, !isCenter && styles.posterPhotoFrameSide]}>
        {imageUri ? (
          <Image
            key={`${item.id}-${imageUri}`}
            source={{ uri: imageUri }}
            style={[styles.posterPhoto, !isCenter && styles.posterPhotoSide]}
            resizeMode="cover"
            blurRadius={isCenter ? 0 : 1.2}
          />
        ) : null}
        <View style={[styles.posterGhostWordWrap, !isCenter && styles.posterGhostWordWrapSide]}>
          <Text style={[styles.posterTitle, !isCenter && styles.posterTitleSide]} numberOfLines={2}>
            {word}
          </Text>
        </View>
      </View>

      <View style={styles.posterBottomBar}>
        <Text style={[styles.posterBrand, !isCenter && styles.posterBrandSide]} numberOfLines={1}>
          {footLabel}
        </Text>
        <Text style={[styles.posterBookmark, !isCenter && styles.posterActionIconSide]}>⤢</Text>
      </View>

      {!isCenter && edge ? (
        <View style={[styles.sideHintWrap, edge === 'left' ? styles.sideHintLeft : styles.sideHintRight]}>
          <Text style={styles.sideHintText}>{edge === 'left' ? '上一張' : '下一張'}</Text>
        </View>
      ) : null}
    </View>
  );
}

const CarouselCard = React.memo(function CarouselCard({
  item,
  index,
  currentIndex,
  scrollX,
  itemImageUri,
  isPlaying,
  isRecording,
  isAnalyzing,
  hasRecorded,
  showFeedback,
  pronunciationScore,
  pronunciationFeedbackLines,
  phonemeChips,
  waveformValues,
  onPlayCard,
  onToggleRecord,
  onPlayPreview,
  onReset,
  navigateToIndex,
  snapInterval,
  sidePeekShift,
}: CarouselCardProps) {
  const itemWord = item.targetWord || item.targetPhrase || '-';
  const itemPronunciation =
    item.phoneticTranscription || buildPronunciation(itemWord);
  const itemPronunciationText =
    sanitizePronunciationText(item.targetWord) ||
    sanitizePronunciationText(item.targetPhrase) ||
    sanitizePronunciationText(item.originalSentence) ||
    '';
  const itemCaption = item.partOfSpeech || item.sourceApp || 'Card';
  const itemDisplayDate = formatCardDate(item.createdAt);
  const isActiveCard = index === currentIndex;

  const animatedCardStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * snapInterval,
      index * snapInterval,
      (index + 1) * snapInterval,
    ];

    const scale = interpolate(scrollX.value, inputRange, [0.9, 1, 0.9], Extrapolation.CLAMP);
    const translateY = interpolate(scrollX.value, inputRange, [30, 0, 30], Extrapolation.CLAMP);
    const translateX = interpolate(
      scrollX.value,
      inputRange,
      [-sidePeekShift, 0, sidePeekShift],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(scrollX.value, inputRange, [0.72, 1, 0.72], Extrapolation.CLAMP);
    const zIndex = Math.round(
      interpolate(scrollX.value, inputRange, [0, 100, 0], Extrapolation.CLAMP)
    );

    return {
      opacity,
      zIndex,
      elevation: zIndex,
      transform: [{ scale }, { translateX }, { translateY }],
    };
  }, [index, scrollX, sidePeekShift, snapInterval]);

  return (
    <Reanimated.View style={[styles.carouselCardContainer, animatedCardStyle]}>
      <View style={styles.detailCardShell}>
        <ScrollView
          style={styles.detailCardScroll}
          contentContainerStyle={styles.detailCardScrollContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={isActiveCard}
        >
          <View style={styles.detailPaper}>
            {renderPosterCard(item, itemImageUri, 'center')}

            <View style={styles.wordCard}>
              <View style={styles.wordTopRow}>
                <View style={styles.wordLeft}>
                  <Text style={styles.word}>{itemWord}</Text>
                  <View style={styles.wordMetaRow}>
                    <View style={styles.posBadge}>
                      <Text style={styles.posText}>{itemCaption}</Text>
                    </View>
                    <Text style={styles.pronunciation}>{itemPronunciation}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.playBtn}
                  onPress={() => onPlayCard(itemPronunciationText, isActiveCard, index)}
                >
                  <Text style={styles.playBtnText}>{isActiveCard && isPlaying ? '🔊' : '🔉'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoPill}>
                  <Text style={styles.infoPillLabel}>卡片日期</Text>
                  <Text style={styles.infoPillValue}>{itemDisplayDate || '-'}</Text>
                </View>
                <View style={styles.infoPill}>
                  <Text style={styles.infoPillLabel}>難度</Text>
                  <Text style={styles.infoPillValue}>
                    {item.difficultyLevel ? `Lv.${item.difficultyLevel}` : '-'}
                  </Text>
                </View>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>Definition</Text>
                <Text style={styles.sectionValue}>{item.definition || '-'}</Text>
              </View>

              {item.contextualExplanation ? (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionLabel}>Context</Text>
                  <Text style={styles.sectionValue}>{item.contextualExplanation}</Text>
                </View>
              ) : null}

              {item.originalSentence ? (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionLabel}>Example</Text>
                  <Text style={styles.sectionExample}>"{item.originalSentence}"</Text>
                </View>
              ) : null}
            </View>

            <PronunciationCoachUI
              isActiveCard={isActiveCard}
              isRecording={isRecording}
              hasRecorded={hasRecorded}
              showFeedback={showFeedback}
              isAnalyzing={isAnalyzing}
              pronunciationScore={pronunciationScore}
              pronunciationFeedbackLines={pronunciationFeedbackLines}
              phonemeChips={phonemeChips}
              waveformValues={waveformValues}
              itemWord={itemWord}
              onReset={onReset}
              onPrimaryAction={() => onToggleRecord(isActiveCard, index)}
              onPlayPreview={onPlayPreview}
            />

            <View style={[styles.tipsCard, !isActiveCard && styles.inactiveDetailBlock]}>
              <Text style={styles.tipsTitle}>Learning Tips</Text>
              <View style={styles.tipRow}>
                <Text style={styles.tipIcon}>💡</Text>
                <Text style={styles.tipText}>This word is commonly used in informal American English</Text>
              </View>
              <View style={styles.tipRow}>
                <Text style={styles.tipIcon}>📝</Text>
                <Text style={styles.tipText}>Try using it in a sentence today to reinforce your memory</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Reanimated.View>
  );
});

export default function CardDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const floatingHeaderTop = getFloatingHeaderTop(insets.top);
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const cardId = route.params?.cardId;
  const routeCardIds = route.params?.cardIds;
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [currentIndex, setCurrentIndex] = React.useState<number | null>(null);
  const [displayIndex, setDisplayIndex] = React.useState<number | null>(null);

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [hasRecorded, setHasRecorded] = React.useState(false);
  const [showFeedback, setShowFeedback] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [pronunciationScore, setPronunciationScore] = React.useState<number | null>(null);
  const [pronunciationFeedbackLines, setPronunciationFeedbackLines] = React.useState<string[]>([]);
  const [phonemeFeedback, setPhonemeFeedback] = React.useState<CloudPhonemeFeedback[]>([]);

  const [showAlbumSheet, setShowAlbumSheet] = React.useState(false);
  const [isCreateAlbumModalVisible, setIsCreateAlbumModalVisible] = React.useState(false);
  const [selectedAlbums, setSelectedAlbums] = React.useState<string[]>([]);
  const [customAlbums, setCustomAlbums] = React.useState<DeckAlbum[]>([]);
  const [albumNameOverrides, setAlbumNameOverrides] = React.useState<Record<string, string>>({});
  const [albumEmojiOverrides, setAlbumEmojiOverrides] = React.useState<Record<string, string>>({});
  const [albumColorOverrides, setAlbumColorOverrides] = React.useState<Record<string, string>>({});
  const [deletedAlbumIds, setDeletedAlbumIds] = React.useState<string[]>([]);
  const [newAlbumName, setNewAlbumName] = React.useState('');

  const waveformValues = React.useRef(Array.from({ length: 24 }, () => new Animated.Value(8))).current;
  const recordingRef = React.useRef<any | null>(null);
  const lastRecordingUriRef = React.useRef<string | null>(null);
  const userRecordingSoundRef = React.useRef<any | null>(null);
  const waveformPointerRef = React.useRef(0);
  const flatListRef = React.useRef<FlatList<Card> | null>(null);
  const initialScrollDone = React.useRef(false);
  const didMountIndexRef = React.useRef(false);
  const scrollX = useSharedValue(0);
  const activeIndexUI = useSharedValue(currentIndex ?? 0);

  const hydrateAlbumPrefs = React.useCallback(async () => {
    const prefs = await loadDeckAlbumPreferences();
    setCustomAlbums(prefs.customAlbums);
    setAlbumNameOverrides(prefs.albumNameOverrides);
    setAlbumEmojiOverrides(prefs.albumEmojiOverrides);
    setAlbumColorOverrides(prefs.albumColorOverrides);
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
  const resolvedImageUri = card ? cardImageMap[card.id] ?? null : null;

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

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({
        offset: targetIndex * SNAP_INTERVAL,
        animated: false,
      });
    });
  }, [activeIndexUI, cardId, scopedCards]);

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
      const nextEntries = await Promise.all(
        scopedCards.map(async (item) => {
          const uri = await resolveCardImageUri({
            cardId: item.id,
            remoteUri: item.imageUrl,
          });
          if (item.imageUrl && !uri) {
            console.warn('[CardDetail] card image resolve failed', {
              cardId: item.id,
              imageUrl: item.imageUrl,
            });
          }
          return [item.id, uri] as const;
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
        deletedAlbumIds,
      }).filter((album) => album.id !== 'all'),
    [allCards, cardImageMap, customAlbums, albumNameOverrides, albumEmojiOverrides, albumColorOverrides, deletedAlbumIds]
  );

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

  const handlePlay = () => {
    if (!pronunciationText) {
      Alert.alert('無可朗讀內容', '這張卡片沒有可用於發音播放的文字。');
      return;
    }
    if (isPlaying) return;

    setIsPlaying(true);
    Vibration.vibrate(8);
    Speech.stop();
    Speech.speak(pronunciationText, {
      language: 'en-US',
      rate: 0.95,
      pitch: 1,
      onDone: () => setIsPlaying(false),
      onStopped: () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    });
  };

  const updateWaveByMetering = (metering: number) => {
    const normalized = Math.max(8, Math.min(72, ((metering + 60) / 60) * 72));
    const index = waveformPointerRef.current % waveformValues.length;
    waveformPointerRef.current += 1;
    waveformValues[index].setValue(normalized);
  };

  const startPronunciationRecording = async () => {
    try {
      if (!card) return;
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
        Alert.alert('今日免費額度已用完', '升級 Premium 解鎖無限次精準發音糾正。', [
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
      await stopUserRecordingPreview();

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      Speech.stop();
      setIsPlaying(false);

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
      recordingRef.current = null;
      setIsRecording(false);
      setHasRecorded(Boolean(uri));
      lastRecordingUriRef.current = uri || null;

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
      Vibration.vibrate(20);
    } catch (error) {
      console.error('[CardDetail][Pronunciation] analyze failed:', error);
      const message = error instanceof Error ? error.message : '無法完成發音分析，請稍後再試。';
      Alert.alert('分析失敗', message);
    } finally {
      setIsAnalyzing(false);
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
    const uri = lastRecordingUriRef.current;
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

  const navigateToIndex = React.useCallback(
    (targetIndex: number, animated = true) => {
      const safeIndex = Math.max(0, Math.min(targetIndex, scopedCards.length - 1));
      if (!scopedCards[safeIndex]) return;

      flatListRef.current?.scrollToOffset({
        offset: safeIndex * SNAP_INTERVAL,
        animated,
      });
      setDisplayIndex(safeIndex);
    },
    [scopedCards]
  );

  const phonemeChips = phonemeFeedback.slice(0, 5);
  const cardCaption = card?.partOfSpeech || card?.sourceApp || 'Card';
  const displayDate = formatCardDate(card?.createdAt);

  const triggerHapticFeedback = React.useCallback(() => {
    if (!didMountIndexRef.current) return;
    void Haptics.selectionAsync();
  }, []);

  const handleMomentumEnd = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SNAP_INTERVAL);
    if (nextIndex !== currentIndex) {
      setCurrentIndex(nextIndex);
      setDisplayIndex(nextIndex);
    }
    const targetCard = scopedCards[nextIndex];
    if (targetCard && route.params?.cardId !== targetCard.id) {
      navigation.setParams({ cardId: targetCard.id });
    }
  }, [currentIndex, navigation, route.params?.cardId, scopedCards]);

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
      if (isPlaying) return;
      setIsPlaying(true);
      Vibration.vibrate(8);
      Speech.stop();
      Speech.speak(itemPronunciationText, {
        language: 'en-US',
        rate: 0.95,
        pitch: 1,
        onDone: () => setIsPlaying(false),
        onStopped: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      });
    },
    [isPlaying, navigateToIndex]
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

  const renderCarouselCard = React.useCallback(
    ({ item, index }: { item: Card; index: number }) => (
      <CarouselCard
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
        navigateToIndex={navigateToIndex}
        snapInterval={SNAP_INTERVAL}
        sidePeekShift={SIDE_PEEK_SHIFT}
      />
    ),
    [
      cardImageMap,
      currentIndex,
      handlePlayCard,
      handleReset,
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
    ]
  );

  if (loading || currentIndex === null || displayIndex === null) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!card) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>找不到這張卡片</Text>
        <TouchableOpacity style={styles.errorBackBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.errorBackText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View pointerEvents="box-none" style={styles.floatingHeaderLayer}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.floatingIconButton, styles.floatingBackButton, { top: floatingHeaderTop }]}
        >
          <Ionicons name="chevron-back" size={24} color="#F4EDE6" />
          <Text style={styles.backText}>Deck</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowAlbumSheet(true)}
          style={[styles.floatingIconButton, styles.floatingHeaderAction, { top: floatingHeaderTop, right: 64 }]}
        >
          <Ionicons name="folder-outline" size={23} color="#F4EDE6" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.floatingIconButton, styles.floatingHeaderAction, { top: floatingHeaderTop, right: 16 }]}
        >
          <Ionicons name="star-outline" size={24} color="#F4EDE6" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <CardDetailCarouselUI
          scopedCards={scopedCards}
          flatListRef={flatListRef}
          currentIndex={currentIndex}
          displayIndex={displayIndex}
          renderItem={renderCarouselCard}
          scrollHandler={scrollHandler}
          onMomentumScrollEnd={handleMomentumEnd}
          snapInterval={SNAP_INTERVAL}
          sidePadding={SIDE_PADDING}
        />
      </View>

      <CardAlbumSheetModalUI
        visible={showAlbumSheet}
        displayWord={displayWord}
        partOfSpeech={card.partOfSpeech || 'unknown'}
        selectedAlbums={selectedAlbums}
        allAlbums={allAlbums}
        onClose={() => setShowAlbumSheet(false)}
        onDone={() => void saveAlbumSelection()}
        onOpenCreateAlbum={() => setIsCreateAlbumModalVisible(true)}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#050505' },
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
  },
  floatingHeaderAction: {
    width: 40,
    height: 40,
  },
  backText: { fontSize: 17, color: '#F4EDE6', fontWeight: '500' },
  content: { flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
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
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    elevation: 20,
    padding: 18,
    gap: 18,
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
  tipsTitle: { fontSize: 17, fontWeight: '700', color: '#F8F2EC', marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  tipIcon: { fontSize: 16, marginTop: 1 },
  tipText: { flex: 1, color: '#D1BDAF', fontSize: 15, lineHeight: 22 },
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
