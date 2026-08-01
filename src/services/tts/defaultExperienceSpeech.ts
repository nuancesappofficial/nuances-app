import { Audio } from 'expo-av';

const DEFAULT_EXPERIENCE_PRONUNCIATION_AUDIO = require('../../../assets/tutorial/demo-card/nuances-pronunciation.wav');

let activeSound: InstanceType<typeof Audio.Sound> | null = null;

export async function stopDefaultExperiencePronunciation(): Promise<void> {
  const sound = activeSound;
  activeSound = null;
  if (!sound) return;
  sound.setOnPlaybackStatusUpdate(null);
  await sound.stopAsync().catch(() => undefined);
  await sound.unloadAsync().catch(() => undefined);
}

export async function playDefaultExperiencePronunciation(options?: {
  onDone?: () => void;
  onError?: () => void;
}): Promise<void> {
  try {
    await stopDefaultExperiencePronunciation();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
    const { sound } = await Audio.Sound.createAsync(
      DEFAULT_EXPERIENCE_PRONUNCIATION_AUDIO,
      { shouldPlay: false }
    );
    activeSound = sound;
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      sound.setOnPlaybackStatusUpdate(null);
      if (activeSound === sound) activeSound = null;
      void sound.unloadAsync().catch(() => undefined);
      options?.onDone?.();
    });
    await sound.playAsync();
  } catch (error) {
    console.warn('[TTS] bundled tutorial pronunciation playback failed:', error);
    await stopDefaultExperiencePronunciation();
    options?.onError?.();
  }
}
