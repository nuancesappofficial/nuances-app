import React from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated, {
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { generateContentForWord } from '@services/ai';
import type { EntitlementSnapshot } from '@services/subscription/SubscriptionService';
import SubscriptionService from '@services/subscription/SubscriptionService';
import { DEFAULT_USER_SETTINGS, loadUserSettings } from '@services/settings/userSettings';
import { extractTextFromImage } from '@services/ocr/ocrService';
import { getLocalPhoneticTranscription } from '@services/pronunciation/localPhonetics';
import { supabase } from '@services/supabase/client';
import { persistLocalCardImage } from '@services/media/localCardImageStore';
import { loadCardStickyNotes, saveCardStickyNotes } from '../../../features/deck/cardStickyNotes';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import {
  CONTAINER_NEON_GLOW,
  CONTAINER_NEON_OUTLINE,
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  TEXT_ON_CTA,
  resolveThemeColors,
} from '../../../theme/colors';

type Props = {
  navigation: any;
  route: any;
};

type GeneratingCard = {
  word: string;
  completed: boolean;
};

type CollocationItem = {
  phrase: string;
  example: string;
};

type CompletedCard = {
  // OCR/選字原字，用作本地狀態 key
  word: string;
  // AI 校正後（含詞形還原）的卡片顯示字
  displayWord: string;
  targetPhrase?: string;
  partOfSpeech: string;
  definition: string;
  cultural: string;
  collocationsText: string;
  note: string;
  phoneticTranscription?: string | null;
  sourceSentence: string;
  manualMode: boolean;
  addedToDeck: boolean;
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you',
  'he', 'she', 'it', 'we', 'they',
]);

const GHOST_CARD_STATUS_TEXT = [
  'Extracting vocabulary...',
  'Analyzing linguistic context...',
  'Structuring premium flashcard...',
  'Finalizing definitions...',
] as const;

function getGhostCardTone(params: {
  palette: ReturnType<typeof resolveThemeColors>;
  isLight: boolean;
}) {
  const { palette, isLight } = params;
  if (isLight) {
    return {
      pulseShadowColor: '#0F172A',
      chipBg: 'rgba(15,23,42,0.06)',
      chipBorder: 'rgba(15,23,42,0.08)',
      iconBg: 'rgba(15,23,42,0.03)',
      iconBorder: 'rgba(15,23,42,0.08)',
      heroBg: 'rgba(15,23,42,0.05)',
      heroBorder: 'rgba(15,23,42,0.08)',
      divider: '#E2E8F0',
      statusBg: 'rgba(15,23,42,0.035)',
      statusBorder: 'rgba(15,23,42,0.08)',
      lineStrong: 'rgba(15,23,42,0.07)',
      lineSoft: 'rgba(15,23,42,0.06)',
      footerBg: 'rgba(15,23,42,0.03)',
      footerBorder: 'rgba(15,23,42,0.08)',
      outlineBase: 0.22,
      outlinePulse: 0.22,
      shadowBase: 0.08,
      shadowPulse: 0.08,
    };
  }

  return {
    pulseShadowColor: MODAL_CTA_COLOR,
    chipBg: '#334155',
    chipBorder: 'rgba(148,163,184,0.22)',
    iconBg: 'rgba(255,255,255,0.03)',
    iconBorder: 'rgba(148,163,184,0.22)',
    heroBg: 'rgba(255,255,255,0.04)',
    heroBorder: 'rgba(148,163,184,0.18)',
    divider: '#334155',
    statusBg: 'rgba(255,255,255,0.03)',
    statusBorder: 'rgba(148,163,184,0.18)',
    lineStrong: 'rgba(255,255,255,0.06)',
    lineSoft: 'rgba(255,255,255,0.05)',
    footerBg: 'rgba(255,255,255,0.02)',
    footerBorder: 'rgba(148,163,184,0.18)',
    outlineBase: 0.58,
    outlinePulse: 0.28,
    shadowBase: 0.18,
    shadowPulse: 0.16,
  };
}

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
  const normalized = (raw || '')
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .trim();
  if (!normalized) return '';
  const pieces = normalized.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) || [];
  return pieces.join('');
}

function normalizeDisplayWord(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function triggerBuzzHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  setTimeout(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, 90);
}

function tokenizeSourceText(text: string): string[] {
  const normalized = (text || '').normalize('NFKC');
  if (!normalized.trim()) return [];
  const tokens =
    normalized.match(
      /[\p{Script=Han}]{1,6}|[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[A-Za-z][A-Za-z'’-]*|[0-9]+/gu
    ) || [];
  return tokens.map((token) => token.trim()).filter(Boolean);
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

function buildManualCardDraft(word: string, phoneticTranscription?: string | null): CompletedCard {
  return {
    word,
    displayWord: normalizeDisplayWord(word) || word,
    targetPhrase: undefined,
    partOfSpeech: '',
    definition: '',
    cultural: '',
    collocationsText: '',
    note: '',
    phoneticTranscription: phoneticTranscription || null,
    sourceSentence: word,
    manualMode: true,
    addedToDeck: true,
  };
}

type PreviewPhase = 'frontThinking' | 'frontReveal' | 'backReveal' | 'complete';

type PreviewRevealState = {
  showFrontWord: boolean;
  showFrontDefinition: boolean;
  showFrontSentence: boolean;
  showFrontTranslation: boolean;
  showFrontNotes: boolean;
  showBackCollocation: boolean;
  showBackExample: boolean;
  showBackCultural: boolean;
  showBackNote: boolean;
};

const EMPTY_PREVIEW_REVEAL: PreviewRevealState = {
  showFrontWord: false,
  showFrontDefinition: false,
  showFrontSentence: false,
  showFrontTranslation: false,
  showFrontNotes: false,
  showBackCollocation: false,
  showBackExample: false,
  showBackCultural: false,
  showBackNote: false,
};

const COMPLETE_PREVIEW_REVEAL: PreviewRevealState = {
  showFrontWord: true,
  showFrontDefinition: true,
  showFrontSentence: true,
  showFrontTranslation: true,
  showFrontNotes: true,
  showBackCollocation: true,
  showBackExample: true,
  showBackCultural: true,
  showBackNote: true,
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSentenceTranslationText(card: CompletedCard): string {
  const raw = (card.cultural || '').trim();
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] || `${card.displayWord}：${card.definition || 'Generating meaning...'}`;
  const quotedWord = `「${card.displayWord}」`;
  return firstLine.includes(quotedWord) ? firstLine : `${quotedWord}：${firstLine}`;
}

function buildSentenceNotesText(card: CompletedCard): string {
  const raw = (card.cultural || '').trim();
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(1).join('\n');
  if (raw) return raw;
  return card.manualMode ? 'Add your own sentence note.' : 'Context note is being prepared.';
}

function buildCulturalBackgroundText(card: CompletedCard): string {
  return (card.cultural || '').trim() || 'No cultural background generated.';
}

function buildExampleSentenceText(card: CompletedCard): string {
  const firstCollocation = collocationsFromText(card.collocationsText)[0]?.phrase || card.displayWord;
  const baseSentence = (card.sourceSentence || '').trim();
  if (!baseSentence) return `Try using "${firstCollocation}" in a sentence today.`;
  return `A natural example using "${firstCollocation}" is: "${baseSentence}"`;
}

function ProgressiveText({
  text,
  active,
  style,
}: {
  text: string;
  active: boolean;
  style: any;
}) {
  const [visibleCount, setVisibleCount] = React.useState(active ? 0 : 0);

  React.useEffect(() => {
    if (!active) {
      setVisibleCount(0);
      return;
    }
    const totalLength = text.length;
    if (totalLength === 0) {
      setVisibleCount(0);
      return;
    }
    setVisibleCount(0);
    const interval = setInterval(() => {
      setVisibleCount((prev) => {
        const next = Math.min(totalLength, prev + Math.max(1, Math.ceil(totalLength / 42)));
        if (next >= totalLength) {
          clearInterval(interval);
        }
        return next;
      });
    }, 54);
    return () => clearInterval(interval);
  }, [active, text]);

  return <Text style={style}>{active ? text.slice(0, visibleCount) : ''}</Text>;
}

function CreateCardPreviewScene({
  processingWord,
  card,
  palette,
  isLight,
  hasImage,
  imageUri,
  statusText,
  revealState,
  phase,
  onBackCardLayout,
}: {
  processingWord: string;
  card: CompletedCard | null;
  palette: ReturnType<typeof resolveThemeColors>;
  isLight: boolean;
  hasImage: boolean;
  imageUri: string | null;
  statusText: string;
  revealState: PreviewRevealState;
  phase: PreviewPhase;
  onBackCardLayout?: ((y: number) => void) | undefined;
}) {
  const pulse = useSharedValue(0);
  const tone = React.useMemo(() => getGhostCardTone({ palette, isLight }), [isLight, palette]);
  const previewWord = card?.displayWord || processingWord;
  const previewPartOfSpeech = card?.partOfSpeech || 'Generating';
  const previewDefinition = card?.definition || statusText;
  const previewSourceSentence = card?.sourceSentence || processingWord;
  const previewTranslation = card ? buildSentenceTranslationText(card) : statusText;
  const previewSentenceNotes = card ? buildSentenceNotesText(card) : statusText;
  const previewCollocations = card ? collocationsFromText(card.collocationsText) : [];
  const previewCollocation = previewCollocations[0]?.phrase || previewWord;
  const previewExample = card ? buildExampleSentenceText(card) : statusText;
  const previewCultural = card ? buildCulturalBackgroundText(card) : statusText;
  const previewPersonalNote = card?.note?.trim() || 'No personal note yet.';
  const isThinking = phase === 'frontThinking';
  const backVisible = phase === 'backReveal' || phase === 'complete';

  React.useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse]);

  const animatedCardStyle = useAnimatedStyle(() => {
    const borderTint = tone.outlineBase + pulse.value * tone.outlinePulse;
    return {
      borderColor: `rgba(78,175,244,${borderTint})`,
      shadowOpacity: tone.shadowBase + pulse.value * tone.shadowPulse,
      transform: [{ scale: 0.998 + pulse.value * 0.002 }],
    };
  }, [tone]);

  return (
    <View style={styles.previewScene}>
      <Reanimated.View
        style={[
          styles.previewCardShell,
          {
            backgroundColor: palette.containerBg,
            shadowColor: tone.pulseShadowColor,
          },
          animatedCardStyle,
        ]}
      >
        {hasImage && imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.previewHeroImage} resizeMode="cover" />
        ) : null}

        <View style={styles.previewBody}>
          <View style={styles.previewHeaderRow}>
            <View style={styles.previewHeaderMain}>
              <Reanimated.View entering={FadeIn.duration(240)}>
                <ProgressiveText
                  text={previewWord}
                  active={revealState.showFrontWord || isThinking}
                  style={[styles.previewWord, { color: palette.textOnContainer }]}
                />
              </Reanimated.View>
              <Reanimated.View
                entering={FadeIn.duration(220)}
                style={[
                  styles.previewPosChip,
                  {
                    backgroundColor: tone.chipBg,
                    borderColor: tone.chipBorder,
                  },
                ]}
              >
                <ProgressiveText
                  text={previewPartOfSpeech}
                  active={revealState.showFrontWord || isThinking}
                  style={[styles.previewPosChipText, { color: palette.secondaryText }]}
                />
              </Reanimated.View>
            </View>
            <View style={styles.previewAudioWrap}>
              <Ionicons name="volume-medium-outline" size={28} color={palette.secondaryText} />
            </View>
          </View>

          <View style={styles.previewDefinitionRow}>
            <ProgressiveText
              text={previewDefinition}
              active={revealState.showFrontDefinition}
              style={[styles.previewDefinitionText, { color: palette.textOnContainer }]}
            />
            {isThinking && !revealState.showFrontDefinition ? (
              <View
                style={[
                  styles.previewStatusSlot,
                  {
                    backgroundColor: tone.statusBg,
                    borderColor: tone.statusBorder,
                  },
                ]}
              >
                <Reanimated.Text
                  key={statusText}
                  entering={FadeIn.duration(280)}
                  exiting={FadeOut.duration(220)}
                  style={[styles.previewStatusText, { color: palette.textOnContainer }]}
                >
                  {statusText}
                </Reanimated.Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.previewDivider, { backgroundColor: tone.divider }]} />

          <View style={styles.previewFrontSection}>
            <ProgressiveText
              text={previewSourceSentence}
              active={revealState.showFrontSentence}
              style={[styles.previewSentenceText, { color: palette.textOnContainer }]}
            />
            <ProgressiveText
              text={previewTranslation}
              active={revealState.showFrontTranslation}
              style={[styles.previewSentenceText, styles.previewTranslationText, { color: palette.textOnContainer }]}
            />
          </View>

          <View style={styles.previewSectionBlock}>
            <Reanimated.Text
              entering={FadeIn.duration(200)}
              style={[styles.previewSectionLabel, { color: palette.secondaryText }]}
            >
              Sentence notes
            </Reanimated.Text>
            <ProgressiveText
              text={previewSentenceNotes}
              active={revealState.showFrontNotes}
              style={[styles.previewSectionBody, { color: palette.secondaryText }]}
            />
          </View>

          <View style={styles.previewFooterRow}>
            {['mic-outline', 'share-outline', 'heart-outline', 'bookmark-outline'].map((iconName, index) => (
              <View
                key={`preview-front-${iconName}-${index}`}
                style={[
                  styles.previewFooterBtn,
                  {
                    borderColor: tone.footerBorder,
                    backgroundColor: tone.footerBg,
                  },
                ]}
              >
                <Ionicons name={iconName as any} size={24} color={palette.secondaryText} />
              </View>
            ))}
          </View>
        </View>
      </Reanimated.View>

      <Reanimated.View
        onLayout={(event) => {
          onBackCardLayout?.(event.nativeEvent.layout.y);
        }}
        style={[
          styles.previewCardShell,
          {
            backgroundColor: palette.containerBg,
            shadowColor: tone.pulseShadowColor,
            opacity: backVisible ? 1 : 0.9,
          },
          animatedCardStyle,
        ]}
      >
        <View style={styles.previewBody}>
          <View style={styles.previewSectionBlock}>
            <Text style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>Collocation</Text>
            <ProgressiveText
              text={`• ${previewCollocation}`}
              active={revealState.showBackCollocation}
              style={[styles.previewBackMainText, { color: palette.textOnContainer }]}
            />
          </View>

          <View style={styles.previewSectionBlock}>
            <Text style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>Example sentence</Text>
            <ProgressiveText
              text={previewExample}
              active={revealState.showBackExample}
              style={[styles.previewBackMainText, { color: palette.textOnContainer }]}
            />
          </View>

          <View style={[styles.previewDivider, { backgroundColor: tone.divider }]} />

          <View style={styles.previewSectionBlock}>
            <Text style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>Cultural background</Text>
            <ProgressiveText
              text={previewCultural}
              active={revealState.showBackCultural}
              style={[styles.previewSectionBodyStrong, { color: palette.textOnContainer }]}
            />
          </View>

          <View style={[styles.previewDivider, { backgroundColor: tone.divider }]} />

          <View style={styles.previewSectionBlock}>
            <Text style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>Personal notes</Text>
            <ProgressiveText
              text={previewPersonalNote}
              active={revealState.showBackNote}
              style={[styles.previewSectionBody, { color: palette.textOnContainer }]}
            />
          </View>
        </View>
      </Reanimated.View>
    </View>
  );
}

function pickSentenceContainingWord(text: string, word: string): string {
  const source = (text || '').trim();
  const target = normalizeWord(word);
  if (!source) return '';
  if (!target) return source;

  const sentences = source
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!sentences.length) return source;

  const hasLatinOrDigit = /[a-z0-9]/i.test(target);
  const matched = hasLatinOrDigit
    ? (() => {
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`\\b${escaped}\\b`, 'i');
      return sentences.find((sentence) => reg.test(sentence));
    })()
    : sentences.find((sentence) => sentence.includes(target));
  return matched || sentences[0] || source;
}

async function uploadCardImageToSupabase(params: {
  imageUri: string;
  cachedItemId: string;
}): Promise<string | null> {
  const { imageUri, cachedItemId } = params;
  if (!imageUri.trim()) return null;
  if (/^https?:\/\//i.test(imageUri)) return imageUri;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    throw authError || new Error('尚未登入，無法上傳圖片');
  }

  // Normalize to JPEG before upload to avoid iOS Blob corruption / decoder issues.
  const normalized = await ImageManipulator.manipulateAsync(
    imageUri,
    [],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
  );
  const base64 = await FileSystemLegacy.readAsStringAsync(normalized.uri, {
    encoding: 'base64',
  });
  if (!base64) {
    throw new Error('圖片轉碼失敗：無法讀取 base64');
  }
  const dataUrl = `data:image/jpeg;base64,${base64}`;
  const imageBytes = await fetch(dataUrl).then((res) => res.arrayBuffer());
  if (!imageBytes || imageBytes.byteLength === 0) {
    throw new Error('圖片轉碼失敗：位元組內容為空');
  }
  const storagePath = `${user.id}/${cachedItemId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('cached-images')
    .upload(storagePath, imageBytes, {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from('cached-images')
    .createSignedUrl(storagePath, 60 * 60);
  if (signedError || !signedData?.signedUrl) {
    throw new Error(
      `圖片已上傳，但無法建立讀取簽名網址（可能是 Storage 權限設定問題）: ${signedError?.message || 'unknown error'}`
    );
  }

  return storagePath;
}

export default function CreateCardScreen({ navigation, route }: Props) {
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const isLight = colorScheme === 'light';
  const { height: windowHeight } = useWindowDimensions();
  const {
    cachedItem,
    croppedImageUri,
    originalImageUri: routeOriginalImageUri,
    runOcrOnLoad,
    generationMode,
  } = route.params as {
    cachedItem: CachedItem;
    croppedImageUri?: string;
    originalImageUri?: string;
    runOcrOnLoad?: boolean;
    generationMode?: 'manual' | 'ai-assisted';
  };

  const goToCacheHome = React.useCallback(() => {
    if (typeof navigation?.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('CacheList');
  }, [navigation]);

  const baseSourceText = React.useMemo(() => getCachedItemSourceText(cachedItem), [cachedItem]);
  const ocrImageUri = React.useMemo(
    () => croppedImageUri || routeOriginalImageUri || cachedItem.mediaUri || cachedItem.imageStoragePath || null,
    [cachedItem.imageStoragePath, cachedItem.mediaUri, croppedImageUri, routeOriginalImageUri]
  );
  const originalImageUri = React.useMemo(
    () => routeOriginalImageUri || cachedItem.mediaUri || croppedImageUri || cachedItem.imageStoragePath || null,
    [cachedItem.imageStoragePath, cachedItem.mediaUri, croppedImageUri, routeOriginalImageUri]
  );
  const [ocrSourceText, setOcrSourceText] = React.useState('');
  const [isOcrRunning, setIsOcrRunning] = React.useState(false);
  const [ocrError, setOcrError] = React.useState<string | null>(null);
  const [aiReplyLanguage, setAiReplyLanguage] = React.useState(DEFAULT_USER_SETTINGS.aiReplyLanguage);
  const sourceText = React.useMemo(
    () => (ocrSourceText.trim() ? ocrSourceText : baseSourceText),
    [baseSourceText, ocrSourceText]
  );
  const sourceTokens = React.useMemo(() => {
    const fromText = sourceText.trim() ? tokenizeSourceText(sourceText) : [];
    if (fromText.length > 0) return fromText;

    const highlights = Array.isArray(cachedItem.aiHighlightedTerms)
      ? cachedItem.aiHighlightedTerms.filter(Boolean)
      : [];
    if (highlights.length > 0) return highlights;

    return ['example', 'word'];
  }, [cachedItem.aiHighlightedTerms, sourceText]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await loadUserSettings();
        if (!cancelled) {
          setAiReplyLanguage(settings.aiReplyLanguage);
        }
      } catch (error) {
        console.error('[CreateCard] load ai reply language failed:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [selectedWords, setSelectedWords] = React.useState<string[]>([]);
  const [hasStarted, setHasStarted] = React.useState(false);
  const [generatingCards, setGeneratingCards] = React.useState<GeneratingCard[]>([]);
  const [completedCards, setCompletedCards] = React.useState<CompletedCard[]>([]);
  const [entitlementSnapshot, setEntitlementSnapshot] = React.useState<EntitlementSnapshot | null>(null);
  const [showCollocations, setShowCollocations] = React.useState<Record<string, boolean>>({});
  const [generatedWords, setGeneratedWords] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [ghostStatusIndex, setGhostStatusIndex] = React.useState(0);
  const scrollRef = React.useRef<ScrollView | null>(null);
  const previewSceneYRef = React.useRef<number>(0);
  const previewBackCardYRef = React.useRef<number>(0);
  const previewRunIdRef = React.useRef(0);
  const [activePreviewCard, setActivePreviewCard] = React.useState<CompletedCard | null>(null);
  const [previewPhase, setPreviewPhase] = React.useState<PreviewPhase>('frontThinking');
  const [previewRevealState, setPreviewRevealState] = React.useState<PreviewRevealState>(EMPTY_PREVIEW_REVEAL);
  const effectiveGenerationMode = React.useMemo<'manual' | 'ai-assisted'>(() => {
    if (generationMode) return generationMode;
    if (!entitlementSnapshot) return 'manual';
    return entitlementSnapshot.canUseAutoCardGeneration ? 'ai-assisted' : 'manual';
  }, [entitlementSnapshot?.canUseAutoCardGeneration, generationMode]);
  const isGhostGenerating = hasStarted && generatingCards.some((card) => !card.completed);
  const isPreviewSceneActive = Boolean(activePreviewCard) || isGhostGenerating;
  const isPreviewLocked = isGhostGenerating || previewPhase === 'frontReveal' || previewPhase === 'backReveal';
  const shouldHideSourcePanels = hasStarted;

  React.useEffect(() => {
    if (!hasStarted || !generatingCards.some((card) => !card.completed)) {
      setGhostStatusIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setGhostStatusIndex((prev) => (prev + 1) % GHOST_CARD_STATUS_TEXT.length);
    }, 1500);
    return () => clearInterval(timer);
  }, [generatingCards, hasStarted]);

  React.useEffect(() => {
    let active = true;
    const runOCR = async () => {
      if (!runOcrOnLoad || !ocrImageUri) return;
      setIsOcrRunning(true);
      setOcrError(null);
      try {
        const result = await extractTextFromImage(ocrImageUri);
        if (!active) return;
        const textFromBlocks = result.blocks
          .map((block) => block.text?.trim() || '')
          .filter(Boolean)
          .join(' ');
        const nextText = (result.fullText || '').trim() || textFromBlocks;
        if (nextText) {
          setOcrSourceText(nextText);
        } else {
          setOcrError('OCR 沒有辨識到可用文字');
        }
      } catch (error) {
        if (!active) return;
        console.error('[CreateCard] OCR failed:', error);
        setOcrError('OCR 失敗，已使用原始內容');
      } finally {
        if (active) {
          setIsOcrRunning(false);
        }
      }
    };
    void runOCR();
    return () => {
      active = false;
    };
  }, [ocrImageUri, runOcrOnLoad]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await SubscriptionService.getEntitlementSnapshot(cachedItem.userId);
        if (!cancelled) {
          setEntitlementSnapshot(snapshot);
        }
      } catch (error) {
        console.error('[CreateCard] load entitlement snapshot failed:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cachedItem.userId]);

  const scrollToPreviewPosition = React.useCallback((targetY: number) => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, targetY),
      animated: true,
    });
  }, []);

  const scrollToPreviewFront = React.useCallback(() => {
    scrollToPreviewPosition(previewSceneYRef.current - 10);
  }, [scrollToPreviewPosition]);

  const scrollToPreviewBack = React.useCallback((extraOffset = 0) => {
    const focusOffset = Math.max(110, windowHeight * 0.28);
    scrollToPreviewPosition(
      previewSceneYRef.current + previewBackCardYRef.current + extraOffset - focusOffset
    );
  }, [scrollToPreviewPosition, windowHeight]);

  const runCardRevealSequence = React.useCallback(
    async (card: CompletedCard) => {
      const runId = ++previewRunIdRef.current;
      const stillCurrent = () => previewRunIdRef.current === runId;

      setActivePreviewCard(card);
      setPreviewPhase('frontReveal');
      setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
      scrollToPreviewFront();
      await wait(240);
      if (!stillCurrent()) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPreviewRevealState((prev) => ({ ...prev, showFrontWord: true }));
      await wait(280);
      if (!stillCurrent()) return;

      setPreviewRevealState((prev) => ({ ...prev, showFrontDefinition: true }));
      await wait(Math.max(900, Math.min(1800, card.definition.length * 18)));
      if (!stillCurrent()) return;

      setPreviewRevealState((prev) => ({ ...prev, showFrontSentence: true }));
      await wait(Math.max(700, Math.min(1600, card.sourceSentence.length * 12)));
      if (!stillCurrent()) return;

      setPreviewRevealState((prev) => ({ ...prev, showFrontTranslation: true }));
      await wait(820);
      if (!stillCurrent()) return;

      setPreviewRevealState((prev) => ({ ...prev, showFrontNotes: true }));
      await wait(920);
      if (!stillCurrent()) return;

      setPreviewPhase('backReveal');
      scrollToPreviewBack(24);
      await wait(420);
      if (!stillCurrent()) return;

      void Haptics.selectionAsync();
      setPreviewRevealState((prev) => ({ ...prev, showBackCollocation: true }));
      scrollToPreviewBack(56);
      await wait(760);
      if (!stillCurrent()) return;

      setPreviewRevealState((prev) => ({ ...prev, showBackExample: true }));
      scrollToPreviewBack(146);
      await wait(900);
      if (!stillCurrent()) return;

      setPreviewRevealState((prev) => ({ ...prev, showBackCultural: true }));
      scrollToPreviewBack(260);
      await wait(Math.max(950, Math.min(2100, (card.cultural || '').length * 8)));
      if (!stillCurrent()) return;

      setPreviewRevealState((prev) => ({ ...prev, showBackNote: true }));
      scrollToPreviewBack(360);
      await wait(520);
      if (!stillCurrent()) return;

      setPreviewPhase('complete');
    },
    [scrollToPreviewBack, scrollToPreviewFront]
  );

  const toggleWord = (word: string) => {
    const cleanWord = normalizeWord(word);
    if (!cleanWord) return;

    setSelectedWords((prev) =>
      prev.includes(cleanWord) ? prev.filter((w) => w !== cleanWord) : [...prev, cleanWord]
    );
  };

  const processWord = React.useCallback(
    async (word: string) => {
      const sentenceForCard = pickSentenceContainingWord(sourceText, word) || sourceText || word;
      try {
        if (effectiveGenerationMode === 'manual') {
          const localPhonetic = await getLocalPhoneticTranscription(word);
          const card = {
            ...buildManualCardDraft(word, localPhonetic),
            sourceSentence: sentenceForCard,
          };
          setGeneratingCards((prev) =>
            prev.map((item) =>
              item.word === word ? { ...item, completed: true } : item
            )
          );
          setCompletedCards((prev) => [...prev, card]);
          setGeneratedWords((prev) => new Set([...prev, word]));
          return;
        }

        const generated = await generateContentForWord(word, sentenceForCard, {
          replyLanguage: aiReplyLanguage,
        });
        triggerBuzzHaptic();
        const resolvedDisplayWord =
          normalizeDisplayWord(generated.suggestedWord || word) || word;
        const resolvedTargetPhrase =
          generated.isPartOfPhrase && generated.detectedPhrase
            ? normalizeDisplayWord(generated.detectedPhrase)
            : undefined;
        const card: CompletedCard = {
          word,
          displayWord: resolvedDisplayWord,
          targetPhrase:
            resolvedTargetPhrase && resolvedTargetPhrase.toLowerCase() !== resolvedDisplayWord.toLowerCase()
              ? resolvedTargetPhrase
              : undefined,
          partOfSpeech: generated.partOfSpeech || 'noun',
          definition: generated.definition || `${resolvedDisplayWord}（待補充定義）`,
          cultural: generated.contextualExplanation || '',
          collocationsText: (generated.frequentCollocations || '').trim(),
          note: '',
          phoneticTranscription: generated.phoneticTranscription || null,
          sourceSentence: sentenceForCard,
          manualMode: false,
          addedToDeck: true,
        };

        setGeneratingCards((prev) =>
          prev.map((item) =>
            item.word === word ? { ...item, completed: true } : item
          )
        );
        await runCardRevealSequence(card);
        setCompletedCards((prev) => [...prev, card]);
        setActivePreviewCard(null);
        setPreviewPhase('complete');
        setPreviewRevealState(COMPLETE_PREVIEW_REVEAL);
        setGeneratedWords((prev) => new Set([...prev, word]));
      } catch (error) {
        console.error('[CreateCard] generate failed:', word, error);
        setGeneratingCards((prev) =>
          prev.map((item) =>
            item.word === word ? { ...item, completed: true } : item
          )
        );
        setCompletedCards((prev) => [
          ...prev,
          {
            word,
            displayWord: word,
            targetPhrase: undefined,
            partOfSpeech: '',
            definition: '',
            cultural: '',
            collocationsText: '',
            note: '',
            phoneticTranscription: null,
            sourceSentence: sentenceForCard,
            manualMode: true,
            addedToDeck: true,
          },
        ]);
        setActivePreviewCard(null);
        setPreviewPhase('complete');
        setPreviewRevealState(COMPLETE_PREVIEW_REVEAL);
        setGeneratedWords((prev) => new Set([...prev, word]));
      }
    },
    [aiReplyLanguage, effectiveGenerationMode, runCardRevealSequence, sourceText]
  );

  const beginGenerate = React.useCallback(async () => {
    if (selectedWords.length === 0) return;

    const newWords = selectedWords.filter((word) => !generatedWords.has(word));
    if (newWords.length === 0) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHasStarted(true);
    setActivePreviewCard(null);
    setPreviewPhase('frontThinking');
    setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
    scrollToPreviewFront();

    for (const word of newWords) {
      setPreviewPhase('frontThinking');
      setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
      setGeneratingCards([{ word, completed: false }]);
      await processWord(word);
    }

    setTimeout(() => {
      setHasStarted(false);
      setGeneratingCards([]);
    }, 220);
  }, [generatedWords, processWord, scrollToPreviewFront, selectedWords]);

  const cardsToSave = completedCards.filter((card) => card.addedToDeck);
  const newSelectedWords = selectedWords.filter((word) => !generatedWords.has(word));
  const hasNewWords = newSelectedWords.length > 0;
  const isPlanResolving = !generationMode && !entitlementSnapshot;
  const isGenerateDisabled = selectedWords.length === 0 || isPlanResolving;

  React.useEffect(() => {
    if (!isGhostGenerating) return;
    const timer = setTimeout(() => {
      scrollToPreviewFront();
    }, 60);
    return () => clearTimeout(timer);
  }, [isGhostGenerating, scrollToPreviewFront]);

  const handleGenerate = React.useCallback(async () => {
    if (selectedWords.length === 0 || isPlanResolving) return;
    if (effectiveGenerationMode === 'manual') {
      Alert.alert(
        '免費版使用手動建卡',
        '免費版可使用本地 OCR 與手動建卡；升級後可自動補上定義、搭配詞與語境說明。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '前往升級',
            onPress: () => {
              tabSwipeContext?.goToTab(2);
            },
          },
          {
            text: '手動建卡',
            onPress: () => {
              void beginGenerate();
            },
          },
        ]
      );
      return;
    }

    await beginGenerate();
  }, [beginGenerate, effectiveGenerationMode, isPlanResolving, selectedWords.length, tabSwipeContext]);

  const handleOpenPremiumUpsell = React.useCallback((featureLabel: string) => {
    Alert.alert(
      `解鎖 ${featureLabel}`,
      'Premium 可自動補上定義、搭配詞、例句與語境說明，幫你省下手動整理時間。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '前往升級',
          onPress: () => {
            tabSwipeContext?.goToTab(2);
          },
        },
      ]
    );
  }, [tabSwipeContext]);

  const updateCardField = React.useCallback((word: string, patch: Partial<CompletedCard>) => {
    setCompletedCards((prev) => prev.map((card) => (card.word === word ? { ...card, ...patch } : card)));
  }, []);

  const updateNote = (word: string, note: string) => {
    updateCardField(word, { note });
  };

  const toggleCollocations = (word: string) => {
    setShowCollocations((prev) => ({ ...prev, [word]: !prev[word] }));
  };

  const toggleAddToDeck = (word: string) => {
    setCompletedCards((prev) =>
      prev.map((card) => (card.word === word ? { ...card, addedToDeck: !card.addedToDeck } : card))
    );
  };

  const handleSave = async () => {
    if (cardsToSave.length === 0) {
      Alert.alert('尚未選擇', '請先勾選至少一張要加入 Deck 的卡片。');
      return;
    }

    setSaving(true);
    try {
      const imageSourceForUpload =
        originalImageUri ||
        cachedItem.imageStoragePath ||
        '';

      const cardsCollection = database.get<Card>('cards');
      const createdCardIds: string[] = [];
      const stickyDraftsToPersist: Array<{ cardId: string; note: string }> = [];
      await database.write(async () => {
        for (const cardDraft of cardsToSave) {
          const created = await cardsCollection.create((card) => {
            const sourceSentence = (cardDraft.sourceSentence || pickSentenceContainingWord(sourceText, cardDraft.word)).trim();
            card.userId = cachedItem.userId;
            card.cachedItemId = cachedItem.id;
            card.targetWord = cardDraft.displayWord;
            card.targetPhrase = cardDraft.targetPhrase || undefined;
            card.originalSentence = sourceSentence || sourceText;
            card.definition = cardDraft.definition.trim() || `${cardDraft.displayWord}（待補充定義）`;
            card.partOfSpeech = cardDraft.partOfSpeech.trim() || undefined;
            card.contextualExplanation = cardDraft.cultural.trim() || undefined;
            card.frequentCollocations = cardDraft.collocationsText.trim() || undefined;
            card.phoneticTranscription = cardDraft.phoneticTranscription || undefined;
            const tags = [cachedItem.sourceApp, 'create-flow'].filter(Boolean) as string[];
            card.tags = tags.length > 0 ? tags : undefined;
            card.sourceApp = cachedItem.sourceApp;
            card.imageUrl = undefined;
            card.easeFactor = 2.5;
            card.intervalDays = 1;
            card.repetitions = 0;
            card.nextReviewAt = new Date();
          });
          createdCardIds.push(created.id);
          if (cardDraft.note.trim()) {
            stickyDraftsToPersist.push({
              cardId: created.id,
              note: cardDraft.note.trim(),
            });
          }
        }

        await cachedItem.update((item) => {
          item.convertedToCard = true;
          item.deletedAt = new Date();
        });
      });

      if (stickyDraftsToPersist.length > 0) {
        const stickyNotesMap = await loadCardStickyNotes();
        stickyDraftsToPersist.forEach((draft) => {
          stickyNotesMap[draft.cardId] = draft.note;
        });
        await saveCardStickyNotes(stickyNotesMap);
      }
      const localImageSource = originalImageUri || imageSourceForUpload;
      if (localImageSource) {
        await Promise.all(
          createdCardIds.map(async (id) => {
            try {
              const localUri = await persistLocalCardImage(id, localImageSource);
              if (!localUri) {
                console.warn('[CreateCard] local card image persist skipped', {
                  cardId: id,
                  imageSourceForUpload: localImageSource,
                });
              }
            } catch (localPersistError) {
              console.warn('[CreateCard] local card image persist failed', {
                cardId: id,
                error: localPersistError instanceof Error ? localPersistError.message : localPersistError,
              });
            }
          })
        );
      }

      goToCacheHome();

      if (imageSourceForUpload) {
        setTimeout(() => {
          void (async () => {
            try {
              const uploadedImageUrl = await uploadCardImageToSupabase({
                imageUri: imageSourceForUpload,
                cachedItemId: cachedItem.id,
              });
              if (!uploadedImageUrl) return;
              await database.write(async () => {
                await Promise.all(
                  createdCardIds.map(async (id) => {
                    const row = await database.get<Card>('cards').find(id);
                    await row.update((card) => {
                      card.imageUrl = uploadedImageUrl;
                    });
                  })
                );
                await cachedItem.update((item) => {
                  item.imageStoragePath = uploadedImageUrl;
                });
              });
              console.log('[CreateCard] background image upload succeeded:', {
                cachedItemId: cachedItem.id,
                uploadedImageUrl,
                cardCount: createdCardIds.length,
              });
            } catch (backgroundUploadError) {
              console.warn('[CreateCard] background image upload failed:', backgroundUploadError);
            }
          })();
        }, 0);
      }
    } catch (error) {
      console.error('[CreateCard] save failed:', error);
      const message = error instanceof Error ? error.message : '儲存卡片失敗，請稍後再試。';
      Alert.alert('錯誤', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.containerBg }]} edges={['top']}>
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: palette.screenBg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!isPreviewLocked}
        showsVerticalScrollIndicator={!isPreviewLocked}
      >
        {!shouldHideSourcePanels && originalImageUri ? (
          <View
            style={[
              styles.block,
              {
                backgroundColor: palette.containerBg,
                borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                shadowOpacity: isLight ? 0.06 : 0.16,
              },
            ]}
          >
            <Text style={[styles.blockTitle, { color: palette.secondaryText }]}>Original Image</Text>
            <Image
              source={{ uri: originalImageUri }}
              style={[styles.originalImage, { backgroundColor: palette.modalOptionBg }]}
              resizeMode="contain"
            />
            {isOcrRunning ? <Text style={[styles.ocrStatus, { color: MODAL_CTA_COLOR }]}>OCR 辨識中...</Text> : null}
            {ocrError ? <Text style={[styles.ocrErrorText, { color: palette.destructiveBg }]}>{ocrError}</Text> : null}
          </View>
        ) : null}

        {!shouldHideSourcePanels ? (
        <View
          style={[
            styles.block,
            {
              backgroundColor: palette.containerBg,
              borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
              shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
              shadowOpacity: isLight ? 0.06 : 0.16,
            },
          ]}
        >
          <Text style={[styles.blockTitle, { color: palette.secondaryText }]}>Original Context</Text>
          <View style={styles.wordsWrap}>
            {sourceTokens.map((token, idx) => {
              const clean = normalizeWord(token);
              const isSelected = selectedWords.includes(clean);
              return (
                <TouchableOpacity
                  key={`${token}-${idx}`}
                  style={[
                    styles.tokenBtn,
                    {
                      backgroundColor: isSelected ? MODAL_CTA_COLOR : palette.modalOptionBg,
                      borderColor: isSelected ? MODAL_CTA_COLOR_BORDER : palette.modalOptionBorder,
                    },
                  ]}
                  onPress={() => toggleWord(token)}
                >
                  <Text
                    style={[
                      styles.tokenText,
                      { color: isSelected ? TEXT_ON_CTA : palette.textOnContainer },
                      isSelected && styles.tokenTextSelected,
                    ]}
                  >
                    {token}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        ) : null}

        {!shouldHideSourcePanels && selectedWords.length > 0 ? (
          <View
            style={[
              styles.block,
              {
                backgroundColor: palette.containerBg,
                borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                shadowOpacity: isLight ? 0.06 : 0.16,
              },
            ]}
          >
            <Text style={[styles.blockTitle, { color: palette.secondaryText }]}>Keywords</Text>
            <View style={styles.wordsWrap}>
              {selectedWords.map((word) => {
                const isGenerated = generatedWords.has(word);
                return (
                  <TouchableOpacity
                    key={word}
                    style={[
                      styles.keywordBtn,
                      {
                        backgroundColor: isGenerated ? '#10B981' : MODAL_CTA_COLOR,
                        borderColor: isGenerated ? 'rgba(16,185,129,0.72)' : MODAL_CTA_COLOR_BORDER,
                      },
                    ]}
                    onPress={() => toggleWord(word)}
                  >
                    <Text style={styles.keywordText}>{word}{isGenerated ? ' ✓' : ''}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {hasNewWords && completedCards.length > 0 ? (
              <View style={styles.generateInlineWrap}>
                <TouchableOpacity
                  style={[styles.generateInlineBtn, { backgroundColor: MODAL_CTA_COLOR, borderColor: MODAL_CTA_COLOR_BORDER }]}
                  disabled={isGenerateDisabled}
                  onPress={() => void handleGenerate()}
                >
                  <Text style={[styles.generateInlineText, { color: TEXT_ON_CTA }]}>
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
                <Text style={[styles.selectedSummaryText, { color: MODAL_CTA_COLOR }]}>
                  {effectiveGenerationMode === 'manual' ? '✍️' : '✨'} {selectedWords.length} word{selectedWords.length > 1 ? 's' : ''} selected
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => void handleGenerate()}
              disabled={isGenerateDisabled}
              style={[
                styles.generateButton,
                { backgroundColor: MODAL_CTA_COLOR, borderColor: MODAL_CTA_COLOR_BORDER },
                isGenerateDisabled && styles.generateButtonDisabled,
              ]}
            >
              <Text style={[styles.generateButtonText, { color: TEXT_ON_CTA }]}>
                {effectiveGenerationMode === 'manual' ? 'Create' : 'Generate'} {selectedWords.length > 0 ? `${selectedWords.length} Card${selectedWords.length > 1 ? 's' : ''}` : 'Cards'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {completedCards.length > 0 ? (
          <View style={styles.previewStackWrap}>
            {completedCards.map((card, index) => (
              <CreateCardPreviewScene
                key={`${card.word}-${card.sourceSentence}-${index}`}
                processingWord={card.displayWord}
                card={card}
                palette={palette}
                isLight={isLight}
                hasImage={Boolean(originalImageUri)}
                imageUri={originalImageUri || null}
                statusText=""
                revealState={COMPLETE_PREVIEW_REVEAL}
                phase="complete"
              />
            ))}
          </View>
        ) : null}

        {isPreviewSceneActive ? (
          <View
            style={styles.previewSceneWrap}
            onLayout={(event) => {
              previewSceneYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <CreateCardPreviewScene
              processingWord={generatingCards[0]?.word || activePreviewCard?.displayWord || selectedWords[0] || 'Generating'}
              card={activePreviewCard}
              palette={palette}
              isLight={isLight}
              hasImage={Boolean(originalImageUri)}
              imageUri={originalImageUri || null}
              statusText={GHOST_CARD_STATUS_TEXT[ghostStatusIndex]}
              revealState={previewRevealState}
              phase={previewPhase}
              onBackCardLayout={(y) => {
                previewBackCardYRef.current = y;
              }}
            />
          </View>
        ) : null}

        {!hasStarted && completedCards.length > 0 ? (
          <View style={styles.completedWrap}>
            <View style={styles.saveWrap}>
              <TouchableOpacity
                onPress={() => void handleSave()}
                disabled={cardsToSave.length === 0 || saving}
                style={[
                  styles.saveButton,
                  { backgroundColor: MODAL_CTA_COLOR, borderColor: MODAL_CTA_COLOR_BORDER },
                  (cardsToSave.length === 0 || saving) && styles.saveButtonDisabled,
                ]}
              >
                <Text style={[styles.saveButtonText, { color: TEXT_ON_CTA }]}>
                  {saving ? 'Saving...' : 'Save'}
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
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
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
    paddingTop: 4,
    paddingBottom: 24,
    gap: 12,
  },
  block: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  originalImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#F2F2F5',
  },
  ocrStatus: {
    marginTop: 8,
    color: '#5B4BD6',
    fontSize: 13,
    fontWeight: '600',
  },
  ocrErrorText: {
    marginTop: 8,
    color: '#C0392B',
    fontSize: 12,
    fontWeight: '500',
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
    borderWidth: 1,
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
    borderWidth: 1,
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
    borderRadius: 10,
    borderWidth: 1,
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
    borderRadius: 16,
    borderWidth: 1,
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
  previewSceneWrap: {
    gap: 14,
  },
  previewStackWrap: {
    gap: 16,
  },
  previewScene: {
    gap: 16,
  },
  previewCardShell: {
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 22,
    elevation: 10,
  },
  previewHeroImage: {
    width: '100%',
    height: 214,
    borderRadius: 18,
    marginBottom: 18,
  },
  previewBody: {
    flex: 1,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  previewHeaderMain: {
    flex: 1,
    paddingRight: 12,
  },
  previewWord: {
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38,
  },
  previewPosChip: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  previewPosChipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.35,
  },
  previewAudioWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewDefinitionRow: {
    marginTop: 18,
  },
  previewDefinitionText: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
  },
  previewStatusSlot: {
    minHeight: 104,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  previewStatusText: {
    fontSize: 23,
    lineHeight: 31,
    fontWeight: '700',
  },
  previewDivider: {
    marginTop: 18,
    height: 1,
    borderRadius: 999,
  },
  previewFrontSection: {
    marginTop: 18,
    gap: 12,
  },
  previewSentenceText: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  previewTranslationText: {
    marginTop: 2,
  },
  previewSectionBlock: {
    marginTop: 18,
  },
  previewSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  previewSectionBody: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '500',
  },
  previewSectionBodyStrong: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '600',
  },
  previewBackMainText: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  previewFooterRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewFooterBtn: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generatingDone: {
    fontWeight: '800',
  },
  completedWrap: {
    gap: 12,
  },
  cardBlock: {
    borderWidth: 1,
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
    borderWidth: 1,
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
  definitionInput: {
    minHeight: 82,
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
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlignVertical: 'top',
    fontSize: 13,
    color: '#0D0D0D',
  },
  singleLineInput: {
    minHeight: 44,
    paddingVertical: 10,
  },
  helperMetaText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
  },
  lockedAiPanel: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 6,
    opacity: 0.84,
  },
  lockedAiPanelTight: {
    marginTop: 2,
  },
  lockedAiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  lockedAiTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  lockedAiBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    color: TEXT_ON_CTA,
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  lockedAiBody: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
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
  collocationsEditor: {
    minHeight: 78,
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
    borderRadius: 16,
    borderWidth: 1,
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
