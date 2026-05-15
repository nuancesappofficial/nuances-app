import { speakViaAzureTtsProxy } from './cloudSpeech';
import {
  getDefaultTTSVoiceForAIReplyLanguage,
  loadUserSettings,
  resolveTTSVoiceForLanguage,
  type AIReplyLanguage,
} from '@services/settings/userSettings';

function detectSpeechLanguage(text: string): AIReplyLanguage {
  const value = text.trim();
  if (!value) return 'en';
  if (/[\u3040-\u30ff]/.test(value)) return 'ja';
  if (/[\uac00-\ud7af]/.test(value)) return 'ko';
  if (/[\u4e00-\u9fff]/.test(value)) return 'zh-TW';
  return 'en';
}

export async function speakEnglishNaturally(
  text: string,
  options?: {
    onDownloadStart?: () => void;
    onDownloadEnd?: () => void;
    onDone?: () => void;
    onStopped?: () => void;
    onError?: () => void;
  }
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    options?.onError?.();
    return;
  }

  let selectedVoice: string | undefined;
  let locale = 'en-US';
  try {
    const settings = await loadUserSettings();
    const language = detectSpeechLanguage(trimmed);
    selectedVoice = resolveTTSVoiceForLanguage(settings, language);
    locale =
      language === 'ja'
        ? 'ja-JP'
        : language === 'ko'
          ? 'ko-KR'
          : language === 'zh-CN'
            ? 'zh-CN'
            : language === 'zh-TW'
              ? 'zh-TW'
              : 'en-US';
  } catch {
    const language = detectSpeechLanguage(trimmed);
    selectedVoice = getDefaultTTSVoiceForAIReplyLanguage(language);
    locale =
      language === 'ja'
        ? 'ja-JP'
        : language === 'ko'
          ? 'ko-KR'
          : language === 'zh-CN'
            ? 'zh-CN'
            : language === 'zh-TW'
              ? 'zh-TW'
              : 'en-US';
  }

  const cloudSpoken = await speakViaAzureTtsProxy(trimmed, {
    locale,
    voice: selectedVoice,
    onDownloadStart: options?.onDownloadStart,
    onDownloadEnd: options?.onDownloadEnd,
    onDone: options?.onDone,
    onError: undefined,
  });
  if (cloudSpoken) {
    return;
  }

  console.warn('[TTS] Azure/cache playback unavailable; no native speech fallback used', {
    text: trimmed,
    locale,
    voice: selectedVoice || '(default)',
  });
  options?.onError?.();
}
