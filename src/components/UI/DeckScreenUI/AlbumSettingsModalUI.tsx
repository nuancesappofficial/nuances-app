import React from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';

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
  { label: '暗夜紫', value: '#2A2438' },
  { label: '深松石', value: '#1E332E' },
  { label: '勃根地紅', value: '#3B282F' },
  { label: '古銅棕', value: '#332D21' },
  { label: '原廠預設', value: '#1E293B' },
];

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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} />

        <View style={styles.sheet}>
          <Text style={styles.eyebrow}>ALBUM SETTINGS</Text>
          <Text style={styles.title}>Customize this album</Text>
          <Text style={styles.subtitle}>Refine the name and icon to fit the vibe you want.</Text>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Album name</Text>
            <TextInput
              value={settingsName}
              onChangeText={onChangeName}
              style={styles.input}
              placeholder="Type album name"
              placeholderTextColor="#737B88"
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
                    <View style={[styles.colorSwatch, { backgroundColor: option.value }]} />
                    <Text style={styles.colorOptionLabel}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={onSave}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    borderRadius: 24,
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    //minHeight: 700,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 32,
    gap: 16,
  },
  eyebrow: {
    color: '#8D93A1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#B4BBC8',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    borderRadius: 20,
    backgroundColor: '#181C23',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  sectionLabel: {
    color: '#97A0AF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#111318',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#FFFFFF',
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
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#111318',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiOptionActive: {
    borderColor: '#E5FF4F',
    backgroundColor: 'rgba(229,255,79,0.12)',
  },
  emojiOptionText: {
    fontSize: 22,
  },
  colorGrid: {
    gap: 8,
  },
  colorOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#111318',
    paddingHorizontal: 10,
    minHeight: 40,
  },
  colorOptionRowActive: {
    borderColor: '#F8FAFC',
  },
  colorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  colorOptionLabel: {
    color: '#E5EAF3',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: '#1A1E27',
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: '#FFFFFF',
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#FFFFFF',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  saveText: {
    color: '#111111',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
});
