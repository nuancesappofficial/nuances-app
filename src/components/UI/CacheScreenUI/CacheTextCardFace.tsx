import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  text: string;
};

export default function CacheTextCardFace({ text }: Props) {
  return (
    <View style={styles.textCard}>
      <Text style={styles.textCardContent} numberOfLines={7}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  textCard: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  textCardContent: {
    color: '#25272E',
    fontSize: 31,
    lineHeight: 45,
    fontWeight: '500',
  },
});
