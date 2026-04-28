import React from 'react';
import { Text, TextInput, StyleSheet, View } from 'react-native';

type Props = {
  manualText: string;
  onChangeManualText: (value: string) => void;
};

export default function CacheTextInputPanelUI({
  manualText,
  onChangeManualText,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.inputLabel}>Paste or type text</Text>
      <TextInput
        value={manualText}
        onChangeText={onChangeManualText}
        multiline
        style={styles.textInput}
        placeholder="Paste a sentence containing slang, idioms, or expressions..."
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#97A0AF',
    marginBottom: 10,
  },
  textInput: {
    flex: 1,
    minHeight: 118,
    borderRadius: 20,
    backgroundColor: '#181C23',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#FFFFFF',
    textAlignVertical: 'top',
  },
});
