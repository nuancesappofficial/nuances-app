import React from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
const COLOR_OPTIONS = ['#3688E5', '#9A63CC', '#D15463', '#42A878', '#4A67D8', '#E0912D', '#5D6A7D'];

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
      <View style={styles.settingsOverlay}>
        <View style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>Album Settings</Text>

          <Text style={styles.settingsSectionTitle}>改名</Text>
          <TextInput
            value={settingsName}
            onChangeText={onChangeName}
            style={styles.settingsInput}
            placeholder="輸入相簿名稱"
            placeholderTextColor="#8E8E93"
          />

          <Text style={styles.settingsSectionTitle}>選圖示</Text>
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

          <Text style={styles.settingsSectionTitle}>選顏色</Text>
          <View style={styles.optionRow}>
            {COLOR_OPTIONS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[styles.colorOption, { backgroundColor: color }, settingsColor === color && styles.colorOptionActive]}
                onPress={() => onChangeColor(color)}
              />
            ))}
          </View>

          <View style={styles.settingsButtonRow}>
            <TouchableOpacity style={styles.settingsCancelBtn} onPress={onCancel}>
              <Text style={styles.settingsCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsSaveBtn} onPress={onSave}>
              <Text style={styles.settingsSaveText}>儲存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  settingsCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    backgroundColor: '#121419',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    padding: 14,
    gap: 10,
  },
  settingsTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  settingsSectionTitle: {
    color: '#D0D6E2',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  settingsInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: '#1A1D24',
    paddingHorizontal: 12,
    color: '#FFFFFF',
    fontSize: 15,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiOption: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: '#1A1D24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiOptionActive: {
    borderColor: '#56A1FF',
    backgroundColor: 'rgba(86,161,255,0.15)',
  },
  emojiOptionText: {
    fontSize: 20,
  },
  colorOption: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionActive: {
    borderColor: '#FFFFFF',
  },
  settingsButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  settingsCancelBtn: {
    borderRadius: 10,
    backgroundColor: '#2A2F3A',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  settingsSaveBtn: {
    borderRadius: 10,
    backgroundColor: '#2F80ED',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  settingsCancelText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  settingsSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
