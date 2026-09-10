import { Audio } from 'expo-av';

export const BUNDLED_PHONICS_AUDIO: Record<string, any> = {
  aa: require('../../../assets/phonics/aa.mp3'),
  ae: require('../../../assets/phonics/ae.mp3'),
  ah: require('../../../assets/phonics/ah.mp3'),
  air: require('../../../assets/phonics/air.mp3'),
  ao: require('../../../assets/phonics/ao.mp3'),
  aw: require('../../../assets/phonics/aw.mp3'),
  ax: require('../../../assets/phonics/ax.mp3'),
  ay: require('../../../assets/phonics/ay.mp3'),
  b: require('../../../assets/phonics/b.mp3'),
  ch: require('../../../assets/phonics/ch.mp3'),
  d: require('../../../assets/phonics/d.mp3'),
  dh: require('../../../assets/phonics/dh.mp3'),
  eer: require('../../../assets/phonics/eer.mp3'),
  eh: require('../../../assets/phonics/eh.mp3'),
  er: require('../../../assets/phonics/er.mp3'),
  ey: require('../../../assets/phonics/ey.mp3'),
  f: require('../../../assets/phonics/f.mp3'),
  g: require('../../../assets/phonics/g.mp3'),
  hh: require('../../../assets/phonics/hh.mp3'),
  ih: require('../../../assets/phonics/ih.mp3'),
  iy: require('../../../assets/phonics/iy.mp3'),
  jh: require('../../../assets/phonics/jh.mp3'),
  k: require('../../../assets/phonics/k.mp3'),
  l: require('../../../assets/phonics/l.mp3'),
  m: require('../../../assets/phonics/m.mp3'),
  n: require('../../../assets/phonics/n.mp3'),
  ng: require('../../../assets/phonics/ng.mp3'),
  oor: require('../../../assets/phonics/oor.mp3'),
  ow: require('../../../assets/phonics/ow.mp3'),
  oy: require('../../../assets/phonics/oy.mp3'),
  p: require('../../../assets/phonics/p.mp3'),
  r: require('../../../assets/phonics/r.mp3'),
  s: require('../../../assets/phonics/s.mp3'),
  sh: require('../../../assets/phonics/sh.mp3'),
  t: require('../../../assets/phonics/t.mp3'),
  th: require('../../../assets/phonics/th.mp3'),
  uh: require('../../../assets/phonics/uh.mp3'),
  uw: require('../../../assets/phonics/uw.mp3'),
  v: require('../../../assets/phonics/v.mp3'),
  w: require('../../../assets/phonics/w.mp3'),
  y: require('../../../assets/phonics/y.mp3'),
  z: require('../../../assets/phonics/z.mp3'),
  zh: require('../../../assets/phonics/zh.mp3'),
};

const IPA_TO_CODE: Record<string, string> = {
  'ɑ': 'aa',
  'æ': 'ae',
  'ʌ': 'ah',
  'ɔ': 'ao',
  'aʊ': 'aw',
  'ə': 'ax',
  'aɪ': 'ay',
  b: 'b',
  'tʃ': 'ch',
  d: 'd',
  'ð': 'dh',
  'ɛ': 'eh',
  'ɝ': 'er',
  'eɪ': 'ey',
  f: 'f',
  g: 'g',
  h: 'hh',
  'ɪ': 'ih',
  i: 'iy',
  'dʒ': 'jh',
  k: 'k',
  l: 'l',
  m: 'm',
  n: 'n',
  'ŋ': 'ng',
  'oʊ': 'ow',
  'ɔɪ': 'oy',
  p: 'p',
  'ɹ': 'r',
  s: 's',
  'ʃ': 'sh',
  t: 't',
  'θ': 'th',
  'ʊ': 'uh',
  u: 'uw',
  v: 'v',
  w: 'w',
  j: 'y',
  z: 'z',
  'ʒ': 'zh',
  'iː': 'iy',
  'uː': 'uw',
  'ɑː': 'aa',
  'ɔː': 'ao',
  'ɜː': 'er',
  'ɪə': 'eer',
  'eə': 'air',
  'ʊə': 'oor',
  'ɒ': 'aa',
  'ɚ': 'er',
  e: 'eh',
  o: 'ow',
};

export function getBundledPhonicsAsset(token: string): any | null {
  if (!token) return null;
  const cleanToken = token.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  if (BUNDLED_PHONICS_AUDIO[cleanToken]) {
    return BUNDLED_PHONICS_AUDIO[cleanToken];
  }
  const code = IPA_TO_CODE[token.trim()] || IPA_TO_CODE[cleanToken];
  if (code && BUNDLED_PHONICS_AUDIO[code]) {
    return BUNDLED_PHONICS_AUDIO[code];
  }
  return null;
}

export function hasBundledPhonics(token: string): boolean {
  return getBundledPhonicsAsset(token) !== null;
}

let activePhonicsSound: InstanceType<typeof Audio.Sound> | null = null;
let activePlaybackId = 0;

export async function stopBundledPhonicsPlayback(): Promise<void> {
  activePlaybackId += 1;
  const sound = activePhonicsSound;
  activePhonicsSound = null;
  if (!sound) return;
  sound.setOnPlaybackStatusUpdate(null);
  await sound.stopAsync().catch(() => undefined);
  await sound.unloadAsync().catch(() => undefined);
}

export async function playBundledPhonics(
  ipa: string,
  options?: {
    onDone?: () => void;
    onStopped?: () => void;
    onError?: () => void;
  }
): Promise<boolean> {
  const asset = getBundledPhonicsAsset(ipa);
  if (!asset) return false;

  await stopBundledPhonicsPlayback();
  const currentId = (activePlaybackId += 1);
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: false });
    if (currentId !== activePlaybackId) {
      void sound.unloadAsync().catch(() => undefined);
      options?.onStopped?.();
      return true;
    }

    activePhonicsSound = sound;
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        sound.setOnPlaybackStatusUpdate(null);
        if (activePhonicsSound === sound) activePhonicsSound = null;
        void sound.unloadAsync().catch(() => undefined);
        options?.onDone?.();
      }
    });

    await sound.playAsync();
    return true;
  } catch (error) {
    console.warn('[Phonics] bundled playback failed:', error);
    await stopBundledPhonicsPlayback();
    options?.onError?.();
    return false;
  }
}
