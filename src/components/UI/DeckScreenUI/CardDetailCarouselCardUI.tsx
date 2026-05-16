import React from 'react';
import {
  Animated,
  type GestureResponderEvent,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import Reanimated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type Card from '@database/models/Card';
import type { CloudPhonemeFeedback } from '@services/pronunciation/cloudCoach';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';

type Props = {
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
  onOpenFullscreen: (index: number, origin?: { x: number; y: number }) => void;
  cardDetailFontScale: number;
  snapInterval: number;
  sidePeekShift: number;
  sanitizePronunciationText: (text: string | undefined | null) => string;
  formatCardDate: (input: Date | string | undefined | null) => string;
  styles: any;
  isFavorite: boolean;
  isBookmarked: boolean;
  onOpenAlbumSheet: () => void;
  onToggleFavorite: () => void;
  onOpenStickyNote: () => void;
  stickyNoteText?: string;
  onOpenPronunciationModal: () => void;
  isLightMode?: boolean;
};

function buildFallbackCollocations(params: {
  targetWord: string;
  targetPhrase?: string | null;
  sourceSentence?: string | null;
}): string[] {
  const targetWord = (params.targetWord || '').trim();
  const targetPhrase = (params.targetPhrase || '').trim();
  const sourceSentence = (params.sourceSentence || '').trim();

  if (targetPhrase && targetPhrase.toLowerCase() !== targetWord.toLowerCase()) {
    return [targetPhrase];
  }
  if (targetWord.includes(' ')) {
    return [targetWord];
  }
  if (!sourceSentence || !targetWord) {
    return targetWord ? [targetWord] : [];
  }

  const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenReg = new RegExp(`\\b${escaped}\\b`, 'i');
  const sentenceTokens = sourceSentence.split(/\s+/).filter(Boolean);
  const matchIndex = sentenceTokens.findIndex((token) =>
    tokenReg.test(token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
  );

  if (matchIndex >= 0) {
    const phrase = sentenceTokens
      .slice(Math.max(0, matchIndex - 1), Math.min(sentenceTokens.length, matchIndex + 2))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (phrase) return [phrase];
  }

  return [targetWord];
}

function CardDetailCarouselCardUI({
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
  onOpenFullscreen,
  cardDetailFontScale,
  snapInterval,
  sidePeekShift,
  sanitizePronunciationText,
  formatCardDate,
  styles,
  isFavorite,
  isBookmarked,
  onOpenAlbumSheet,
  onToggleFavorite,
  onOpenStickyNote,
  stickyNoteText,
  onOpenPronunciationModal,
  isLightMode = false,
}: Props) {
  const FRONT_FOOTER_RESERVED_HEIGHT = 58;
  const frontCaptureRef = React.useRef<View | null>(null);
  const backCaptureRef = React.useRef<View | null>(null);
  const combinedShareRef = React.useRef<View | null>(null);
  const heroMediaRef = React.useRef<View | null>(null);
  const [isSharePickerVisible, setIsSharePickerVisible] = React.useState(false);
  const [shareSelection, setShareSelection] = React.useState<{
    front: boolean;
    back: boolean;
  }>({ front: true, back: false });
  const [sharePreviewUri, setSharePreviewUri] = React.useState<{
    front: string | null;
    back: string | null;
  }>({ front: null, back: null });
  const shareModalAnim = React.useRef(new Animated.Value(0)).current;
  const ui = React.useMemo(
    () =>
      isLightMode
        ? {
            paperBg: '#FFFFFF',
            paperBorder: 'rgba(0,0,0,0.06)',
            primaryText: '#111111',
            secondaryText: '#8A8E97',
            noteText: '#8A8E97',
            posBg: '#E7E9EF',
            posText: '#6B7280',
            divider: '#ECECF0',
            icon: '#1F2937',
            folderIcon: '#1F2937',
            starActive: '#EF4444',
            starInactive: '#1F2937',
          }
        : {
            paperBg: '#1E293B',
            paperBorder: '#334155',
            primaryText: '#F8FAFC',
            secondaryText: '#94A3B8',
            noteText: '#94A3B8',
            posBg: '#334155',
            posText: '#F8FAFC',
            divider: '#334155',
            icon: '#94A3B8',
            folderIcon: '#94A3B8',
            starActive: '#EF4444',
            starInactive: '#94A3B8',
          },
    [isLightMode]
  );
  const toChinesePartOfSpeech = React.useCallback((value: string | undefined | null): string => {
    const raw = (value || '').trim();
    if (!raw) return '詞性未標註';
    const normalized = raw.toLowerCase().replace(/\./g, '');

    const map: Record<string, string> = {
      n: '名詞', noun: '名詞', v: '動詞', verb: '動詞', vt: '及物動詞',
      vi: '不及物動詞', adj: '形容詞', adjective: '形容詞', adv: '副詞', adverb: '副詞',
      prep: '介系詞', preposition: '介系詞', pron: '代名詞', pronoun: '代名詞',
      conj: '連接詞', conjunction: '連接詞', interj: '感嘆詞', interjection: '感嘆詞',
      det: '限定詞', article: '冠詞', phrase: '片語', idiom: '慣用語',
      aux: '助動詞', modal: '情態動詞', num: '數詞',
    };

    return map[normalized] || raw;
  }, []);

  const textBlockHorizontalInset = 10;
  const itemWord = item.targetWord || item.targetPhrase || '-';
  const itemPronunciationText =
    sanitizePronunciationText(item.targetWord) ||
    sanitizePronunciationText(item.targetPhrase) ||
    sanitizePronunciationText(item.originalSentence) ||
    '';
  const itemCaption = toChinesePartOfSpeech(item.partOfSpeech || item.sourceApp || '');
  const itemDisplayDate = formatCardDate(item.createdAt);
  const isActiveCard = index === currentIndex;
  const definitionText = item.definition || '-';
  const isMockCard = itemWord.trim().toLowerCase() === 'mock';
  const hasHeroImage = Boolean(itemImageUri);
  const resolvedHeroImageUri = itemImageUri || undefined;
  const sourceSentence = React.useMemo(() => {
    const source = (item.originalSentence || '').trim();
    if (!source) return '-';
    const word = (itemWord || '').trim();
    if (!word) return source;

    const sentences = source
      .split(/(?<=[.!?。！？])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!sentences.length) return source;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp(`\\b${escaped}\\b`, 'i');
    const matched = sentences.find((s) => reg.test(s));
    return matched || sentences[0] || source;
  }, [item.originalSentence, itemWord]);
  const contextLines = React.useMemo(
    () =>
      (item.contextualExplanation || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [item.contextualExplanation]
  );
  const sentenceTranslationRaw = React.useMemo(() => contextLines[0] || '', [contextLines]);
  const translationText = React.useMemo(() => {
    const raw = (sentenceTranslationRaw || item.definition || '-').trim();
    if (!raw || raw === '-') return '-';
    const quotedWord = `「${itemWord}」`;
    const escaped = itemWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp(`\\b${escaped}\\b`, 'ig');
    const replaced = raw.replace(reg, quotedWord);
    return replaced.includes(quotedWord) ? replaced : `${quotedWord}：${replaced}`;
  }, [sentenceTranslationRaw, item.definition, itemWord]);
  const collocationItems = React.useMemo(() => {
    const directItems = (item.frequentCollocations || '')
      .split(/[\n,;]+/)
      .map((phrase) => phrase.trim())
      .filter(Boolean)
      .slice(0, 1);
    if (directItems.length > 0) return directItems;
    return buildFallbackCollocations({
      targetWord: itemWord,
      targetPhrase: item.targetPhrase,
      sourceSentence,
    });
  }, [item.frequentCollocations, item.targetPhrase, itemWord, sourceSentence]);
  const sentenceExplanation = React.useMemo(() => {
    if (contextLines.length > 1) return contextLines.slice(1).join('\n');
    if (contextLines.length === 1) return contextLines[0];
    if (item.definition?.trim()) return `This sentence uses 「${itemWord}」 to express: ${item.definition.trim()}`;
    return `This sentence highlights how 「${itemWord}」 is used in natural context.`;
  }, [contextLines, item.definition, itemWord]);
  const frontContentScale = React.useMemo(() => {
    const totalChars =
      (sourceSentence?.length || 0) + (translationText?.length || 0) + (sentenceExplanation?.length || 0);
    const imagePenalty = hasHeroImage ? 1.08 : 1;
    const weighted = totalChars * imagePenalty;
    if (weighted > 560) return 0.8;
    if (weighted > 460) return 0.86;
    if (weighted > 360) return 0.92;
    return 1;
  }, [hasHeroImage, sentenceExplanation, sourceSentence, translationText]);
  const frontSentenceFontSize = Math.round(20 * frontContentScale);
  const frontSentenceLineHeight = Math.round(28 * frontContentScale);
  const frontSentenceFontWeight: '600' = '600';
  const frontNoteFontSize = Math.round(19 * frontContentScale);
  const frontNoteLineHeight = Math.round(26 * frontContentScale);
  const hasStickyNote = Boolean((stickyNoteText || '').trim());
  const apiExampleSentence = React.useMemo(() => {
    const firstCollocation = collocationItems[0];
    if (!firstCollocation) return sourceSentence;
    if (!sourceSentence || sourceSentence === '-') {
      return `Try using "${firstCollocation}" in a sentence today.`;
    }
    const quoted = `"${firstCollocation}"`;
    return `A natural example using ${quoted} is: "${sourceSentence}"`;
  }, [collocationItems, sourceSentence]);
  const mockPronunciationScore = 92;
  const mockPronunciationFeedbackLines = React.useMemo(
    () => ['Strong overall rhythm. Shorten the final consonant release slightly.'],
    []
  );
  const mockPhonemeChips = React.useMemo<CloudPhonemeFeedback[]>(
    () => [
      { phoneme: '/m/', letters: 'm', accuracy: 94, level: 'green' },
      { phoneme: '/ɑː/', letters: 'o', accuracy: 89, level: 'green' },
      { phoneme: '/k/', letters: 'ck', accuracy: 93, level: 'green' },
    ],
    []
  );
  const culturalBackgroundText = React.useMemo(() => {
    const raw = (item.contextualExplanation || '').trim();
    if (!raw) return '';

    // 優先吃 LLM 結構化 JSON
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const direct = parsed.culturalBackground;
        if (typeof direct === 'string' && direct.trim()) return direct.trim();

        const origin =
          typeof parsed.origin === 'string'
            ? parsed.origin.trim()
            : typeof parsed.slangOrigin === 'string'
              ? parsed.slangOrigin.trim()
              : '';
        const whyUsed =
          typeof parsed.whyUsed === 'string'
            ? parsed.whyUsed.trim()
            : typeof parsed.usageReason === 'string'
              ? parsed.usageReason.trim()
              : '';
        const context =
          typeof parsed.context === 'string'
            ? parsed.context.trim()
            : typeof parsed.culturalContext === 'string'
              ? parsed.culturalContext.trim()
              : '';

        const chunks = [origin, whyUsed, context].filter(Boolean);
        if (chunks.length > 0) return chunks.join('\n');
      }
    } catch {
      // 非 JSON：使用原文字
    }

    return raw;
  }, [item.contextualExplanation]);
  const backTextScale = React.useMemo(() => {
    const totalChars =
      (collocationItems.join(' ').length || 0) +
      (apiExampleSentence?.length || 0) +
      (culturalBackgroundText?.length || 0) +
      (stickyNoteText?.length || 0);
    if (totalChars > 760) return 0.82;
    if (totalChars > 620) return 0.88;
    if (totalChars > 500) return 0.94;
    return 1;
  }, [apiExampleSentence, collocationItems, culturalBackgroundText, stickyNoteText]);
  const backTextFontSize = Math.round(20 * backTextScale);
  const backTextLineHeight = Math.round(28 * backTextScale);
  const weightedWordLength = Array.from(itemWord.trim()).reduce((total, ch) => {
    const isCjk = /[\u4E00-\u9FFF]/.test(ch);
    return total + (isCjk ? 1.7 : 1);
  }, 0);
  const referenceWordFontSize =
    (weightedWordLength > 18 ? 30 : weightedWordLength > 15 ? 34 : weightedWordLength > 12 ? 40 : 52) *
    cardDetailFontScale;
  const referenceWordLineHeight = Math.round(referenceWordFontSize * 1.08);

  // Carousel 外部動畫
  const animatedCardStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * snapInterval, index * snapInterval, (index + 1) * snapInterval];
    const scale = interpolate(scrollX.value, inputRange, [0.9, 1, 0.9], Extrapolation.CLAMP);
    const translateY = interpolate(scrollX.value, inputRange, [30, 0, 30], Extrapolation.CLAMP);
    const translateX = interpolate(scrollX.value, inputRange, [-sidePeekShift, 0, sidePeekShift], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.72, 1, 0.72], Extrapolation.CLAMP);
    const zIndex = Math.round(interpolate(scrollX.value, inputRange, [0, 100, 0], Extrapolation.CLAMP));

    return {
      opacity,
      zIndex,
      elevation: zIndex,
      transform: [{ scale }, { translateX }, { translateY }],
    };
  }, [index, scrollX, sidePeekShift, snapInterval]);

  // Flip 內部動畫
  const flipAnim = useSharedValue(0);

  const toggleFlip = () => {
    if (!isActiveCard) return;
    flipAnim.value = withTiming(flipAnim.value === 0 ? 1 : 0, { duration: 400 });
  };
  const handleOpenHeroFullscreen = React.useCallback(
    (event: GestureResponderEvent) => {
      const fallbackOrigin = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };

      if (!heroMediaRef.current) {
        onOpenFullscreen(index, fallbackOrigin);
        return;
      }

      heroMediaRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          onOpenFullscreen(index, {
            x: x + width / 2,
            y: y + height / 2,
          });
          return;
        }
        onOpenFullscreen(index, fallbackOrigin);
      });
    },
    [index, onOpenFullscreen]
  );
  const captureAndShareFace = React.useCallback(
    async (face: 'front' | 'back') => {
      const ref = face === 'front' ? frontCaptureRef.current : backCaptureRef.current;
      if (!ref) return;
      const uri = await captureRef(ref, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Share.share({
        url: uri,
        message: `${itemWord} (${face})`,
      });
    },
    [itemWord]
  );
  const captureFacePreview = React.useCallback(async (face: 'front' | 'back') => {
    const ref = face === 'front' ? frontCaptureRef.current : backCaptureRef.current;
    if (!ref) return null;
    try {
      const uri = await captureRef(ref, {
        format: 'png',
        quality: 0.9,
        result: 'tmpfile',
      });
      return uri;
    } catch {
      return null;
    }
  }, []);
  const openSharePicker = React.useCallback(async () => {
    if (!isActiveCard) return;
    setIsSharePickerVisible(true);
    const [front, back] = await Promise.all([captureFacePreview('front'), captureFacePreview('back')]);
    setSharePreviewUri({ front, back });
  }, [captureFacePreview, isActiveCard]);
  React.useEffect(() => {
    if (!isSharePickerVisible) return;
    shareModalAnim.setValue(0);
    Animated.spring(shareModalAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 240,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [isSharePickerVisible, shareModalAnim]);
  const toggleShareSelection = React.useCallback((key: 'front' | 'back') => {
    setShareSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const submitShareSelection = React.useCallback(async () => {
    const selectedCount = Number(shareSelection.front) + Number(shareSelection.back);
    if (!selectedCount) return;
    setIsSharePickerVisible(false);
    if (shareSelection.front && shareSelection.back && combinedShareRef.current) {
      const uri = await captureRef(combinedShareRef.current, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Share.share({
        url: uri,
        message: `${itemWord} (front + back)`,
      });
      return;
    }
    if (shareSelection.front) {
      await captureAndShareFace('front');
      return;
    }
    if (shareSelection.back) {
      await captureAndShareFace('back');
    }
  }, [captureAndShareFace, itemWord, shareSelection.back, shareSelection.front]);
  const handleSharePress = React.useCallback(() => {
    void openSharePicker();
  }, [openSharePicker]);

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 1], [0, 180]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden',
      // 當翻轉進度小於一半時，正面擁有較高層級以接收點擊
      zIndex: flipAnim.value < 0.5 ? 1 : 0,
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 1], [-180, 0]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      // 當翻轉進度大於一半時，背面擁有較高層級以接收點擊
      zIndex: flipAnim.value >= 0.5 ? 1 : 0,
    };
  });

  return (
    <Reanimated.View style={[styles.carouselCardContainer, animatedCardStyle]}>
      <Pressable style={styles.detailCardShell} onPress={toggleFlip}>
        <View style={[styles.detailCardScroll, styles.detailCardScrollContent, { flex: 1 }]}>
          <View style={{ flex: 1, width: '100%', position: 'relative' }}>
            
            {/* ========== 卡片正面 (FRONT FACE) ========== */}
            {/* 內容：圖片、單字、詞性、翻譯、中文解釋句 */}
            <Reanimated.View
              ref={frontCaptureRef}
              collapsable={false}
              style={[
                styles.detailPaper,
                { backgroundColor: ui.paperBg, borderColor: ui.paperBorder },
                frontAnimatedStyle,
                { flex: 1 },
              ]}
            >
              {hasHeroImage ? (
                <View ref={heroMediaRef} collapsable={false} style={styles.heroMediaWrap}>
                  <Pressable
                    style={({ pressed }) => (pressed ? localStyles.heroMediaPressed : null)}
                    onPress={handleOpenHeroFullscreen}
                  >
                    <Image source={{ uri: resolvedHeroImageUri }} style={styles.heroMedia} resizeMode="cover" />
                  </Pressable>
                </View>
              ) : null}

                <View
                  style={[
                    styles.referenceWordCard,
                    { backgroundColor: ui.paperBg },
                    {
                      marginHorizontal: -18 + textBlockHorizontalInset,
                      paddingHorizontal: textBlockHorizontalInset,
                      flex: 1,
                      paddingBottom: 0,
                    },
                  ]}
                >
                {/* 1. 單字本體 */}
                <View style={[styles.referenceRowTop, { position: 'relative' }]}>
                  <View style={[styles.referenceWordLeft, { minWidth: 0, flexShrink: 1 }]}>
                    <Text
                      style={[
                        styles.referenceWord,
                        { color: ui.primaryText, fontSize: referenceWordFontSize, lineHeight: referenceWordLineHeight },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.42}
                    >
                      {itemWord}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.referencePlayBtn,
                      { position: 'absolute', right: textBlockHorizontalInset + 2, top: 0, width: 28, height: 28, borderRadius: 0, backgroundColor: 'transparent' },
                      pressed ? localStyles.actionIconBtnPressed : null,
                    ]}
                    onPress={() => onPlayCard(itemPronunciationText, isActiveCard, index)}
                  >
                    <Ionicons name={isActiveCard && isPlaying ? 'volume-high' : 'volume-medium-outline'} size={28} color={ui.icon} />
                  </Pressable>
                </View>

                <ScrollView
                  style={[localStyles.frontBodyScroll, { marginBottom: FRONT_FOOTER_RESERVED_HEIGHT }]}
                  contentContainerStyle={localStyles.frontBodyContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.referenceMeaningRow}>
                    <View style={[styles.referencePosBadge, { backgroundColor: ui.posBg }]}>
                      <Text style={[styles.referencePosText, { color: ui.posText }]}>{itemCaption}</Text>
                    </View>
                    <Text
                      style={[
                        styles.referenceMeaning,
                        {
                          color: ui.primaryText,
                          fontSize: Math.round(20 * frontContentScale),
                          lineHeight: Math.round(28 * frontContentScale),
                        },
                      ]}
                    >
                      {definitionText}
                    </Text>
                  </View>

                  <View style={[styles.referenceDivider, { backgroundColor: ui.divider }]} />

                  <View style={localStyles.dualSentenceBlock}>
                    <Text
                      style={[
                        localStyles.dualSentenceText,
                        {
                          color: ui.primaryText,
                          fontSize: frontSentenceFontSize,
                          lineHeight: frontSentenceLineHeight,
                        },
                      ]}
                    >
                      {sourceSentence}
                    </Text>
                    <Text
                      style={[
                        localStyles.dualSentenceText,
                        {
                          color: ui.primaryText,
                          marginTop: 12,
                          fontSize: frontSentenceFontSize,
                          lineHeight: frontSentenceLineHeight,
                        },
                      ]}
                    >
                      {translationText}
                    </Text>
                  </View>

                  <View style={[styles.referenceSubSection, { marginTop: 14 }]}>
                    <Text style={[localStyles.sectionLabel, { color: ui.secondaryText }]}>Sentence notes</Text>
                    <Text
                      style={[
                        styles.referenceSubText,
                        {
                          color: ui.noteText,
                          fontSize: frontNoteFontSize,
                          lineHeight: frontNoteLineHeight,
                        },
                      ]}
                    >
                      {sentenceExplanation}
                    </Text>
                  </View>
                </ScrollView>

                {/* ----- 第一頁底部操作列 ----- */}
                <View style={localStyles.cardActionRow}>
                  <Pressable
                    style={({ pressed }) => [
                      localStyles.actionIconBtn,
                      pressed ? localStyles.actionIconBtnPressed : null,
                    ]}
                    onPress={onOpenPronunciationModal}
                  >
                    <Ionicons name="mic-outline" size={28} color={ui.icon} />
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      localStyles.actionIconBtn,
                      pressed ? localStyles.actionIconBtnPressed : null,
                    ]}
                    onPress={handleSharePress}
                  >
                    <Ionicons name="share-outline" size={28} color={ui.icon} />
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      localStyles.actionIconBtn,
                      pressed ? localStyles.actionIconBtnPressed : null,
                    ]}
                    onPress={onToggleFavorite}
                  >
                    <Ionicons
                      name={isFavorite ? 'heart' : 'heart-outline'}
                      size={28}
                      color={isFavorite ? ui.starActive : ui.starInactive}
                    />
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      localStyles.actionIconBtn,
                      pressed ? localStyles.actionIconBtnPressed : null,
                    ]}
                    onPress={onOpenAlbumSheet}
                  >
                    <Ionicons
                      name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                      size={28}
                      color={isBookmarked ? '#4EAFF4' : ui.folderIcon}
                    />
                  </Pressable>
                </View>
                {/* ----------------------------- */}

              </View>
            </Reanimated.View>

            {/* ========== 卡片背面 (BACK FACE) ========== */}
            {/* 內容：Collocation、AI造句、Pronunciation coach、底部資訊 */}
            <Reanimated.View
              ref={backCaptureRef}
              collapsable={false}
              style={[
                styles.detailPaper,
                { backgroundColor: ui.paperBg, borderColor: ui.paperBorder },
                backAnimatedStyle,
              ]}
            >
                <View
                  style={[
                    styles.referenceWordCard,
                    {
                      backgroundColor: ui.paperBg,
                      marginHorizontal: -18 + textBlockHorizontalInset,
                      paddingHorizontal: textBlockHorizontalInset,
                      flex: 1,
                      paddingTop: 0,
                      paddingBottom: 44,
                    },
                  ]}
                >
                <View style={localStyles.backTextSection}>
                  <ScrollView
                    style={localStyles.backBodyScroll}
                    contentContainerStyle={localStyles.backBodyContent}
                    showsVerticalScrollIndicator={false}
                  >
                  {collocationItems.length > 0 ? (
                    <View style={styles.referenceCollocationSection}>
                      <Text style={[localStyles.sectionLabel, { color: ui.secondaryText }]}>Collocation</Text>
                      <Text
                        style={[
                          styles.referenceCollocationItem,
                          {
                            color: ui.primaryText,
                            fontSize: backTextFontSize,
                            lineHeight: backTextLineHeight,
                          },
                        ]}
                      >
                        {`• ${collocationItems[0]}`}
                      </Text>
                    </View>
                  ) : null}

                  <View style={[styles.referenceSubSection, { marginTop: collocationItems.length > 0 ? 14 : 14 }]}>
                    <Text style={[localStyles.sectionLabel, { color: ui.secondaryText }]}>Example sentence</Text>
                    <View style={styles.referenceRowTop}>
                      <Text
                        style={[
                          styles.referenceExample,
                          {
                            color: ui.primaryText,
                            fontSize: backTextFontSize,
                            lineHeight: backTextLineHeight,
                            fontWeight: '600',
                          },
                        ]}
                      >
                        "{apiExampleSentence}"
                      </Text>
                      <Pressable
                        style={({ pressed }) => [
                          styles.referencePlayBtn,
                          { width: 28, height: 28, borderRadius: 0, backgroundColor: 'transparent', marginTop: 4 },
                          pressed ? localStyles.actionIconBtnPressed : null,
                        ]}
                        onPress={() => onPlayCard(apiExampleSentence, isActiveCard, index)}
                      >
                        <Ionicons name="volume-medium-outline" size={28} color={ui.icon} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={[styles.referenceDivider, { backgroundColor: ui.divider }]} />

                  <View style={[styles.referenceSubSection, { marginTop: 14 }]}>
                    <Text style={[localStyles.sectionLabel, { color: ui.secondaryText }]}>Cultural background</Text>
                    <ScrollView
                      style={localStyles.culturalScrollBox}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      <Text
                        style={[
                          localStyles.dualSentenceText,
                          {
                            color: ui.primaryText,
                            fontSize: backTextFontSize,
                            lineHeight: backTextLineHeight,
                            fontWeight: '600',
                          },
                        ]}
                      >
                        {culturalBackgroundText || 'No cultural background yet.'}
                      </Text>
                    </ScrollView>
                  </View>

                  <View style={[styles.referenceDivider, { backgroundColor: ui.divider }]} />

                  <View style={[styles.referenceSubSection, { marginTop: 12 }]}>
                    <Text style={[localStyles.sectionLabel, { color: ui.secondaryText }]}>Personal notes</Text>
                    {hasStickyNote ? (
                      <Text
                        style={[
                          localStyles.dualSentenceText,
                          {
                            color: ui.primaryText,
                            fontSize: backTextFontSize,
                            lineHeight: backTextLineHeight,
                            fontWeight: '500',
                          },
                        ]}
                      >
                        {stickyNoteText?.trim()}
                      </Text>
                    ) : null}
                    <Pressable
                      style={({ pressed }) => [
                        localStyles.noteActionBtn,
                        pressed ? localStyles.actionIconBtnPressed : null,
                      ]}
                      onPress={onOpenStickyNote}
                    >
                      <Ionicons name={hasStickyNote ? 'create-outline' : 'add'} size={16} color={ui.icon} />
                      <Text style={[localStyles.noteActionText, { color: ui.icon }]}>
                        {hasStickyNote ? 'Edit note' : 'Add a note'}
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
                </View>

                {/* 底部 Footer */}
                <View style={localStyles.backFooterPinned}>
                  <Text style={styles.referenceFooterText}>{itemDisplayDate || '部分6・基礎'}</Text>
                </View>

              </View>
            </Reanimated.View>

          </View>
        </View>
      </Pressable>
      <Modal
        visible={isSharePickerVisible}
        transparent
        animationType="none"
        onRequestClose={() => setIsSharePickerVisible(false)}
      >
        <Pressable style={localStyles.shareModalBackdrop} onPress={() => setIsSharePickerVisible(false)}>
          <Animated.View
            style={[
              localStyles.shareModalSheet,
              {
                opacity: shareModalAnim,
                transform: [
                  {
                    scale: shareModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable onPress={() => {}}>
            <Text style={localStyles.shareModalTitle}>Share screens</Text>
            <View style={localStyles.sharePreviewRow}>
              <Pressable
                style={({ pressed }) => [
                  localStyles.sharePreviewCard,
                  pressed ? localStyles.sharePreviewCardPressed : null,
                ]}
                onPress={() => toggleShareSelection('front')}
              >
                <View
                  style={[
                    localStyles.sharePreviewMedia,
                    shareSelection.front ? localStyles.sharePreviewMediaActive : null,
                  ]}
                >
                  {sharePreviewUri.front ? (
                    <Image source={{ uri: sharePreviewUri.front }} style={localStyles.sharePreviewImage} resizeMode="cover" />
                  ) : (
                    <Text style={localStyles.sharePreviewFallback}>Front</Text>
                  )}
                </View>
                <View style={localStyles.sharePreviewMetaRow}>
                  <Ionicons name={shareSelection.front ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={shareSelection.front ? '#4EAFF4' : '#94A3B8'} />
                  <Text style={localStyles.sharePreviewLabel}>Front</Text>
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  localStyles.sharePreviewCard,
                  pressed ? localStyles.sharePreviewCardPressed : null,
                ]}
                onPress={() => toggleShareSelection('back')}
              >
                <View
                  style={[
                    localStyles.sharePreviewMedia,
                    shareSelection.back ? localStyles.sharePreviewMediaActive : null,
                  ]}
                >
                  {sharePreviewUri.back ? (
                    <Image source={{ uri: sharePreviewUri.back }} style={localStyles.sharePreviewImage} resizeMode="cover" />
                  ) : (
                    <Text style={localStyles.sharePreviewFallback}>Back</Text>
                  )}
                </View>
                <View style={localStyles.sharePreviewMetaRow}>
                  <Ionicons name={shareSelection.back ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={shareSelection.back ? '#4EAFF4' : '#94A3B8'} />
                  <Text style={localStyles.sharePreviewLabel}>Back</Text>
                </View>
              </Pressable>

            </View>

            <View style={localStyles.shareActionRow}>
              <Pressable
                style={({ pressed }) => [
                  localStyles.shareCancelBtn,
                  pressed ? localStyles.shareActionBtnPressed : null,
                ]}
                onPress={() => setIsSharePickerVisible(false)}
              >
                <Text style={localStyles.shareCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  localStyles.shareConfirmBtn,
                  pressed ? localStyles.shareActionBtnPressed : null,
                ]}
                onPress={() => void submitShareSelection()}
              >
                <Text style={localStyles.shareConfirmText}>Share</Text>
              </Pressable>
            </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
      <View pointerEvents="none" style={localStyles.hiddenCombinedCaptureWrap}>
        <View ref={combinedShareRef} collapsable={false} style={localStyles.combinedCaptureSheet}>
          {sharePreviewUri.front ? (
            <Image source={{ uri: sharePreviewUri.front }} style={localStyles.combinedCaptureHalf} resizeMode="cover" />
          ) : null}
          {sharePreviewUri.back ? (
            <Image source={{ uri: sharePreviewUri.back }} style={localStyles.combinedCaptureHalf} resizeMode="cover" />
          ) : null}
        </View>
      </View>
    </Reanimated.View>
  );
}

const localStyles = StyleSheet.create({
  heroMediaPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  frontBodyScroll: {
    flex: 1,
    minHeight: 120,
  },
  frontBodyContent: {
    paddingBottom: 8,
  },
  backBodyScroll: {
    flex: 1,
    minHeight: 180,
  },
  backBodyContent: {
    paddingBottom: 10,
  },
  backTextSection: {
    flex: 1,
    minHeight: 0,
  },
  culturalScrollBox: {
    maxHeight: 152,
  },
  backFooterPinned: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
  },
  noteActionBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(30,41,59,0.45)',
  },
  noteActionText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dualSentenceBlock: {
    marginTop: 4,
  },
  sectionLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'none',
    marginBottom: 6,
  },
  dualSentenceText: {
    marginTop: 0,
    color: '#F8FAFC',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  cardActionRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
    paddingHorizontal: 1,
    paddingTop: 0,
    paddingBottom: 0,
  },
  actionIconBtn: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  actionIconBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  shareModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  shareModalSheet: {
    borderRadius: 18,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
  },
  shareModalTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  sharePreviewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sharePreviewCard: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
  },
  sharePreviewCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  sharePreviewMedia: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharePreviewMediaActive: {
    borderWidth: 1,
    borderColor: '#4EAFF4',
  },
  sharePreviewImage: {
    width: '100%',
    height: '100%',
  },
  sharePreviewFallback: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  sharePreviewMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  sharePreviewLabel: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  shareActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  shareCancelBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  shareCancelText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  shareConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#4EAFF4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  shareConfirmText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  shareActionBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  hiddenCombinedCaptureWrap: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    opacity: 0,
  },
  combinedCaptureSheet: {
    width: 360,
    backgroundColor: '#0F172A',
    padding: 8,
    gap: 8,
  },
  combinedCaptureHalf: {
    width: '100%',
    height: 540,
    borderRadius: 12,
  },
});

export default React.memo(CardDetailCarouselCardUI);
