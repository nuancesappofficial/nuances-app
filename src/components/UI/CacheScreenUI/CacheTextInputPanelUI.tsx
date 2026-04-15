import React from 'react';
import { Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

type Props = {
  manualText: string;
  onChangeManualText: (value: string) => void;
  onSubmit: () => void;
};

export default function CacheTextInputPanelUI({
  manualText,
  onChangeManualText,
  onSubmit,
}: Props) {
  const disabled = !manualText.trim();

  return (
    <>
      <Text style={styles.inputLabel}>Paste or type text</Text>
      <TextInput
        value={manualText}
        onChangeText={onChangeManualText}
        multiline
        style={styles.textInput}
        placeholder="Paste a sentence containing slang, idioms, or expressions..."
        placeholderTextColor="#9CA3AF"
      />
      <TouchableOpacity
        style={[styles.primaryAction, disabled && styles.primaryActionDisabled]}
        disabled={disabled}
        onPress={onSubmit}
      >
        <Text style={styles.primaryActionText}>Add Card</Text>
      </TouchableOpacity>
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
  textInput: {
    minHeight: 210,
    borderRadius: 20,
    backgroundColor: '#181C23',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#FFFFFF',
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  primaryAction: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
  },
  primaryActionDisabled: {
    opacity: 0.5,
  },
  primaryActionText: {
    color: '#111111',
    fontWeight: '800',
    fontSize: 16,
  },
});
