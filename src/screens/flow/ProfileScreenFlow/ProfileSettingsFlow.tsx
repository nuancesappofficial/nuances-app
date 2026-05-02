import React from 'react';
import { Alert } from 'react-native';
import ProfileSettingsModalUI from '../../../components/UI/ProfileScreenUI/ProfileSettingsModalUI';
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  saveUserSettings,
  type AIReplyLanguage,
  type EntitlementMode,
  type TTSVoice,
} from '@services/settings/userSettings';

type RouteParams = {
  onPressUploadProfilePic?: () => void;
};

type Props = {
  navigation: any;
  route: { params?: RouteParams };
};

export default function ProfileSettingsFlow({ navigation, route }: Props) {
  const [entitlementMode, setEntitlementMode] = React.useState<EntitlementMode>('guest');
  const [aiReplyLanguage, setAiReplyLanguage] = React.useState<AIReplyLanguage>(
    DEFAULT_USER_SETTINGS.aiReplyLanguage
  );
  const [ttsVoice, setTtsVoice] = React.useState<TTSVoice>(DEFAULT_USER_SETTINGS.ttsVoice);
  const [savingEntitlement, setSavingEntitlement] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      try {
        const settings = await loadUserSettings();
        setEntitlementMode(settings.entitlementMode);
        setAiReplyLanguage(settings.aiReplyLanguage);
        setTtsVoice(settings.ttsVoice);
      } catch (error) {
        console.error('[ProfileSettings] load app settings failed:', error);
      }
    })();
  }, []);

  const handleToggleEntitlementMode = React.useCallback(async () => {
    if (savingEntitlement) return;
    setSavingEntitlement(true);
    try {
      const settings = await loadUserSettings();
      const nextMode: EntitlementMode = settings.entitlementMode === 'premium' ? 'guest' : 'premium';
      await saveUserSettings({
        ...settings,
        entitlementMode: nextMode,
      });
      setEntitlementMode(nextMode);
      Alert.alert('已切換權限模式', nextMode === 'premium' ? '目前為 Premium 模式。' : '目前為 Guest 模式。');
    } catch (error) {
      console.error('[ProfileSettings] toggle entitlement failed:', error);
      Alert.alert('切換失敗', '請稍後再試。');
    } finally {
      setSavingEntitlement(false);
    }
  }, [savingEntitlement]);

  const handleChangeAIReplyLanguage = React.useCallback(async (language: AIReplyLanguage) => {
    try {
      const settings = await loadUserSettings();
      if (settings.aiReplyLanguage === language) return;
      await saveUserSettings({
        ...settings,
        aiReplyLanguage: language,
      });
      setAiReplyLanguage(language);
    } catch (error) {
      console.error('[ProfileSettings] update AI reply language failed:', error);
      Alert.alert('更新失敗', '無法儲存 AI 回覆語言，請稍後再試。');
    }
  }, []);

  const handleChangeTTSVoice = React.useCallback(async (voice: TTSVoice) => {
    try {
      const settings = await loadUserSettings();
      if (settings.ttsVoice === voice) return;
      await saveUserSettings({
        ...settings,
        ttsVoice: voice,
      });
      setTtsVoice(voice);
    } catch (error) {
      console.error('[ProfileSettings] update TTS voice failed:', error);
      Alert.alert('更新失敗', '無法儲存語音設定，請稍後再試。');
    }
  }, []);

  return (
    <ProfileSettingsModalUI
      visible
      renderAsStaticPage
      entitlementMode={entitlementMode}
      savingEntitlement={savingEntitlement}
      aiReplyLanguage={aiReplyLanguage}
      ttsVoice={ttsVoice}
      onClose={() => navigation.goBack()}
      onPressUploadProfilePic={() => {
        route.params?.onPressUploadProfilePic?.();
      }}
      onToggleEntitlement={handleToggleEntitlementMode}
      onChangeAIReplyLanguage={handleChangeAIReplyLanguage}
      onChangeTTSVoice={handleChangeTTSVoice}
    />
  );
}
