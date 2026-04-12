import React from 'react';
import { Animated, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
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
}: Props) {
  const toChinesePartOfSpeech = React.useCallback((value: string | undefined | null): string => {
    const raw = (value || '').trim();
    if (!raw) return '詞性未標註';
    const normalized = raw.toLowerCase().replace(/\./g, '');

    const map: Record<string, string> = {
      n: '名詞',
      noun: '名詞',
      v: '動詞',
      verb: '動詞',
      vt: '及物動詞',
      vi: '不及物動詞',
      adj: '形容詞',
      adjective: '形容詞',
      adv: '副詞',
      adverb: '副詞',
      prep: '介系詞',
      preposition: '介系詞',
      pron: '代名詞',
      pronoun: '代名詞',
      conj: '連接詞',
      conjunction: '連接詞',
      interj: '感嘆詞',
      interjection: '感嘆詞',
      det: '限定詞',
      article: '冠詞',
      phrase: '片語',
      idiom: '慣用語',
      aux: '助動詞',
      modal: '情態動詞',
      num: '數詞',
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
  const translationText = item.contextualExplanation || item.definition || '-';
  const collocationItems = React.useMemo(
    () =>
      (item.frequentCollocations || '')
        .split(/[\n,;]+/)
        .map((phrase) => phrase.trim())
        .filter(Boolean)
        .slice(0, 4),
    [item.frequentCollocations]
  );
  const apiExampleSentence = (item.originalSentence || '').trim() || collocationItems[0] || '-';
  const weightedWordLength = Array.from(itemWord.trim()).reduce((total, ch) => {
    const isCjk = /[\u4E00-\u9FFF]/.test(ch);
    return total + (isCjk ? 1.7 : 1);
  }, 0);
  const referenceWordFontSize =
    (weightedWordLength > 18 ? 30 : weightedWordLength > 15 ? 34 : weightedWordLength > 12 ? 40 : 52) *
    cardDetailFontScale;
  const referenceWordLineHeight = Math.round(referenceWordFontSize * 1.08);
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
            <View style={styles.heroMediaWrap}>
              {itemImageUri ? (
                <TouchableOpacity
                  activeOpacity={0.95}
                  onPress={() => {
                    onOpenFullscreen(index);
                  }}
                >
                  <Image
                    source={{ uri: itemImageUri }}
                    style={styles.heroMedia}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.heroMediaFallback}>
                  <Text style={styles.heroMediaFallbackWord}>{itemWord}</Text>
                </View>
              )}
            </View>

            <View
              style={[
                styles.referenceWordCard,
                {
                  marginHorizontal: -18 + textBlockHorizontalInset,
                  paddingHorizontal: textBlockHorizontalInset,
                },
              ]}
            >
              <View style={[styles.referenceRowTop, { position: 'relative' }]}>
                <View style={[styles.referenceWordLeft, { minWidth: 0, flexShrink: 1 }]}>
                  <Text
                    style={[
                      styles.referenceWord,
                      { fontSize: referenceWordFontSize, lineHeight: referenceWordLineHeight },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.42}
                  >
                    {itemWord}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.referencePlayBtn,
                  {
                    position: 'absolute',
                    right: textBlockHorizontalInset + 2,
                    top: 12,
                    width: 28,
                    height: 28,
                    borderRadius: 0,
                    backgroundColor: 'transparent',
                  },
                ]}
                onPress={() => onPlayCard(itemPronunciationText, isActiveCard, index)}
              >
                <Ionicons
                  name={isActiveCard && isPlaying ? 'volume-high' : 'volume-medium-outline'}
                  size={22}
                  color="#8E939D"
                />
              </TouchableOpacity>

              <View style={styles.referenceMeaningRow}>
                <View style={styles.referencePosBadge}>
                  <Text style={styles.referencePosText}>{itemCaption}</Text>
                </View>
                <Text style={styles.referenceMeaning}>{definitionText}</Text>
              </View>

              <View style={styles.referenceDivider} />

              <Text style={styles.referenceTranslation}>{translationText}</Text>

              <View style={styles.referenceSubSection}>
                <Text style={styles.referenceSubLabel}>AI 造句</Text>
                <View style={styles.referenceRowTop}>
                  <Text style={styles.referenceExample}>"{apiExampleSentence}"</Text>
                  <TouchableOpacity
                    style={[
                      styles.referencePlayBtn,
                      {
                        width: 28,
                        height: 28,
                        borderRadius: 0,
                        backgroundColor: 'transparent',
                        marginTop: 4,
                      },
                    ]}
                    onPress={() => onPlayCard(apiExampleSentence, isActiveCard, index)}
                  >
                    <Ionicons name="volume-medium-outline" size={22} color="#8E939D" />
                  </TouchableOpacity>
                </View>
              </View>

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

              <View style={styles.referenceFooterRow}>
                <Text style={styles.referenceFooterText}>{itemDisplayDate || '部分6・基礎'}</Text>
                <View style={styles.referenceActionBadge}>
                  <Text style={styles.referenceActionText}>例句+</Text>
                </View>
              </View>
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
          </View>
        </ScrollView>
      </View>
    </Reanimated.View>
  );
}

export default React.memo(CardDetailCarouselCardUI);
