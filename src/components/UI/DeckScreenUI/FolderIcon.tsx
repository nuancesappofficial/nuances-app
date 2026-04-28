import React from 'react';
import { Image, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';

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
  coverImageUri?: string;
  compact?: boolean;
};

const COVER_RADIUS = 24;
const INNER_INSET_REGULAR = 6;
const INNER_INSET_COMPACT = 5;

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
  coverImageUri,
  compact = false,
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
          {coverImageUri ? <Image source={{ uri: coverImageUri }} style={styles.coverImage} resizeMode="cover" /> : null}
          <View style={[styles.iconInnerStroke, compact ? styles.iconInnerStrokeCompact : null]} />
          {!coverImageUri ? (
            <View style={[styles.symbolWrap, compact ? styles.symbolWrapCompact : null]}>
              {iconEmoji ? (
                <Text style={[styles.emojiIcon, compact ? styles.emojiIconCompact : null]}>{iconEmoji}</Text>
              ) : canUseSymbols ? (
                <SymbolView
                  name={theme.symbol}
                  size={compact ? 42 : 56}
                  tintColor="#F4F7FF"
                  type="monochrome"
                  style={{ width: compact ? 42 : 56, height: compact ? 42 : 56 }}
                  fallback={
                    <Text style={[styles.fallbackIcon, compact ? styles.fallbackIconCompact : null]}>
                      {theme.fallback}
                    </Text>
                  }
                />
              ) : (
                <Text style={[styles.fallbackIcon, compact ? styles.fallbackIconCompact : null]}>{theme.fallback}</Text>
              )}
            </View>
          ) : null}
          {compact ? (
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.16)', 'rgba(0,0,0,0.38)']}
              locations={[0, 0.55, 1]}
              style={styles.bottomShade}
            >
              <Text style={styles.bottomTitle} numberOfLines={1}>
                {title}
              </Text>
            </LinearGradient>
          ) : null}
        </View>
      </View>

      {!compact ? (
        <>
          <Text style={[styles.title, { color: accentColor }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle}>{countLabel}</Text>
        </>
      ) : null}
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
    borderRadius: COVER_RADIUS,
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
    overflow: 'hidden',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  iconInnerStroke: {
    position: 'absolute',
    top: INNER_INSET_REGULAR,
    left: INNER_INSET_REGULAR,
    right: INNER_INSET_REGULAR,
    bottom: INNER_INSET_REGULAR,
    borderRadius: COVER_RADIUS - INNER_INSET_REGULAR,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  iconInnerStrokeCompact: {
    top: INNER_INSET_COMPACT,
    left: INNER_INSET_COMPACT,
    right: INNER_INSET_COMPACT,
    bottom: INNER_INSET_COMPACT,
    borderRadius: COVER_RADIUS - INNER_INSET_COMPACT,
  },
  symbolWrap: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolWrapCompact: {
    width: 50,
    height: 50,
  },
  fallbackIcon: {
    color: '#F4F7FF',
    fontSize: 48,
    fontWeight: '600',
  },
  fallbackIconCompact: {
    fontSize: 34,
  },
  emojiIcon: {
    color: '#F4F7FF',
    fontSize: 48,
    lineHeight: 52,
  },
  emojiIconCompact: {
    fontSize: 34,
    lineHeight: 38,
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 44,
    paddingHorizontal: 8,
    justifyContent: 'flex-end',
    paddingBottom: 6,
    borderBottomLeftRadius: COVER_RADIUS,
    borderBottomRightRadius: COVER_RADIUS,
  },
  bottomTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
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
