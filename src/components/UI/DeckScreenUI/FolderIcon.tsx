import React from 'react';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';

type PreviewCard = {
  imageUrl?: string;
  cardTypeText: string;
  previewText?: string;
};

type FolderIconProps = {
  style?: ViewStyle;
  title?: string;
  wordCount?: number;
  latestCards?: PreviewCard[];
  accentColor?: string;
  iconEmoji?: string;
  coverColor?: string;
};

function canUseSFSymbolsOnDevice() {
  if (Platform.OS !== 'ios') return false;
  const version =
    typeof Platform.Version === 'string'
      ? parseInt(Platform.Version.split('.')[0] || '0', 10)
      : Platform.Version;
  return Number.isFinite(version) && version >= 17;
}

function getCoverTheme(title: string) {
  const text = title.toLowerCase();
  if (text.includes('made') || text.includes('all')) {
    return { front: '#3688E5', back1: '#236BBE', back2: '#174E96', symbol: 'sparkles' as const, fallback: '✦' };
  }
  if (text.includes('saved') || text.includes('bookmark')) {
    return { front: '#9A63CC', back1: '#7A44B5', back2: '#5F2F95', symbol: 'bookmark' as const, fallback: '⌑' };
  }
  if (text.includes('liked') || text.includes('love')) {
    return { front: '#D15463', back1: '#B73A49', back2: '#932736', symbol: 'heart' as const, fallback: '♡' };
  }
  if (text.includes('review')) {
    return {
      front: '#42A878',
      back1: '#2F865F',
      back2: '#22654A',
      symbol: 'clock.arrow.circlepath' as const,
      fallback: '↺',
    };
  }
  return { front: '#4A67D8', back1: '#364FB0', back2: '#273B8A', symbol: 'folder' as const, fallback: '⌂' };
}

export function FolderIcon({
  style,
  title = '',
  wordCount = 0,
  latestCards = [],
  accentColor = '#FFFFFF',
  iconEmoji,
  coverColor,
}: FolderIconProps) {
  void latestCards;
  const theme = getCoverTheme(title);
  const frontColor = coverColor || theme.front;
  const backColor1 = coverColor ? `${coverColor}D9` : theme.back1;
  const backColor2 = coverColor ? `${coverColor}B8` : theme.back2;
  const canUseSymbols = canUseSFSymbolsOnDevice();

  const countLabel = `${wordCount} ${wordCount === 1 ? 'Pin' : 'Pins'}`;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconCoverWrap}>
        <View style={[styles.iconLayer, styles.iconLayerBack2, { backgroundColor: backColor2 }]} />
        <View style={[styles.iconLayer, styles.iconLayerBack1, { backgroundColor: backColor1 }]} />
        <View style={[styles.iconLayer, styles.iconLayerFront, { backgroundColor: frontColor }]}>
          <View style={styles.iconInnerStroke} />
          <View style={styles.symbolWrap}>
            {iconEmoji ? (
              <Text style={styles.emojiIcon}>{iconEmoji}</Text>
            ) : canUseSymbols ? (
              <SymbolView
                name={theme.symbol}
                size={56}
                tintColor="#F4F7FF"
                type="monochrome"
                style={{ width: 56, height: 56 }}
                fallback={<Text style={styles.fallbackIcon}>{theme.fallback}</Text>}
              />
            ) : (
              <Text style={styles.fallbackIcon}>{theme.fallback}</Text>
            )}
          </View>
        </View>
      </View>

      <Text style={[styles.title, { color: accentColor }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.subtitle}>{countLabel}</Text>
    </View>
  );
}

export default FolderIcon;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  iconCoverWrap: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
  },
  iconLayer: {
    position: 'absolute',
    borderRadius: 24,
  },
  iconLayerBack2: {
    top: 8,
    left: 12,
    right: -2,
    bottom: -2,
    opacity: 0.95,
  },
  iconLayerBack1: {
    top: 4,
    left: 8,
    right: 0,
    bottom: 0,
    opacity: 0.98,
  },
  iconLayerFront: {
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInnerStroke: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  symbolWrap: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    color: '#F4F7FF',
    fontSize: 48,
    fontWeight: '600',
  },
  emojiIcon: {
    color: '#F4F7FF',
    fontSize: 48,
    lineHeight: 52,
  },
  title: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'left',
  },
  subtitle: {
    marginTop: 4,
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'left',
  },
});
