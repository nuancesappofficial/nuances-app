import React from 'react';
import { Text, Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CONTAINER_BG, MODAL_CTA_COLOR, MODAL_CTA_COLOR_BORDER, TEXT_ON_CTA, resolveThemeColors } from '../../../theme/colors';

type Props = {
  creatingImage: boolean;
  uploadPanelHeight: number;
  onUploadImage: () => void;
  onCaptureImage: () => void;
  palette?: ReturnType<typeof resolveThemeColors>;
};

export default function CacheImageInputPanelUI({
  creatingImage,
  uploadPanelHeight,
  onUploadImage,
  onCaptureImage,
  palette,
}: Props) {
  return (
    <>
      <Text style={[styles.inputLabel, palette ? { color: palette.secondaryText } : null]}>Capture or upload image</Text>
      <Pressable
        style={({ pressed }) => [
          styles.imageUploadPanel,
          {
            height: uploadPanelHeight,
            backgroundColor: palette?.containerBg ?? CONTAINER_BG,
            borderColor: palette?.modalOptionBorder ?? 'rgba(255,255,255,0.12)',
          },
          pressed && !creatingImage ? styles.panelPressed : null,
        ]}
        onPress={onUploadImage}
        disabled={creatingImage}
      >
        <View style={styles.imageUploadIconWrap}>
          <Ionicons name="image-outline" size={34} color={TEXT_ON_CTA} />
        </View>
        <Text style={[styles.imageUploadText, palette ? { color: palette.textOnContainer } : null]}>
          {creatingImage ? 'processing image...' : 'upload image'}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.primaryAction,
          styles.imageAction,
          pressed && !creatingImage ? styles.primaryPressed : null,
        ]}
        onPress={onCaptureImage}
        disabled={creatingImage}
      >
        <Ionicons name="camera" size={22} color={TEXT_ON_CTA} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#97A0AF',
    marginBottom: 10,
  },
  imageUploadPanel: {
    backgroundColor: CONTAINER_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  imageUploadIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: MODAL_CTA_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  imageUploadIcon: {
    fontSize: 34,
    color: TEXT_ON_CTA,
  },
  imageUploadText: {
    color: '#FFFFFF',
    fontSize: 19,
    textAlign: 'center',
    fontWeight: '700',
  },
  primaryAction: {
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
    borderRadius: 18,
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
  },
  imageAction: {
    backgroundColor: MODAL_CTA_COLOR,
  },
  primaryActionText: {
    color: '#111111',
    fontWeight: '800',
    fontSize: 16,
  },
  panelPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  primaryPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
});
