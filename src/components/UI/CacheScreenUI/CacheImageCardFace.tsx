import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  imageUri: string;
  fallbackText?: string;
};

export default function CacheImageCardFace({ imageUri, fallbackText = 'Image unavailable' }: Props) {
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

  return <Image source={{ uri: imageUri }} style={styles.image} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  image: {
    flex: 1,
    resizeMode: 'cover',
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
