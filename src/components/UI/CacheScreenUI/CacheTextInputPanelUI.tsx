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
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  textInput: {
    minHeight: 210,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111',
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  primaryAction: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    alignItems: 'center',
    height: 52,
    justifyContent: 'center',
  },
  primaryActionDisabled: {
    opacity: 0.5,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
