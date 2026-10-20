import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  CARD_WIDTH,
  SPACING,
} from './cardCarouselConfig';

type Props = {
  isLightMode?: boolean;
  hasImage?: boolean;
};

export default function CardDetailSkeletonUI({
  isLightMode = false,
  hasImage = true,
}: Props) {
  const pulse = useSharedValue(0.4);

  React.useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.85, {
        duration: 850,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [pulse]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  // Dark values match the neutral card detail paper (#171E28 / #2B3544).
  const paperBg = isLightMode ? '#FFFFFF' : '#171E28';
  const paperBorder = isLightMode ? '#E2E8F0' : '#2B3544';
  const blockColor = isLightMode ? '#E2E8F0' : '#1F2834';
  const subBlockBorder = isLightMode ? '#F1F5F9' : '#2A374A';

  return (
    <View style={styles.stageSection}>
      <View style={styles.carouselStage}>
        <View style={styles.carouselCardContainer}>
          <View style={styles.detailCardShell}>
            <View
              style={[
                styles.detailCardScroll,
                styles.detailCardScrollContent,
                { flex: 1 },
              ]}
            >
              <View style={styles.cardRelativeFrame}>
                <View
                  style={[
                    styles.detailPaper,
                    { backgroundColor: paperBg, borderColor: paperBorder },
                  ]}
                >
                  {/* 1. 頂部滿版媒體/圖片骨架區塊 (對齊 heroMediaWrap) */}
                  {hasImage ? (
                    <View style={styles.heroMediaWrap}>
                      <Reanimated.View
                        style={[
                          styles.skeletonHeroMedia,
                          { backgroundColor: blockColor },
                          animatedPulseStyle,
                        ]}
                      />
                    </View>
                  ) : null}

                  {/* 2. 內容卡片容器 (對齊 referenceWordCard) */}
                  <View
                    style={[
                      styles.referenceWordCard,
                      { backgroundColor: paperBg },
                    ]}
                  >
                    {/* 2.1 單字標題 */}
                    <View style={styles.referenceRowTop}>
                      <Reanimated.View
                        style={[
                          styles.skeletonWord,
                          { backgroundColor: blockColor },
                          animatedPulseStyle,
                        ]}
                      />
                    </View>

                    {/* 2.1b 音標 + 喇叭 (對齊新版：喇叭在音標旁) */}
                    <View style={styles.ipaRow}>
                      <Reanimated.View
                        style={[
                          styles.skeletonIpaLine,
                          { backgroundColor: blockColor },
                          animatedPulseStyle,
                        ]}
                      />
                      <Reanimated.View
                        style={[
                          styles.skeletonSpeakerBtn,
                          { backgroundColor: blockColor },
                          animatedPulseStyle,
                        ]}
                      />
                    </View>

                    {/* 2.2 詞性膠囊 Badge + 釋義橫條 */}
                    <View style={styles.referenceMeaningRow}>
                      <Reanimated.View
                        style={[
                          styles.skeletonPosBadge,
                          { backgroundColor: blockColor },
                          animatedPulseStyle,
                        ]}
                      />
                      <Reanimated.View
                        style={[
                          styles.skeletonMeaningLine,
                          { backgroundColor: blockColor },
                          animatedPulseStyle,
                        ]}
                      />
                    </View>

                    {/* 2.3 分隔線 1 */}
                    <View
                      style={[
                        styles.referenceDivider,
                        { backgroundColor: subBlockBorder },
                      ]}
                    />

                    {/* 2.4 雙語例句區塊 */}
                    <View style={styles.skeletonSentenceBlock}>
                      <Reanimated.View
                        style={[
                          styles.skeletonTextLine,
                          { width: '92%', height: 16, backgroundColor: blockColor },
                          animatedPulseStyle,
                        ]}
                      />
                      <Reanimated.View
                        style={[
                          styles.skeletonTextLine,
                          {
                            width: '74%',
                            height: 16,
                            backgroundColor: blockColor,
                            marginTop: 10,
                          },
                          animatedPulseStyle,
                        ]}
                      />
                    </View>

                    {/* 2.5 分隔線 2 */}
                    <View
                      style={[
                        styles.referenceDivider,
                        {
                          backgroundColor: subBlockBorder,
                          marginTop: 10,
                          marginBottom: 8,
                        },
                      ]}
                    />

                    {/* 2.6 細節辨析/指標區塊 (Nuance Metrics & Insight) */}
                    <View style={styles.skeletonMetricsBlock}>
                      <Reanimated.View
                        style={[
                          styles.skeletonTextLine,
                          { width: '84%', height: 14, backgroundColor: blockColor },
                          animatedPulseStyle,
                        ]}
                      />
                      <Reanimated.View
                        style={[
                          styles.skeletonTextLine,
                          {
                            width: '58%',
                            height: 14,
                            backgroundColor: blockColor,
                            marginTop: 8,
                          },
                          animatedPulseStyle,
                        ]}
                      />
                    </View>

                    {/* 2.7 底部操作列：左「練發音」膠囊 + 右 3 顆圖示 (Share, Heart, Folder) */}
                    <View style={styles.cardActionRow}>
                      <Reanimated.View
                        style={[
                          styles.skeletonPracticePill,
                          { backgroundColor: blockColor },
                          animatedPulseStyle,
                        ]}
                      />
                      <View style={styles.secondaryActions}>
                        {[0, 1, 2].map((slotIdx) => (
                          <View key={slotIdx} style={styles.actionIconSlot}>
                            <Reanimated.View
                              style={[
                                styles.skeletonActionIcon,
                                { backgroundColor: blockColor },
                                animatedPulseStyle,
                              ]}
                            />
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stageSection: {
    flex: 1,
    paddingTop: 0,
    backgroundColor: 'transparent',
  },
  carouselStage: {
    flex: 1,
    minHeight: 620,
    marginTop: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    backgroundColor: 'transparent',
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
  detailCardScroll: {
    flex: 1,
  },
  detailCardScrollContent: {
    padding: 18,
    paddingTop: 100,
    paddingBottom: 32,
    paddingHorizontal: 18,
    gap: 18,
  },
  cardRelativeFrame: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  detailPaper: {
    flex: 1,
    width: '100%',
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    padding: 18,
    gap: 18,
    ...Platform.select({
      android: {
        elevation: 0,
      },
      default: {
        elevation: 20,
      },
    }),
  },
  heroMediaWrap: {
    marginTop: -18,
    marginHorizontal: -18,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  skeletonHeroMedia: {
    width: '100%',
    height: 250,
  },
  referenceWordCard: {
    marginHorizontal: -6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 0,
    flex: 1,
  },
  referenceRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  skeletonWord: {
    height: 38,
    width: '58%',
    borderRadius: 8,
  },
  ipaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -6,
    marginBottom: 10,
  },
  skeletonIpaLine: {
    width: 96,
    height: 16,
    borderRadius: 6,
  },
  skeletonSpeakerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  referenceMeaningRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skeletonPosBadge: {
    width: 46,
    height: 26,
    borderRadius: 999,
  },
  skeletonMeaningLine: {
    flex: 1,
    height: 22,
    borderRadius: 6,
  },
  referenceDivider: {
    marginTop: 16,
    marginBottom: 14,
    height: 1,
  },
  skeletonSentenceBlock: {
    paddingVertical: 2,
  },
  skeletonTextLine: {
    borderRadius: 6,
  },
  skeletonMetricsBlock: {
    paddingVertical: 2,
  },
  cardActionRow: {
    flexShrink: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingHorizontal: 2,
    paddingTop: 0,
    paddingBottom: 0,
    transform: [{ translateY: 8 }],
  },
  skeletonPracticePill: {
    width: 104,
    height: 42,
    borderRadius: 21,
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIconSlot: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonActionIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
