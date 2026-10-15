import React from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  CARD_WIDTH,
  SIDE_PADDING,
  SPACING,
} from './cardCarouselConfig';

type Props = {
  isLightMode?: boolean;
};

export default function CardDetailSkeletonUI({ isLightMode = false }: Props) {
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

  const paperBg = isLightMode ? '#FFFFFF' : '#1E293B';
  const paperBorder = isLightMode ? '#E2E8F0' : '#334155';
  const blockColor = isLightMode ? '#E2E8F0' : '#334155';
  const subBlockBg = isLightMode ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)';
  const subBlockBorder = isLightMode ? '#F1F5F9' : '#2A374A';

  return (
    <View style={styles.stageSection}>
      <View style={styles.carouselStage}>
        <View style={styles.cardWrapper}>
          <View
            style={[
              styles.detailPaper,
              { backgroundColor: paperBg, borderColor: paperBorder },
            ]}
          >
            {/* 頂部媒體/圖片骨架區塊 */}
            <Reanimated.View
              style={[
                styles.skeletonMedia,
                { backgroundColor: blockColor },
                animatedPulseStyle,
              ]}
            />

            {/* 內容區塊 */}
            <View style={styles.contentWrap}>
              {/* 單字標題骨架 */}
              <Reanimated.View
                style={[
                  styles.skeletonWord,
                  { backgroundColor: blockColor },
                  animatedPulseStyle,
                ]}
              />

              {/* 詞性與音標 Pills */}
              <View style={styles.pillRow}>
                <Reanimated.View
                  style={[
                    styles.skeletonPill,
                    { width: 72, backgroundColor: blockColor },
                    animatedPulseStyle,
                  ]}
                />
                <Reanimated.View
                  style={[
                    styles.skeletonPill,
                    { width: 54, backgroundColor: blockColor },
                    animatedPulseStyle,
                  ]}
                />
              </View>

              {/* 釋義/細節條目 */}
              <Reanimated.View
                style={[
                  styles.skeletonTextLine,
                  { width: '92%', backgroundColor: blockColor },
                  animatedPulseStyle,
                ]}
              />
              <Reanimated.View
                style={[
                  styles.skeletonTextLine,
                  { width: '70%', backgroundColor: blockColor },
                  animatedPulseStyle,
                ]}
              />

              {/* 例句區塊容器 */}
              <View
                style={[
                  styles.sentenceBox,
                  { backgroundColor: subBlockBg, borderColor: subBlockBorder },
                ]}
              >
                <Reanimated.View
                  style={[
                    styles.skeletonTextLine,
                    { width: '85%', height: 13, backgroundColor: blockColor },
                    animatedPulseStyle,
                  ]}
                />
                <Reanimated.View
                  style={[
                    styles.skeletonTextLine,
                    { width: '55%', height: 13, backgroundColor: blockColor, marginTop: 8 },
                    animatedPulseStyle,
                  ]}
                />
              </View>

              {/* 底部功能鈕骨架 */}
              <View style={styles.bottomRow}>
                <Reanimated.View
                  style={[
                    styles.skeletonCircle,
                    { backgroundColor: blockColor },
                    animatedPulseStyle,
                  ]}
                />
                <Reanimated.View
                  style={[
                    styles.skeletonPill,
                    { width: 90, height: 32, backgroundColor: blockColor },
                    animatedPulseStyle,
                  ]}
                />
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
  cardWrapper: {
    width: CARD_WIDTH,
    marginHorizontal: SPACING / 2,
    height: '100%',
    paddingVertical: 4,
    paddingTop: 100,
    paddingBottom: 32,
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
    elevation: 8,
  },
  skeletonMedia: {
    width: '92%',
    height: 180,
    borderRadius: 20,
    marginHorizontal: '4%',
    marginTop: 14,
    marginBottom: 6,
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
  },
  skeletonWord: {
    height: 32,
    width: '58%',
    borderRadius: 8,
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  skeletonPill: {
    height: 22,
    borderRadius: 11,
  },
  skeletonTextLine: {
    height: 15,
    borderRadius: 6,
    marginBottom: 8,
  },
  sentenceBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 14,
  },
  skeletonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
});
