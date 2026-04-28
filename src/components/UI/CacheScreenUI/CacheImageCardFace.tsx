import React from 'react';
import { Image, StyleSheet, Text, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

type Props = {
  imageUri: string;
  fallbackText?: string;
  detectedPreview?: string;
  onImageError?: () => void;
};

export default function CacheImageCardFace({
  imageUri,
  fallbackText = 'Image unavailable',
  detectedPreview,
  onImageError,
}: Props) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [imageUri]);

  if (failed) {
    return (
      <View style={styles.fallbackCard}>
        <Text style={styles.fallbackLabel}>IMAGE CACHE</Text>
        <Text style={styles.fallbackText} numberOfLines={4}>
          {fallbackText}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.imageWrap}>
      <Image
        source={{ uri: imageUri }}
        style={styles.image}
        onError={() => {
          setFailed(true);
          onImageError?.();
        }}
      />
      {detectedPreview ? (
        <View pointerEvents="none" style={styles.detectedWrap}>
        {/* 加強 intensity，並根據平台微調 */}
        <BlurView 
          intensity={Platform.OS === 'ios' ? 50 : 80} 
          tint="light" 
          style={StyleSheet.absoluteFill} 
        />
        <View style={styles.detectedOverlay} />
        <Text style={styles.detectedText} numberOfLines={1}>
          {detectedPreview}
        </Text>
      </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    flex: 1,
    zIndex: 2,
  },
  image: {
    flex: 1,
    resizeMode: 'cover',
  },
  detectedWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 8, // 讓預覽條稍微懸浮在底部，符合參考圖質感
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 10, // 確保層級在最上
    // 增加一個極細的白色邊框，強化玻璃邊緣感
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  detectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  detectedText: {
    // 文字依然保持白色，但稍微增加一點陰影確保在淺色圖片上也能看清
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  fallbackCard: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  fallbackLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  fallbackText: {
    color: '#101010',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
  },
});
