import React from 'react';
import { Text, TextInput, StyleSheet, View } from 'react-native';
import { CONTAINER_BG, TEXT_ON_CONTAINER, resolveThemeColors } from '../../../theme/colors';
import { tUI } from '../../../i18n/uiLanguage';
import type { UILanguage } from '../../../services/settings/userSettings';

type Props = {
  manualText: string;
  onChangeManualText: (value: string) => void;
  uiLanguage: UILanguage;
  inputHeight?: number;
  palette?: ReturnType<typeof resolveThemeColors>;
};

export default function CacheTextInputPanelUI({
  manualText,
  onChangeManualText,
  uiLanguage,
  inputHeight = 118,
  palette,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={[styles.inputLabel, palette ? { color: palette.secondaryText } : null]}>
        {tUI(uiLanguage, 'cache.inputLabel')}
      </Text>
      <TextInput
        value={manualText}
        onChangeText={onChangeManualText}
        multiline
        style={[
          styles.textInput,
          {
            height: inputHeight,
            maxHeight: inputHeight,
            backgroundColor: palette?.containerBg ?? CONTAINER_BG,
            borderColor: palette?.modalOptionBorder ?? 'rgba(255,255,255,0.12)',
            color: palette?.textOnContainer ?? TEXT_ON_CONTAINER,
          },
        ]}
        placeholder={tUI(uiLanguage, 'cache.inputPlaceholder')}
        placeholderTextColor={palette?.secondaryText ?? '#9CA3AF'}
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
    borderRadius: 20,
    backgroundColor: CONTAINER_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: TEXT_ON_CONTAINER,
    textAlignVertical: 'top',
  },
});
