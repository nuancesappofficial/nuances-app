import * as Speech from 'expo-speech';

type CachedVoice = {
  identifier: string;
  language: string;
  quality: string;
  name: string;
};

let cachedEnglishVoice: CachedVoice | null | undefined;

async function getPreferredEnglishVoice(): Promise<CachedVoice | null> {
  if (cachedEnglishVoice !== undefined) {
    return cachedEnglishVoice;
  }

  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const englishVoices = voices.filter((voice) => /^en(-|$)/i.test(voice.language));

    const ranked = [...englishVoices].sort((a, b) => {
      const score = (voice: { language: string; quality: string; name: string }) => {
        let value = 0;
        if (/^en-US$/i.test(voice.language)) value += 8;
        else if (/^en-GB$/i.test(voice.language)) value += 6;
        else value += 4;

        if (voice.quality === 'Enhanced') value += 10;
        if (/siri/i.test(voice.name)) value += 3;
        return value;
      };
      return score(b) - score(a);
    });

    cachedEnglishVoice = ranked[0] ?? null;
    return cachedEnglishVoice;
  } catch {
    cachedEnglishVoice = null;
    return null;
  }
}

export async function speakEnglishNaturally(
  text: string,
  options?: {
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

  const preferredVoice = await getPreferredEnglishVoice();

  await Speech.stop();
  Speech.speak(trimmed, {
    language: preferredVoice?.language || 'en-US',
    voice: preferredVoice?.identifier,
    rate: 0.9,
    pitch: 1.0,
    useApplicationAudioSession: false,
    onDone: options?.onDone,
    onStopped: options?.onStopped,
    onError: () => {
      cachedEnglishVoice = null;
      options?.onError?.();
    },
  });
}
