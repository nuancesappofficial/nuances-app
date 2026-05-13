import React from 'react';
import { Alert } from 'react-native';
import ProfileSettingsModalUI from '../../../components/UI/ProfileScreenUI/ProfileSettingsModalUI';
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  resolveTTSVoiceForLanguage,
  saveUserSettings,
  type AIReplyLanguage,
  type TTSVoice,
  type WordPopSlideMs,
  withUpdatedTTSVoiceForLanguage,
} from '@services/settings/userSettings';
import SubscriptionService from '@services/subscription/SubscriptionService';
import { supabase } from '@services/supabase/client';

type RouteParams = {
  onPressUploadProfilePic?: () => void;
};

type Props = {
  navigation: any;
  route: { params?: RouteParams };
};

export default function ProfileSettingsFlow({ navigation, route }: Props) {
  const [aiReplyLanguage, setAiReplyLanguage] = React.useState<AIReplyLanguage>(
    DEFAULT_USER_SETTINGS.aiReplyLanguage
  );
  const [ttsVoice, setTtsVoice] = React.useState<TTSVoice>(DEFAULT_USER_SETTINGS.ttsVoice);
  const [wordPopSlideMs, setWordPopSlideMs] = React.useState<WordPopSlideMs>(DEFAULT_USER_SETTINGS.wordPopSlideMs);
  const [membershipLabel, setMembershipLabel] = React.useState<'Trial' | 'Free' | 'Premium'>('Free');

  React.useEffect(() => {
    void (async () => {
      try {
        const settings = await loadUserSettings();
        setAiReplyLanguage(settings.aiReplyLanguage);
        setTtsVoice(resolveTTSVoiceForLanguage(settings, settings.aiReplyLanguage));
        setWordPopSlideMs(settings.wordPopSlideMs);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          const snapshot = await SubscriptionService.getEntitlementSnapshot(user.id);
          setMembershipLabel(
            snapshot.planType === 'premium' ? 'Premium' : snapshot.planType === 'trial' ? 'Trial' : 'Free'
          );
        }
      } catch (error) {
        console.error('[ProfileSettings] load app settings failed:', error);
      }
    })();
  }, []);

  const handleChangeAIReplyLanguage = React.useCallback(async (language: AIReplyLanguage) => {
    try {
      const settings = await loadUserSettings();
      const nextVoice = resolveTTSVoiceForLanguage(settings, language);
      const currentVoice = resolveTTSVoiceForLanguage(settings, settings.aiReplyLanguage);
      if (settings.aiReplyLanguage === language && currentVoice === nextVoice) return;
      await saveUserSettings(withUpdatedTTSVoiceForLanguage(settings, language, nextVoice));
      setAiReplyLanguage(language);
      setTtsVoice(nextVoice);
    } catch (error) {
      console.error('[ProfileSettings] update AI reply language failed:', error);
      Alert.alert('更新失敗', '無法儲存 AI 回覆語言，請稍後再試。');
    }
  }, []);

  const handleChangeTTSVoice = React.useCallback(async (voice: TTSVoice) => {
    try {
      const settings = await loadUserSettings();
      const currentVoice = resolveTTSVoiceForLanguage(settings, settings.aiReplyLanguage);
      if (currentVoice === voice) return;
      await saveUserSettings(withUpdatedTTSVoiceForLanguage(settings, settings.aiReplyLanguage, voice));
      setTtsVoice(voice);
    } catch (error) {
      console.error('[ProfileSettings] update TTS voice failed:', error);
      Alert.alert('更新失敗', '無法儲存語音設定，請稍後再試。');
    }
  }, []);

  const handleChangeWordPopSlideMs = React.useCallback(async (value: WordPopSlideMs) => {
    try {
      const settings = await loadUserSettings();
      if (settings.wordPopSlideMs === value) return;
      await saveUserSettings({
        ...settings,
        wordPopSlideMs: value,
      });
      setWordPopSlideMs(value);
    } catch (error) {
      console.error('[ProfileSettings] update word pop slide interval failed:', error);
      Alert.alert('更新失敗', '無法儲存 Word Pop 輪播速度，請稍後再試。');
    }
  }, []);

  return (
    <ProfileSettingsModalUI
      visible
      renderAsStaticPage
      membershipLabel={membershipLabel}
      aiReplyLanguage={aiReplyLanguage}
      ttsVoice={ttsVoice}
      wordPopSlideMs={wordPopSlideMs}
      onClose={() => navigation.goBack()}
      onPressUploadProfilePic={() => {
        route.params?.onPressUploadProfilePic?.();
      }}
      onChangeAIReplyLanguage={handleChangeAIReplyLanguage}
      onChangeTTSVoice={handleChangeTTSVoice}
      onChangeWordPopSlideMs={handleChangeWordPopSlideMs}
    />
  );
}
