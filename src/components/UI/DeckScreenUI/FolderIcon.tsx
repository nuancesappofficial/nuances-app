import React from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';

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
};

function PreviewPane({ card }: { card: PreviewCard }) {
  const [imageLoadFailed, setImageLoadFailed] = React.useState(false);
  React.useEffect(() => {
    setImageLoadFailed(false);
  }, [card.imageUrl]);

  if (card.imageUrl && !imageLoadFailed) {
    return (
      <Image
        key={card.imageUrl}
        source={{ uri: card.imageUrl }}
        style={styles.previewImage}
        resizeMode="cover"
        onError={(event) => {
          console.warn('[FolderIcon] preview image load failed', {
            imageUrl: card.imageUrl,
            error: event.nativeEvent?.error,
          });
          setImageLoadFailed(true);
        }}
      />
    );
  }

  return (
    <View style={styles.previewFallback}>
      <Text style={styles.previewText} numberOfLines={3}>
        {card.previewText || card.cardTypeText || 'Card'}
      </Text>
    </View>
  );
}

export function FolderIcon({
  style,
  title = '',
  wordCount = 0,
  latestCards = [],
  accentColor = '#FFFFFF',
}: FolderIconProps) {
  const cards = latestCards.slice(0, 3);
  const cardCount = cards.length;
  const first = cards[0];
  const second = cards[1];
  const third = cards[2];

  const countLabel = `${wordCount} ${wordCount === 1 ? 'Pin' : 'Pins'}`;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.mosaicGrid}>
        {cardCount <= 1 ? (
          <View style={styles.fullPane}>
            {first ? <PreviewPane card={first} /> : <View style={styles.emptyPane} />}
          </View>
        ) : cardCount === 2 ? (
          <>
            <View style={styles.leftPane}>
              <PreviewPane card={first} />
            </View>
            <View style={styles.rightHalfPane}>
              <PreviewPane card={second} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.leftPane}>
              <PreviewPane card={first} />
            </View>

            <View style={styles.rightPane}>
              <View style={styles.rightTopPane}>
                <PreviewPane card={second} />
              </View>

              <View style={styles.rightBottomPane}>
                <PreviewPane card={third} />
              </View>
            </View>
          </>
        )}
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
  mosaicGrid: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#13161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
  },
  fullPane: {
    width: '100%',
    height: '100%',
  },
  leftPane: {
    width: '66.6667%',
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.14)',
  },
  rightHalfPane: {
    width: '33.3333%',
    height: '100%',
  },
  rightPane: {
    width: '33.3333%',
    height: '100%',
  },
  rightTopPane: {
    height: '50%',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.14)',
  },
  rightBottomPane: {
    height: '50%',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewFallback: {
    flex: 1,
    backgroundColor: '#1A1F2A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  emptyPane: {
    flex: 1,
    backgroundColor: '#1A1F2A',
  },
  previewText: {
    color: '#DDE1EA',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
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
