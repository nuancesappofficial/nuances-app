import React from 'react';
import { View, Text, StyleSheet, UIManager, type ViewStyle } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';

const HAS_MASKED_VIEW = Boolean(
  typeof UIManager.getViewManagerConfig === 'function' &&
    UIManager.getViewManagerConfig('RNCMaskedView')
);

// MARK: - 輔助型別定義
type FolderIconProps = {
  scale?: number;
  style?: ViewStyle;
  title?: string;
  wordCount?: number;
  accentColor?: string;
  cardLabels?: string[];
  // 1. 背景顏色
  bgGradientStart?: string;
  bgGradientEnd?: string;
  // 2. 文件顏色
  paperBackground?: string;
  paperLineColor?: string;
  // 3. 玻璃前蓋顏色與模糊設定
  glassBlurTint?: 'light' | 'dark' | 'default';
  glassOverlayStart?: string; // 新增：玻璃上方漸層色
  glassOverlayEnd?: string;   // 新增：玻璃下方漸層色
  glassEdgeStart?: string;
  glassEdgeEnd?: string;
};

// MARK: - 1. 背景圓角矩形
const BackgroundFolder = ({ startColor, endColor }: { startColor: string; endColor: string }) => (
  <LinearGradient
    colors={[startColor, endColor]}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={styles.backgroundFolder}
  />
);

// MARK: - 2. 三張白紙圖示 (中層)
const PaperStack = ({ bgColor, lineColor }: { bgColor: string; lineColor: string }) => {
  const renderPaper = (rotation: number, offsetX: number, offsetY: number, lines: number[]) => (
    <View
      style={[
        styles.paper,
        {
          backgroundColor: bgColor,
          transform: [{ rotate: `${rotation}deg` }, { translateX: offsetX }, { translateY: offsetY }],
        },
      ]}
    >
      {lines.map((width, idx) => (
        <View key={idx} style={[styles.paperLine, { width, backgroundColor: lineColor }]} />
      ))}
    </View>
  );

  return (
    <View style={styles.paperContainer}>
      {renderPaper(12, 35, 10, [70, 60, 80, 60, 50, 80])}
      {renderPaper(0, 0, -5, [80, 90, 70, 60, 80, 70])}
      {renderPaper(-12, -35, 15, [60, 80, 70, 50, 70, 60])}
    </View>
  );
};

// MARK: - SVG 路徑生成器 (精確計算 V 型張開效果)
const getFrontCoverPath = (w: number, h: number) => {
  const r = 16; 
  // 底部向內縮的寬度，w=320, 左右各縮 20, 底部就是 280 (完美對齊背景矩形)
  const inset = 20; 
  const tabW = w * 0.42; 
  const dropY = h * 0.25; 

  return `
    M ${r} 0
    L ${tabW - r} 0
    C ${tabW + 5} 0, ${tabW + 10} ${dropY}, ${tabW + 25} ${dropY}
    L ${w - r} ${dropY}
    A ${r} ${r} 0 0 1 ${w} ${dropY + r}
    L ${w - inset + r * 0.2} ${h - r} 
    A ${r} ${r} 0 0 1 ${w - inset - r} ${h}
    L ${inset + r} ${h}
    A ${r} ${r} 0 0 1 ${inset - r * 0.2} ${h - r}
    L 0 ${r}
    A ${r} ${r} 0 0 1 ${r} 0
    Z
  `;
};

// MARK: - 3. 半透明前蓋 (表層)
const GlassFront = ({ 
  blurTint, 
  overlayStart, 
  overlayEnd, 
  edgeStart, 
  edgeEnd 
}: { 
  blurTint: 'light' | 'dark' | 'default';
  overlayStart: string;
  overlayEnd: string;
  edgeStart: string;
  edgeEnd: string;
}) => {
  // 將寬度設定為 320，以配合 V 型張開的外闊幅度
  const frontWidth = 320; 
  const frontHeight = 165;
  const pathData = getFrontCoverPath(frontWidth, frontHeight);

  return (
    <View style={styles.glassFrontContainer}>
      {HAS_MASKED_VIEW ? (
        <MaskedView
          style={{ width: frontWidth, height: frontHeight }}
          maskElement={
            <Svg width={frontWidth} height={frontHeight}>
              <Path d={pathData} fill="black" />
            </Svg>
          }
        >
          <BlurView intensity={60} tint={blurTint} style={StyleSheet.absoluteFill} />
          {/* 新增：使用漸層色來模擬玻璃上方透澈、下方渾厚的質感 */}
          <LinearGradient
            colors={[overlayStart, overlayEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
      ) : (
        <View style={styles.maskedFallback}>
          <BlurView intensity={60} tint={blurTint} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={[overlayStart, overlayEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      <Svg width={frontWidth} height={frontHeight} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <SvgLinearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={edgeStart} />
            <Stop offset="0.3" stopColor="transparent" />
            <Stop offset="1" stopColor={edgeEnd} />
          </SvgLinearGradient>
        </Defs>
        <Path d={pathData} fill="none" stroke="url(#glassEdge)" strokeWidth={1.5} />
      </Svg>
    </View>
  );
};

// MARK: - 主匯出組件
export function FolderIcon({
  scale = 0.4,
  style,
  title = '',
  wordCount = 0,
  accentColor = '#00ffff',
  bgGradientStart = '#3A3A3C',
  bgGradientEnd = '#1C1C1E',
  paperBackground = '#F8F9FA',
  paperLineColor = '#E5E5EA',
  glassBlurTint = 'light',
  // 使用白色漸層：上方極淡 (0.05)，下方稍微厚實 (0.35)，如果您用深色模式，可改為深色 rgba
  glassOverlayStart = 'rgba(255, 255, 255, 0.05)', 
  glassOverlayEnd = 'rgba(255, 255, 255, 0.35)',
  glassEdgeStart = 'rgba(255, 255, 255, 0.7)',
  glassEdgeEnd = 'rgba(255, 255, 255, 0.2)',
}: FolderIconProps) {
  const baseWidth = 320;
  const baseHeight = 240;
  const wordsLabel = `${wordCount} ${wordCount === 1 ? 'word' : 'words'}`;

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconBox, { width: baseWidth * scale, height: baseHeight * scale }]}>
        <View style={[styles.iconWrapper, { transform: [{ scale }] }]}>
          <BackgroundFolder startColor={bgGradientStart} endColor={bgGradientEnd} />
          <PaperStack bgColor={paperBackground} lineColor={paperLineColor} />
          <GlassFront
            blurTint={glassBlurTint}
            overlayStart={glassOverlayStart}
            overlayEnd={glassOverlayEnd}
            edgeStart={glassEdgeStart}
            edgeEnd={glassEdgeEnd}
          />
        </View>
      </View>
      {!!title && (
        <Text style={[styles.albumTitle, { color: accentColor }]} numberOfLines={1}>
          {title}
        </Text>
      )}
      <Text style={styles.wordCount}>{wordsLabel}</Text>
    </View>
  );
}

export default FolderIcon;

// MARK: - 靜態樣式表
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 320,
    height: 240,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  albumTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  wordCount: {
    marginTop: 4,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  backgroundFolder: {
    width: 280,
    height: 200,
    borderRadius: 24,
    position: 'absolute',
    bottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  paperContainer: {
    position: 'absolute',
    // 稍微調整高度，讓紙張和前蓋的比例更順眼
    bottom: 90, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  paper: {
    position: 'absolute',
    width: 160,
    height: 200,
    borderRadius: 12,
    paddingTop: 24,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  paperLine: {
    height: 6,
    borderRadius: 3,
    marginBottom: 12,
  },
  glassFrontContainer: {
    width: 320,
    height: 165,
    position: 'absolute',
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  maskedFallback: {
    width: 320,
    height: 165,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
