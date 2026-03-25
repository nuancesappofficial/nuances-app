import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type CachedItem from '@database/models/CachedItem';
import SubscriptionService from '@services/subscription/SubscriptionService';
import {
  assessPronunciationCloud,
  type CloudPhonemeFeedback,
} from '@services/pronunciation/cloudCoach';
import { TabSwipeContext } from '../contexts/TabSwipeContext';

type Props = {
  navigation: any;
  route: { params?: { cardId?: string } };
};

type LocalAlbum = {
  id: string;
  name: string;
  emoji: string;
  color: string;
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

const defaultAlbums: LocalAlbum[] = [
  { id: 'slang', name: 'Internet Slang', emoji: '💬', color: '#FFE5E5' },
  { id: 'culture', name: 'Pop Culture', emoji: '🎬', color: '#E5F4FF' },
  { id: 'work', name: 'Work Phrases', emoji: '💼', color: '#FFF4E5' },
  { id: 'travel', name: 'Travel', emoji: '✈️', color: '#E5FFE5' },
  { id: 'idioms', name: 'Idioms', emoji: '🗣️', color: '#FFE5F5' },
];

const availableEmojis = ['📚', '💬', '🎬', '💼', '✈️', '🗣️', '🎯', '🎨', '🎵', '🏆', '🌟', '🔥'];
const availableColors = ['#FFE5E5', '#E5F4FF', '#FFF4E5', '#E5FFE5', '#FFE5F5', '#E5E5FF', '#FFE5CC', '#E5FFF5'];

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

export default function CardDetailScreen({ navigation, route }: Props) {
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const cardId = route.params?.cardId;
  const [card, setCard] = React.useState<Card | null>(null);
  const [cachedItem, setCachedItem] = React.useState<CachedItem | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [hasRecorded, setHasRecorded] = React.useState(false);
  const [showFeedback, setShowFeedback] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [pronunciationScore, setPronunciationScore] = React.useState<number | null>(null);
  const [pronunciationFeedbackLines, setPronunciationFeedbackLines] = React.useState<string[]>([]);
  const [phonemeFeedback, setPhonemeFeedback] = React.useState<CloudPhonemeFeedback[]>([]);

  const [showAlbumSheet, setShowAlbumSheet] = React.useState(false);
  const [showNewAlbumForm, setShowNewAlbumForm] = React.useState(false);
  const [selectedAlbums, setSelectedAlbums] = React.useState<string[]>([]);
  const [customAlbums, setCustomAlbums] = React.useState<LocalAlbum[]>([]);

  const [newAlbumName, setNewAlbumName] = React.useState('');
  const [selectedEmoji, setSelectedEmoji] = React.useState('📚');
  const [selectedColor, setSelectedColor] = React.useState('#E5E5FF');

  const waveformValues = React.useRef(Array.from({ length: 24 }, () => new Animated.Value(8))).current;
  const recordingRef = React.useRef<any | null>(null);
  const lastRecordingUriRef = React.useRef<string | null>(null);
  const userRecordingSoundRef = React.useRef<any | null>(null);
  const waveformPointerRef = React.useRef(0);

  React.useEffect(() => {
    let mounted = true;
    if (!cardId) {
      setLoading(false);
      return;
    }

    const loadCard = async () => {
      try {
        const found = await database.get<Card>('cards').find(cardId);
        if (!mounted) return;
        setCard(found);

        if (found.cachedItemId) {
          try {
            const linked = await database.get<CachedItem>('cached_items').find(found.cachedItemId);
            if (!mounted) return;
            setCachedItem(linked);
          } catch {
            if (!mounted) return;
            setCachedItem(null);
          }
        } else {
          setCachedItem(null);
        }
      } catch (error) {
        console.error('[CardDetail] load failed:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadCard();

    return () => {
      mounted = false;
    };
  }, [cardId]);

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

  const allAlbums = React.useMemo(() => [...defaultAlbums, ...customAlbums], [customAlbums]);

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

  const createAlbum = () => {
    const name = newAlbumName.trim();
    if (!name) return;

    const id = `custom-${Date.now()}`;
    const newAlbum: LocalAlbum = {
      id,
      name,
      emoji: selectedEmoji,
      color: selectedColor,
    };

    setCustomAlbums((prev) => [newAlbum, ...prev]);
    setSelectedAlbums((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setShowNewAlbumForm(false);
    setNewAlbumName('');
    setSelectedEmoji('📚');
    setSelectedColor('#E5E5FF');
  };

  if (loading) {
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

  const phonemeChips = phonemeFeedback.slice(0, 5);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.backText}>Deck</Text>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setShowAlbumSheet(true)}>
              <Text style={styles.headerIcon}>📁</Text>
            </TouchableOpacity>
            <TouchableOpacity>
              <Text style={styles.headerIcon}>⭐</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {cachedItem?.imageStoragePath ? (
          <View style={styles.heroImageWrap}>
            <Image source={{ uri: cachedItem.imageStoragePath }} style={styles.heroImage} resizeMode="cover" />
          </View>
        ) : null}

        <View style={styles.wordCard}>
          <View style={styles.wordTopRow}>
            <View style={styles.wordLeft}>
              <Text style={styles.word}>{displayWord}</Text>
              <View style={styles.wordMetaRow}>
                <View style={styles.posBadge}>
                  <Text style={styles.posText}>{card.partOfSpeech || 'unknown'}</Text>
                </View>
                <Text style={styles.pronunciation}>{pronunciation}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.playBtn} onPress={handlePlay}>
              <Text style={styles.playBtnText}>{isPlaying ? '🔊' : '🔉'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Definition</Text>
            <Text style={styles.sectionValue}>{card.definition || '-'}</Text>
          </View>

          {card.originalSentence ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>Example</Text>
              <Text style={styles.sectionExample}>"{card.originalSentence}"</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.coachCard}>
          <View style={styles.coachHeader}>
            <View style={styles.coachIconWrap}>
              <Text style={styles.coachIcon}>🎤</Text>
            </View>
            <View>
              <Text style={styles.coachTitle}>Pronunciation Coach</Text>
              <Text style={styles.coachSubTitle}>Practice your pronunciation</Text>
            </View>
          </View>

          <View style={styles.waveContainer}>
            <View style={styles.waveRow}>
              {waveformValues.map((value, i) => (
                <Animated.View
                  key={`wave-${i}`}
                  style={[
                    styles.waveBar,
                    {
                      height: value,
                      opacity: isRecording ? 1 : 0.3,
                    },
                  ]}
                />
              ))}
            </View>
          </View>

          <View style={styles.coachControls}>
            {hasRecorded ? (
              <TouchableOpacity style={styles.smallControlBtn} onPress={() => void handleReset()}>
                <Text style={styles.smallControlTxt}>↺</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.sidePlaceholder} />
            )}

            <TouchableOpacity
              style={[styles.recordBtn, isRecording && styles.recordBtnActive, isAnalyzing && styles.recordBtnDisabled]}
              onPress={() => void togglePronunciationRecording()}
              disabled={isAnalyzing}
            >
              <Text style={[styles.recordBtnText, isRecording && styles.recordBtnTextActive]}>
                {isAnalyzing ? '…' : isRecording ? '■' : '🎙️'}
              </Text>
            </TouchableOpacity>

            {hasRecorded ? (
              <TouchableOpacity
                style={[styles.smallControlBtn, (isRecording || isAnalyzing) && styles.smallControlBtnDisabled]}
                onPress={() => void playUserRecordingPreview()}
                disabled={isRecording || isAnalyzing}
              >
                <Text style={styles.smallControlTxt}>▶</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.sidePlaceholder} />
            )}
          </View>

          {isAnalyzing ? (
            <View style={styles.analyzingWrap}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.analyzingText}>Azure 發音分析中...</Text>
            </View>
          ) : null}

          {showFeedback && pronunciationScore !== null ? (
            <View style={styles.feedbackBox}>
              <View style={styles.feedbackRow}>
                <View style={styles.feedbackCheck}>
                  <Text style={styles.feedbackCheckText}>✓</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.feedbackTitle}>Great job!</Text>
                  <Text style={styles.feedbackSub}>Azure pronunciation assessment completed</Text>
                </View>
                <Text style={styles.feedbackScore}>{pronunciationScore}%</Text>
              </View>

              <View style={styles.phonemeRow}>
                {phonemeChips.length > 0
                  ? phonemeChips.map((item, i) => (
                      <View
                        key={`${item.phoneme}-${i}`}
                        style={[
                          styles.phonemeBadge,
                          item.accuracy < 80 ? styles.phonemeBad : styles.phonemeGood,
                        ]}
                      >
                        <Text style={styles.phonemeText}>{item.letters || item.phoneme}</Text>
                      </View>
                    ))
                  : ['ʃ', 'ɪ', 't', 'ʃ', 'oʊ'].map((p, i) => (
                      <View key={p + i} style={[styles.phonemeBadge, i === 2 ? styles.phonemeBad : styles.phonemeGood]}>
                        <Text style={styles.phonemeText}>{p}</Text>
                      </View>
                    ))}
              </View>

              {pronunciationFeedbackLines.slice(0, 2).map((line, idx) => (
                <Text key={`${line}-${idx}`} style={styles.phonemeHint}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {!isRecording && !hasRecorded && !isAnalyzing ? (
            <Text style={styles.coachHint}>Tap the microphone to start practicing</Text>
          ) : null}
          {isRecording ? <Text style={styles.coachHint}>Say "{displayWord}" now...</Text> : null}
        </View>

        <View style={styles.tipsCard}>
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
      </ScrollView>

      <Modal visible={showAlbumSheet} transparent animationType="slide" onRequestClose={() => setShowAlbumSheet(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowAlbumSheet(false)} />
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add to Album</Text>
            <TouchableOpacity onPress={() => setShowAlbumSheet(false)}>
              <Text style={styles.sheetDone}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sheetCardPreview}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetCardWord}>{displayWord}</Text>
              <Text style={styles.sheetCardPos}>{card.partOfSpeech || 'unknown'}</Text>
            </View>
            {selectedAlbums.length > 0 ? (
              <View style={styles.sheetCountBadge}>
                <Text style={styles.sheetCountText}>
                  {selectedAlbums.length} album{selectedAlbums.length > 1 ? 's' : ''}
                </Text>
              </View>
            ) : null}
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.sheetScrollContent}>
            <TouchableOpacity style={styles.createAlbumBtn} onPress={() => setShowNewAlbumForm((prev) => !prev)}>
              <Text style={styles.createAlbumIcon}>➕</Text>
              <Text style={styles.createAlbumText}>Create New Album</Text>
            </TouchableOpacity>

            {showNewAlbumForm ? (
              <View style={styles.newAlbumForm}>
                <Text style={styles.formLabel}>Album Name</Text>
                <TextInput
                  value={newAlbumName}
                  onChangeText={setNewAlbumName}
                  placeholder="e.g., Business English"
                  style={styles.formInput}
                />

                <Text style={styles.formLabel}>Choose Emoji</Text>
                <View style={styles.emojiWrap}>
                  {availableEmojis.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.emojiBtn, selectedEmoji === emoji && styles.emojiBtnActive]}
                      onPress={() => setSelectedEmoji(emoji)}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.formLabel}>Choose Color</Text>
                <View style={styles.colorWrap}>
                  {availableColors.map((color) => {
                    const active = selectedColor === color;
                    return (
                      <TouchableOpacity
                        key={color}
                        style={[styles.colorBtn, { backgroundColor: color }, active && styles.colorBtnActive]}
                        onPress={() => setSelectedColor(color)}
                      >
                        {active ? <Text style={styles.colorCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={styles.formCancelBtn}
                    onPress={() => {
                      setShowNewAlbumForm(false);
                      setNewAlbumName('');
                      setSelectedEmoji('📚');
                      setSelectedColor('#E5E5FF');
                    }}
                  >
                    <Text style={styles.formCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.formCreateBtn, !newAlbumName.trim() && styles.formCreateBtnDisabled]}
                    disabled={!newAlbumName.trim()}
                    onPress={createAlbum}
                  >
                    <Text style={styles.formCreateText}>Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {allAlbums.map((album) => {
              const isSelected = selectedAlbums.includes(album.id);
              return (
                <TouchableOpacity
                  key={album.id}
                  style={[styles.albumRow, { backgroundColor: isSelected ? album.color : '#F9F9F9' }]}
                  onPress={() => toggleAlbum(album.id)}
                >
                  <View style={[styles.albumEmojiWrap, { backgroundColor: isSelected ? '#fff' : album.color }]}>
                    <Text style={styles.albumEmoji}>{album.emoji}</Text>
                  </View>
                  <Text style={styles.albumNameText}>{album.name}</Text>
                  {isSelected ? (
                    <View style={styles.albumCheckWrap}>
                      <Text style={styles.albumCheckText}>✓</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { color: '#202020', fontSize: 16, fontWeight: '600' },
  errorBackBtn: {
    marginTop: 10,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorBackText: { color: '#fff', fontWeight: '700' },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  backChevron: { fontSize: 30, color: '#007AFF', lineHeight: 30 },
  backText: { fontSize: 17, color: '#007AFF', fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIcon: { fontSize: 22 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 130, gap: 16 },
  heroImageWrap: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  heroImage: { width: '100%', height: 256 },
  wordCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  wordTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  wordLeft: { flex: 1 },
  word: { fontSize: 36, fontWeight: '800', color: '#000', letterSpacing: -1, lineHeight: 38 },
  wordMetaRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  posBadge: { backgroundColor: '#F2F2F7', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  posText: { fontSize: 13, fontWeight: '600', color: '#8E8E93' },
  pronunciation: { fontSize: 16, color: '#666', fontFamily: 'Courier' },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: { color: '#fff', fontSize: 22 },
  sectionBlock: { marginTop: 12 },
  sectionLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  sectionValue: { fontSize: 17, color: '#000', lineHeight: 25 },
  sectionExample: { fontSize: 17, color: '#000', lineHeight: 25, fontStyle: 'italic' },
  coachCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#2F62F6',
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
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
  },
  tipsTitle: { fontSize: 17, fontWeight: '700', color: '#000', marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  tipIcon: { fontSize: 16, marginTop: 1 },
  tipText: { flex: 1, color: '#666', fontSize: 15, lineHeight: 22 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetContainer: {
    backgroundColor: '#fff',
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
  sheetDone: { color: '#007AFF', fontSize: 17, fontWeight: '600' },
  sheetCardPreview: {
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetCardWord: { fontSize: 17, fontWeight: '700', color: '#000' },
  sheetCardPos: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  sheetCountBadge: { backgroundColor: '#007AFF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  sheetCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sheetScrollContent: { paddingBottom: 10, gap: 8 },
  createAlbumBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#5865F2',
  },
  createAlbumIcon: { color: '#fff', fontSize: 18 },
  createAlbumText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  newAlbumForm: {
    backgroundColor: '#F9F9F9',
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
    backgroundColor: '#007AFF',
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
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumCheckText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
