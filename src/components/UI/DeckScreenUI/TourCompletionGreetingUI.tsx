import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { resolveThemeColors } from '../../../theme/colors';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  shareLabel: string;
  uploadLabel: string;
  onShare: () => void;
  onUpload: () => void;
};

export default function TourCompletionGreetingUI({
  visible,
  title,
  body,
  shareLabel,
  uploadLabel,
  onShare,
  onUpload,
}: Props) {
  const palette = resolveThemeColors(useColorScheme());

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onShare}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.modalBg,
              borderColor: palette.modalOptionBorder,
            },
          ]}
        >
          <Text style={[styles.title, { color: palette.textOnContainer }]}>
            {title}
          </Text>
          <Text style={[styles.body, { color: palette.secondaryText }]}>
            {body}
          </Text>
          <Pressable style={styles.primaryButton} onPress={onUpload}>
            <Text style={styles.primaryButtonText}>{uploadLabel}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onShare}>
            <Text style={[styles.secondaryButtonText, { color: palette.textOnContainer }]}>
              {shareLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  card: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    marginTop: 12,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 56,
    marginTop: 28,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C9FE5',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 52,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
