import React from 'react';
import { Platform, StyleSheet, Text, View, useColorScheme, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { resolveThemeColors } from '../../../theme/colors';

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
  compact?: boolean;
};

const COVER_RADIUS = 16;

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
  compact = false,
}: FolderIconProps) {
  const colorScheme = useColorScheme();
  const palette = resolveThemeColors(colorScheme);
  void latestCards;
  const coverTheme = getCoverTheme(title);
  const isLight = colorScheme === 'light';
  const frontColor = coverColor || '#1E293B';
  const iconColor = isLight ? '#4EAFF4' : palette.textOnContainer;
  const bottomTitleColor = palette.albumCoverText;
  const titleColor = accentColor || palette.textOnContainer;
  const subtitleColor = isLight ? '#64748B' : 'rgba(248,250,252,0.76)';
  const canUseSymbols = canUseSFSymbolsOnDevice();

  const countLabel = `${wordCount} ${wordCount === 1 ? 'Pin' : 'Pins'}`;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconCoverWrap}>
        <View style={[styles.iconLayer, styles.iconLayerFront, { backgroundColor: frontColor }]}>
          <View style={[styles.symbolWrap, compact ? styles.symbolWrapCompact : null]}>
            {iconEmoji ? (
              <Text style={[styles.emojiIcon, compact ? styles.emojiIconCompact : null, { color: iconColor }]}>
                {iconEmoji}
              </Text>
            ) : canUseSymbols ? (
              <SymbolView
                name={coverTheme.symbol}
                size={compact ? 42 : 56}
                tintColor={iconColor}
                type="monochrome"
                style={{ width: compact ? 42 : 56, height: compact ? 42 : 56 }}
                fallback={
                  <Text style={[styles.fallbackIcon, compact ? styles.fallbackIconCompact : null, { color: iconColor }]}>
                    {coverTheme.fallback}
                  </Text>
                }
              />
            ) : (
              <Text style={[styles.fallbackIcon, compact ? styles.fallbackIconCompact : null, { color: iconColor }]}>
                {coverTheme.fallback}
              </Text>
            )}
          </View>
          {compact ? (
            <LinearGradient
              colors={[palette.albumCoverShadeStart, palette.albumCoverShadeMid, palette.albumCoverShadeEnd]}
              locations={[0, 0.58, 1]}
              style={styles.bottomShade}
            >
              <Text style={[styles.bottomTitle, { color: bottomTitleColor }]} numberOfLines={1}>
                {title}
              </Text>
            </LinearGradient>
          ) : null}
        </View>
      </View>

      {!compact ? (
        <>
          <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: subtitleColor }]}>{countLabel}</Text>
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
    justifyContent: 'flex-start',
    overflow: 'hidden',
    paddingTop: 22,
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
    fontSize: 48,
    fontWeight: '600',
  },
  fallbackIconCompact: {
    fontSize: 34,
  },
  emojiIcon: {
    color: '#F8FAFC',
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
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  title: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'left',
    color: '#F8FAFC',
  },
  subtitle: {
    marginTop: 4,
    color: 'rgba(248,250,252,0.76)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'left',
  },
});
