import React from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import PronunciationCoachUI from './PronunciationCoachUI';

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
  onOpenFullscreen: (index: number) => void;
  cardDetailFontScale: number;
  snapInterval: number;
  sidePeekShift: number;
  sanitizePronunciationText: (text: string | undefined | null) => string;
  formatCardDate: (input: Date | string | undefined | null) => string;
  styles: any;
  isFavorite: boolean;
  onOpenAlbumSheet: () => void;
  onToggleFavorite: () => void;
};

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
  onOpenAlbumSheet,
  onToggleFavorite,
}: Props) {
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
  const translationText = React.useMemo(() => {
    const raw = (item.contextualExplanation || item.definition || '-').trim();
    if (!raw || raw === '-') return '-';
    const quotedWord = `「${itemWord}」`;
    const escaped = itemWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp(`\\b${escaped}\\b`, 'ig');
    const replaced = raw.replace(reg, quotedWord);
    return replaced.includes(quotedWord) ? replaced : `${quotedWord}：${replaced}`;
  }, [item.contextualExplanation, item.definition, itemWord]);
  const collocationItems = React.useMemo(
    () =>
      (item.frequentCollocations || '')
        .split(/[\n,;]+/)
        .map((phrase) => phrase.trim())
        .filter(Boolean)
        .slice(0, 4),
    [item.frequentCollocations]
  );
  const apiExampleSentence = React.useMemo(() => {
    const firstCollocation = collocationItems[0];
    if (!firstCollocation) return sourceSentence;
    if (!sourceSentence || sourceSentence === '-') {
      return `Try using "${firstCollocation}" in a sentence today.`;
    }
    const quoted = `"${firstCollocation}"`;
    return `A natural example using ${quoted} is: "${sourceSentence}"`;
  }, [collocationItems, sourceSentence]);
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
            <Reanimated.View style={[styles.detailPaper, frontAnimatedStyle, { flex: 1 }]}>
              <View style={styles.heroMediaWrap}>
                {itemImageUri ? (
                  <TouchableOpacity activeOpacity={0.95} onPress={() => onOpenFullscreen(index)}>
                    <Image source={{ uri: itemImageUri }} style={styles.heroMedia} resizeMode="cover" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.heroMediaFallback}>
                    <Text style={styles.heroMediaFallbackWord}>{itemWord}</Text>
                  </View>
                )}
              </View>

              <View style={[styles.referenceWordCard, { marginHorizontal: -18 + textBlockHorizontalInset, paddingHorizontal: textBlockHorizontalInset, flex: 1 }]}>
                {/* 1. 單字本體 */}
                <View style={[styles.referenceRowTop, { position: 'relative' }]}>
                  <View style={[styles.referenceWordLeft, { minWidth: 0, flexShrink: 1 }]}>
                    <Text
                      style={[styles.referenceWord, { fontSize: referenceWordFontSize, lineHeight: referenceWordLineHeight }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.42}
                    >
                      {itemWord}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.referencePlayBtn, { position: 'absolute', right: textBlockHorizontalInset + 2, top: 12, width: 28, height: 28, borderRadius: 0, backgroundColor: 'transparent' }]}
                    onPress={() => onPlayCard(itemPronunciationText, isActiveCard, index)}
                  >
                    <Ionicons name={isActiveCard && isPlaying ? 'volume-high' : 'volume-medium-outline'} size={22} color="#8E939D" />
                  </TouchableOpacity>
                </View>

                {/* 2. 詞性 & 3. 翻譯 */}
                <View style={styles.referenceMeaningRow}>
                  <View style={styles.referencePosBadge}>
                    <Text style={styles.referencePosText}>{itemCaption}</Text>
                  </View>
                  <Text style={styles.referenceMeaning}>{definitionText}</Text>
                </View>

                <View style={styles.referenceDivider} />

                {/* 4. 中文解釋句 */}
                <Text style={styles.referenceTranslation}>{translationText}</Text>

                {/* ----- 第一頁底部操作列 ----- */}
                <View style={localStyles.cardActionRow}>
                  <TouchableOpacity style={[localStyles.actionBtn, localStyles.actionBtnFolder]} onPress={onOpenAlbumSheet}>
                    <Ionicons name="folder-outline" size={20} color="#FFFFFF" />
                    <Text style={[localStyles.actionBtnText, localStyles.actionBtnTextOnColor]}>分類</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[localStyles.actionBtn, localStyles.actionBtnFavorite]} 
                    onPress={onToggleFavorite}
                  >
                    <Ionicons 
                      name={isFavorite ? 'star' : 'star-outline'} 
                      size={20} 
                      color="#F5A623"
                    />
                    <Text style={localStyles.actionBtnTextStar}>
                      收藏
                    </Text>
                  </TouchableOpacity>
                </View>
                {/* ----------------------------- */}

              </View>
            </Reanimated.View>

            {/* ========== 卡片背面 (BACK FACE) ========== */}
            {/* 內容：Collocation、AI造句、Pronunciation coach、底部資訊 */}
            <Reanimated.View style={[styles.detailPaper, backAnimatedStyle]}>
              <View style={[styles.referenceWordCard, { marginHorizontal: -18 + textBlockHorizontalInset, paddingHorizontal: textBlockHorizontalInset, flex: 1, paddingTop: 16 }]}>
                
                {/* 1. Collocation */}
                {collocationItems.length > 0 ? (
                  <View style={styles.referenceCollocationSection}>
                    <Text style={styles.referenceCollocationTitle}>COLLOCATION</Text>
                    {collocationItems.map((phrase, idx) => (
                      <Text key={`${item.id}-collocation-${idx}`} style={styles.referenceCollocationItem}>
                        {`• ${phrase}`}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {/* 2. AI 造句 */}
                <View style={[styles.referenceSubSection, { marginTop: collocationItems.length > 0 ? 0 : 12 }]}>
                  <Text style={styles.referenceSubLabel}>AI 造句</Text>
                  <View style={styles.referenceRowTop}>
                    <Text style={styles.referenceExample}>"{apiExampleSentence}"</Text>
                    <TouchableOpacity
                      style={[styles.referencePlayBtn, { width: 28, height: 28, borderRadius: 0, backgroundColor: 'transparent', marginTop: 4 }]}
                      onPress={() => onPlayCard(apiExampleSentence, isActiveCard, index)}
                    >
                      <Ionicons name="volume-medium-outline" size={22} color="#8E939D" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 3. Pronunciation Coach */}
                <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 16 }}>
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
                </View>

                {/* 底部 Footer */}
                <View style={[styles.referenceFooterRow, { marginTop: 'auto' }]}>
                  <Text style={styles.referenceFooterText}>{itemDisplayDate || '部分6・基礎'}</Text>
                  <View style={styles.referenceActionBadge}>
                    <Text style={styles.referenceActionText}>例句+</Text>
                  </View>
                </View>

              </View>
            </Reanimated.View>

          </View>
        </View>
      </Pressable>
    </Reanimated.View>
  );
}

const localStyles = StyleSheet.create({
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 'auto',
    paddingTop: 16,
    paddingBottom: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#F2F4F7',
    borderRadius: 20,
    gap: 6,
  },
  actionBtnFolder: {
    backgroundColor: '#8B5E3C',
  },
  actionBtnFavorite: {
    backgroundColor: '#FFF7DB',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
  },
  actionBtnTextOnColor: {
    color: '#FFFFFF',
  },
  actionBtnTextStar: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F5A623',
  },
});

export default React.memo(CardDetailCarouselCardUI);
