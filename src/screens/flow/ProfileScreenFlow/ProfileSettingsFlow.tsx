import React from 'react';
import { Alert } from 'react-native';
import ProfileSettingsModalUI from '../../../components/UI/ProfileScreenUI/ProfileSettingsModalUI';
import {
  DEFAULT_USER_SETTINGS,
  getInitialUserSettings,
  getPrimaryAIReplyLanguageForLearningLanguages,
  loadUserSettings,
  resolveTTSVoiceForLanguage,
  saveUserSettings,
  type AIReplyLanguage,
  type TTSVoice,
  type WordPopSlideMs,
  withUpdatedTTSVoiceOnlyForLanguage,
} from '@services/settings/userSettings';
import type { UILanguage } from '@services/settings/userSettings';
import SubscriptionService from '@services/subscription/SubscriptionService';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { tUI } from '../../../i18n/uiLanguage';
import { localizeDefaultExperienceSavedCard } from '../../../features/cache/defaultExperienceCard';

type RouteParams = {
  onPressUploadProfilePic?: () => void;
};

type Props = {
  navigation: any;
  route: { params?: RouteParams };
};

export default function ProfileSettingsFlow({ navigation, route }: Props) {
  const initialSettings = getInitialUserSettings();
  const [aiReplyLanguage, setAiReplyLanguage] = React.useState<AIReplyLanguage>(
    initialSettings.aiReplyLanguage
  );
  const [uiLanguage, setUiLanguage] = React.useState<UILanguage>(
    initialSettings.uiLanguage
  );
  const [ttsVoiceLanguage, setTtsVoiceLanguage] =
    React.useState<AIReplyLanguage>('en');
  const [ttsVoice, setTtsVoice] = React.useState<TTSVoice>(
    initialSettings.ttsVoice
  );
  const [wordPopSlideMs, setWordPopSlideMs] = React.useState<WordPopSlideMs>(
    initialSettings.wordPopSlideMs
  );
  const [membershipLabel, setMembershipLabel] = React.useState<
    'Trial' | 'Free' | 'Premium'
  >('Free');

  React.useEffect(() => {
    void (async () => {
      try {
        const settings = await loadUserSettings();
        setUiLanguage(settings.uiLanguage);
        setAiReplyLanguage(settings.aiReplyLanguage);
        const targetTTSLanguage = getPrimaryAIReplyLanguageForLearningLanguages(
          settings.learningLanguages
        );
        setTtsVoiceLanguage(targetTTSLanguage);
        setTtsVoice(resolveTTSVoiceForLanguage(settings, targetTTSLanguage));
        setWordPopSlideMs(settings.wordPopSlideMs);
        const userId = await getCurrentSessionUserId();
        if (userId) {
          const snapshot =
            await SubscriptionService.getEntitlementSnapshot(userId);
          setMembershipLabel(
            snapshot.planType === 'premium'
              ? 'Premium'
              : snapshot.planType === 'trial'
                ? 'Trial'
                : 'Free'
          );
        }
      } catch (error) {
        console.error('[ProfileSettings] load app settings failed:', error);
      }
    })();
  }, []);

  const handleChangeAIReplyLanguage = React.useCallback(
    async (language: AIReplyLanguage) => {
      try {
        const settings = await loadUserSettings();
        if (
          settings.aiReplyLanguage === language &&
          settings.uiLanguage === language
        )
          return;
        await saveUserSettings({
          ...settings,
          aiReplyLanguage: language,
          uiLanguage: language,
        });
        const userId = await getCurrentSessionUserId();
        if (userId) {
          await localizeDefaultExperienceSavedCard(userId, language);
        }
        setAiReplyLanguage(language);
        setUiLanguage(language);
        Alert.alert(
          tUI(language, 'settings.language.restartTitle'),
          tUI(language, 'settings.language.restartBody')
        );
      } catch (error) {
        console.error(
          '[ProfileSettings] update AI reply language failed:',
          error
        );
        Alert.alert(
          tUI(uiLanguage, 'settings.language.updateFailedTitle'),
          tUI(uiLanguage, 'settings.language.updateFailedBody')
        );
      }
    },
    [uiLanguage]
  );

  const handleChangeTTSVoice = React.useCallback(async (voice: TTSVoice) => {
    try {
      const settings = await loadUserSettings();
      const targetTTSLanguage = getPrimaryAIReplyLanguageForLearningLanguages(
        settings.learningLanguages
      );
      const currentVoice = resolveTTSVoiceForLanguage(
        settings,
        targetTTSLanguage
      );
      if (currentVoice === voice) return;
      await saveUserSettings(
        withUpdatedTTSVoiceOnlyForLanguage(settings, targetTTSLanguage, voice)
      );
      setTtsVoiceLanguage(targetTTSLanguage);
      setTtsVoice(voice);
    } catch (error) {
      console.error('[ProfileSettings] update TTS voice failed:', error);
      Alert.alert('更新失敗', '無法儲存語音設定，請稍後再試。');
    }
  }, []);

  const handleChangeWordPopSlideMs = React.useCallback(
    async (value: WordPopSlideMs) => {
      try {
        const settings = await loadUserSettings();
        if (settings.wordPopSlideMs === value) return;
        await saveUserSettings({
          ...settings,
          wordPopSlideMs: value,
        });
        setWordPopSlideMs(value);
      } catch (error) {
        console.error(
          '[ProfileSettings] update word pop slide interval failed:',
          error
        );
        Alert.alert('更新失敗', '無法儲存 Word Pop 輪播速度，請稍後再試。');
      }
    },
    []
  );

  return (
    <ProfileSettingsModalUI
      visible
      renderAsStaticPage
      membershipLabel={membershipLabel}
      uiLanguage={uiLanguage}
      aiReplyLanguage={aiReplyLanguage}
      ttsVoiceLanguage={ttsVoiceLanguage}
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
