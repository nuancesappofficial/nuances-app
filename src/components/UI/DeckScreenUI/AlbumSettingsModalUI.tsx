import React from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import {
  CONTAINER_BG,
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  SCREEN_BG,
  TEXT_ON_BG,
  TEXT_ON_CONTAINER,
  TEXT_ON_CTA,
} from '../../../theme/colors';

type Props = {
  visible: boolean;
  settingsName: string;
  settingsEmoji: string;
  settingsColor: string;
  onChangeName: (name: string) => void;
  onChangeEmoji: (emoji: string) => void;
  onChangeColor: (color: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

const EMOJI_OPTIONS = ['✨', '🔖', '❤️', '🕒', '📁', '💬', '🎬', '💼'];
const COVER_COLOR_OPTIONS = [
  { value: '#E45757' },
  { value: '#9A63CC' },
  { value: '#E8C24A' },
  { value: '#E39A34' },
  { value: '#D86A8A' },
  { value: '#4EAFF4' },
  { value: '#32B8A2' },
  { value: '#5BC0EB' },
  { value: '#F97316' },
  { value: '#1E293B' },
  { value: '#64748B' },
];

const MODAL_ENTRY_TRANSLATE_Y = 420;
const MODAL_ENTRY_DURATION_MS = 360;
const MODAL_BACKDROP_DURATION_MS = 240;
const MODAL_EXIT_DURATION_MS = 220;

export default function AlbumSettingsModalUI({
  visible,
  settingsName,
  settingsEmoji,
  settingsColor,
  onChangeName,
  onChangeEmoji,
  onChangeColor,
  onCancel,
  onSave,
}: Props) {
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
    <Modal visible transparent animationType="none" onRequestClose={onCancel}>
      <Pressable style={styles.rootPressable} onPress={onCancel}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: entranceY }] }]}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.handle} />

            <Text style={styles.eyebrow}>ALBUM SETTINGS</Text>
            <Text style={styles.title}>Customize this album</Text>
            <Text style={styles.subtitle}>Refine the name, icon, and cover color.</Text>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>Album name</Text>
              <TextInput
                value={settingsName}
                onChangeText={onChangeName}
                style={styles.input}
                placeholder="Type album name"
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>Icon</Text>
              <View style={styles.optionRow}>
                {EMOJI_OPTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.emojiOption, settingsEmoji === emoji && styles.emojiOptionActive]}
                    onPress={() => onChangeEmoji(emoji)}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.emojiOptionText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>Cover color</Text>
              <View style={styles.colorGrid}>
                {COVER_COLOR_OPTIONS.map((option) => {
                  const active = settingsColor === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.colorOptionRow, active ? styles.colorOptionRowActive : null]}
                      onPress={() => onChangeColor(option.value)}
                      activeOpacity={0.88}
                    >
                      <View
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: option.value },
                          active ? styles.colorSwatchActive : null,
                        ]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.9}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={onSave} activeOpacity={0.9}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: SCREEN_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 14,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#4B5563',
    alignSelf: 'center',
    marginBottom: 4,
  },
  eyebrow: {
    color: '#8D93A1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    color: TEXT_ON_BG,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#B4BBC8',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: CONTAINER_BG,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  sectionLabel: {
    color: '#97A0AF',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: TEXT_ON_CONTAINER,
    fontSize: 15,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(15,23,42,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiOptionActive: {
    borderColor: MODAL_CTA_COLOR_BORDER,
    backgroundColor: 'rgba(78,175,244,0.16)',
  },
  emojiOptionText: {
    fontSize: 22,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    columnGap: 0,
  },
  colorOptionRow: {
    width: '20%',
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOptionRowActive: {
    transform: [{ scale: 1.08 }],
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  colorSwatchActive: {
    borderWidth: 2,
    borderColor: MODAL_CTA_COLOR_BORDER,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    borderRadius: BUTTON_TOKENS.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: CONTAINER_BG,
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: TEXT_ON_BG,
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  saveText: {
    color: TEXT_ON_CTA,
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
});
