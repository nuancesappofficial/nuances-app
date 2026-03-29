import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  text: string;
};

export default function CacheTextCardFace({ text }: Props) {
  return (
    <View style={styles.textCard}>
      <Text style={styles.textCardLabel}>TEXT CACHE</Text>
      <Text style={styles.textCardContent} numberOfLines={8}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  textCard: {
    flex: 1,
    backgroundColor: '#F5F5F5', // 調整為淺灰色
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  textCardLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  textCardContent: {
    color: '#101010',
    fontSize: 24,
    lineHeight: 33,
    fontWeight: '700',
  },
});