import React from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onDelete: () => void;
};

const MODAL_ENTRY_TRANSLATE_Y = 420;
const MODAL_ENTRY_DURATION_MS = 360;
const MODAL_BACKDROP_DURATION_MS = 240;
const MODAL_EXIT_DURATION_MS = 220;

export default function CardActionModalUI({ visible, title, onClose, onDelete }: Props) {
  const [shouldRender, setShouldRender] = React.useState(visible);
  const entranceY = React.useRef(new Animated.Value(MODAL_ENTRY_TRANSLATE_Y)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      setShouldRender(true);
      entranceY.setValue(MODAL_ENTRY_TRANSLATE_Y);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(entranceY, {
          toValue: 0,
          duration: MODAL_ENTRY_DURATION_MS,
          easing: Easing.bezier(0.3, 0.2, 0.4, 1),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: MODAL_BACKDROP_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!shouldRender) return;
    Animated.parallel([
      Animated.timing(entranceY, {
        toValue: MODAL_ENTRY_TRANSLATE_Y,
        duration: MODAL_EXIT_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: MODAL_EXIT_DURATION_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setShouldRender(false);
    });
  }, [backdropOpacity, entranceY, shouldRender, visible]);

  if (!shouldRender) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.rootPressable} onPress={onClose}>
        <Animated.View style={[styles.sortModalOverlay, { opacity: backdropOpacity }]} />
        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: entranceY }] }]}>
          <Pressable style={styles.sortModalCard} onPress={() => undefined}>
          <Text style={styles.eyebrow}>CARD OPTIONS</Text>
          <Text style={styles.sortModalTitle}>{title}</Text>
          <TouchableOpacity style={styles.deleteOptionBtn} onPress={onDelete}>
            <Text style={styles.deleteOptionText}>刪掉卡片</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelOptionBtn} onPress={onClose}>
            <Text style={styles.cancelOptionText}>取消</Text>
          </TouchableOpacity>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rootPressable: {
    flex: 1,
  },
  sortModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sortModalCard: {
    backgroundColor: '#02213D',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 12,
  },
  eyebrow: {
    color: '#8D93A1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  sortModalTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 2,
  },
  deleteOptionBtn: {
    borderRadius: BUTTON_TOKENS.radius.md,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: '#FF3B30',
    minHeight: BUTTON_TOKENS.height.regular,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  deleteOptionText: {
    color: '#FFE8E5',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
    textAlign: 'center',
  },
  cancelOptionBtn: {
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    minHeight: BUTTON_TOKENS.height.prominent,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  cancelOptionText: {
    color: '#111111',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
    textAlign: 'center',
  },
});
