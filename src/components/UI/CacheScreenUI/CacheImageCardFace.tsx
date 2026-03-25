import React from 'react';
import { Image, StyleSheet } from 'react-native';

type Props = {
  imageUri: string;
};

export default function CacheImageCardFace({ imageUri }: Props) {
  return <Image source={{ uri: imageUri }} style={styles.image} />;
}

const styles = StyleSheet.create({
  image: {
    flex: 1,
    resizeMode: 'cover',
  },
});
