import React from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type SwipeDecision = 'left' | 'right' | null;

type Props = {
  panHandlers: any;
  animatedStyle: any;
  width: number;
  height: number;
  swipeDecision: SwipeDecision;
  sourceText: string;
  timeText: string;
  suggestedText: string;
  expiryText: string;
  isExpired: boolean;
  imageUri?: string | null;
  onSkipPress: () => void;
  onCreatePress: () => void;
  content: React.ReactNode;
};

export default function Card({
  panHandlers,
  animatedStyle,
  width,
  height,
  swipeDecision,
  sourceText,
  timeText,
  suggestedText,
  expiryText,
  isExpired,
  imageUri,
  onSkipPress,
  onCreatePress,
  content,
}: Props) {
  return (
    <Animated.View
      {...panHandlers}
      style={[styles.card, { width, height, alignSelf: 'center' }, animatedStyle]}
    >
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.skipButton, swipeDecision === 'left' ? styles.actionActive : styles.actionDim]}
          onPress={onSkipPress}
        >
          <Text style={[styles.actionText, styles.skipText]}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.createButton,
            swipeDecision === 'right' ? styles.actionActive : styles.actionDim,
          ]}
          onPress={onCreatePress}
        >
          <Text style={[styles.actionText, styles.createText]}>Create</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metaBlock}>
        <View style={styles.metaRow}>
          <Text style={styles.sourceTag} numberOfLines={1}>
            {sourceText}
          </Text>
          <Text style={styles.timeText}>{timeText}</Text>
        </View>
        <Text style={styles.suggestedText} numberOfLines={1}>
          AI suggests: "{suggestedText}"
        </Text>
        <Text style={[styles.expiryText, isExpired && styles.expiredText]} numberOfLines={1}>
          {expiryText}
        </Text>
      </View>

      {imageUri ? <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" /> : null}

      <View style={styles.contentBlock}>{content}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 0,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    zIndex: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 22,
    elevation: 8,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButton: {
    minWidth: 80,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionDim: {
    opacity: 0.66,
  },
  actionActive: {
    opacity: 1,
  },
  skipButton: {
    backgroundColor: '#FDECEC',
    borderColor: '#ECA8A8',
  },
  createButton: {
    backgroundColor: '#E8F4FD',
    borderColor: '#86C2F4',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  skipText: {
    color: '#B42318',
  },
  createText: {
    color: '#1A6FC4',
  },
  metaBlock: {
    marginTop: 10,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceTag: {
    fontSize: 11,
    color: '#85859A',
    backgroundColor: '#F2F2F5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '600',
    maxWidth: '65%',
  },
  timeText: {
    fontSize: 11,
    color: '#B0B0BE',
  },
  suggestedText: {
    color: '#1A6FC4',
    fontSize: 12,
    fontWeight: '600',
  },
  expiryText: {
    color: '#7E7E8E',
    fontSize: 12,
  },
  expiredText: {
    color: '#B42318',
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    marginTop: 12,
    marginBottom: 14,
  },
  contentBlock: {
    flex: 1,
  },
});
