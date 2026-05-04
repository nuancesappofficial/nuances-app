import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import StickerFontPreview from '../../../components/UI/ProfileScreenUI/StickerFontPreview';
import {
  DEFAULT_USER_SETTINGS,
  getDefaultTTSVoiceForAIReplyLanguage,
  isTTSVoiceCompatibleWithAIReplyLanguage,
  loadUserSettings,
  saveUserSettings,
  type AIReplyLanguage,
  type TTSVoice,
  type UserAppSettings,
} from '@services/settings/userSettings';
import { CONTAINER_NEON_GLOW, CONTAINER_NEON_OUTLINE, resolveThemeColors } from '../../../theme/colors';
import { STICKER_FONT_OPTIONS, type StickerFontKey } from '../../../theme/stickerFonts';

type SettingOptionKind = 'ai' | 'voice' | 'font';

type Props = {
  navigation: any;
  route: {
    params?: {
      kind?: SettingOptionKind;
    };
  };
};

const AI_LANGUAGE_OPTIONS: Array<{ code: AIReplyLanguage; label: string }> = [
  { code: 'zh-TW', label: '繁中' },
  { code: 'zh-CN', label: '简中' },
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];

const TTS_VOICE_OPTIONS: Array<{ code: TTSVoice; label: string }> = [
  { code: 'en-US-JennyNeural', label: 'EN-US Jenny' },
  { code: 'en-US-GuyNeural', label: 'EN-US Guy' },
  { code: 'en-GB-SoniaNeural', label: 'EN-GB Sonia' },
  { code: 'ja-JP-NanamiNeural', label: '日本語 Nanami' },
  { code: 'ko-KR-SunHiNeural', label: '한국어 SunHi' },
  { code: 'zh-TW-HsiaoChenNeural', label: '繁中 曉臻' },
  { code: 'zh-CN-XiaoxiaoNeural', label: '简中 晓晓' },
];

function getTitle(kind: SettingOptionKind): string {
  if (kind === 'ai') return 'Language';
  if (kind === 'voice') return 'Voice';
  return 'Font';
}

export default function ProfileSettingOptionsFlow({ navigation, route }: Props) {
  const kind = route.params?.kind ?? 'ai';
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const isLight = colorScheme === 'light';
  const [settings, setSettings] = React.useState<UserAppSettings>(DEFAULT_USER_SETTINGS);

  React.useEffect(() => {
    if (kind !== 'ai' && kind !== 'voice' && kind !== 'font') {
      navigation.goBack();
      return;
    }

    void loadUserSettings()
      .then(setSettings)
      .catch((error) => {
        console.error('[ProfileSettingOptions] load settings failed:', error);
      });
  }, [kind, navigation]);

  const visibleTTSVoiceOptions = React.useMemo(
    () =>
      TTS_VOICE_OPTIONS.filter((item) =>
        isTTSVoiceCompatibleWithAIReplyLanguage(item.code, settings.aiReplyLanguage)
      ),
    [settings.aiReplyLanguage]
  );

  const persistSettings = React.useCallback(async (next: UserAppSettings) => {
    await saveUserSettings(next);
    setSettings(next);
  }, []);

  const handleSelectLanguage = React.useCallback(
    async (language: AIReplyLanguage) => {
      try {
        const nextVoice = isTTSVoiceCompatibleWithAIReplyLanguage(settings.ttsVoice, language)
          ? settings.ttsVoice
          : getDefaultTTSVoiceForAIReplyLanguage(language);
        const nextSettings = { ...settings, aiReplyLanguage: language, ttsVoice: nextVoice };
        await persistSettings(nextSettings);
      } catch (error) {
        console.error('[ProfileSettingOptions] update language failed:', error);
        Alert.alert('更新失敗', '無法儲存語言設定，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handleSelectVoice = React.useCallback(
    async (voice: TTSVoice) => {
      try {
        const nextSettings = { ...settings, ttsVoice: voice };
        await persistSettings(nextSettings);
      } catch (error) {
        console.error('[ProfileSettingOptions] update voice failed:', error);
        Alert.alert('更新失敗', '無法儲存語音設定，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handleSelectFont = React.useCallback(
    async (fontKey: StickerFontKey) => {
      try {
        const nextSettings = { ...settings, stickerFontKey: fontKey };
        await persistSettings(nextSettings);
      } catch (error) {
        console.error('[ProfileSettingOptions] update sticker font failed:', error);
        Alert.alert('更新失敗', '無法儲存貼紙字體，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const rows = React.useMemo(() => {
    if (kind === 'ai') {
      return AI_LANGUAGE_OPTIONS.map((item) => ({
        key: item.code,
        selected: item.code === settings.aiReplyLanguage,
        content: <Text style={[styles.settingLabel, { color: palette.textOnContainer }]}>{item.label}</Text>,
        onPress: () => void handleSelectLanguage(item.code),
      }));
    }

    if (kind === 'voice') {
      return visibleTTSVoiceOptions.map((item) => ({
        key: item.code,
        selected: item.code === settings.ttsVoice,
        content: <Text style={[styles.settingLabel, { color: palette.textOnContainer }]}>{item.label}</Text>,
        onPress: () => void handleSelectVoice(item.code),
      }));
    }

    return STICKER_FONT_OPTIONS.map((item) => ({
      key: item.key,
      selected: item.key === settings.stickerFontKey,
      content: <StickerFontPreview label="Nuances" fontKey={item.key} />,
      onPress: () => void handleSelectFont(item.key),
    }));
  }, [handleSelectFont, handleSelectLanguage, handleSelectVoice, kind, palette.textOnContainer, settings, visibleTTSVoiceOptions]);

  return (
    <View style={[styles.root, { backgroundColor: palette.screenBg }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.86} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={palette.textOnBg} />
            <Text style={[styles.backText, { color: palette.textOnBg }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: palette.textOnBg }]}>{getTitle(kind)}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.containerBg,
              borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
              shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
              shadowOpacity: isLight ? 0.08 : 0.18,
            },
          ]}
        >
          {rows.map((row, index) => (
            <React.Fragment key={row.key}>
              <TouchableOpacity style={styles.row} activeOpacity={0.9} onPress={row.onPress}>
                {row.content}
                {row.selected ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={palette.textOnContainer}
                    style={styles.rowIcon}
                  />
                ) : null}
              </TouchableOpacity>
              {index < rows.length - 1 ? (
                <View
                  style={[
                    styles.divider,
                    { backgroundColor: isLight ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.32)' },
                  ]}
                />
              ) : null}
            </React.Fragment>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    marginTop: 8,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 64,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  headerSpacer: {
    minWidth: 64,
  },
  card: {
    marginTop: 18,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 6,
  },
  row: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowIcon: {
    width: 20,
    textAlign: 'right',
    marginLeft: 12,
  },
  divider: {
    height: 1,
    marginHorizontal: 14,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
