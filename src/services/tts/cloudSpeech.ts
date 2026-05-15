import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { supabase } from '@services/supabase/client';
import SubscriptionService from '@services/subscription/SubscriptionService';

type SpeakOptions = {
  locale?: string;
  voice?: string;
  rate?: string;
  onDownloadStart?: () => void;
  onDownloadEnd?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};

const TTS_EDGE_FUNCTION_NAME = process.env.EXPO_PUBLIC_TTS_EDGE_FUNCTION_NAME || 'tts-proxy';
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const DEV_BYPASS_ENABLED = String(process.env.EXPO_PUBLIC_SUBSCRIPTION_DEV_BYPASS || '').toLowerCase() === 'true';
const DEV_DEFAULT_PLAN = (process.env.EXPO_PUBLIC_SUBSCRIPTION_DEV_DEFAULT_PLAN || '').trim();
const MAX_LOADED_LOCAL_SOUNDS = 24;

type CloudSound = Awaited<ReturnType<typeof Audio.Sound.createAsync>>['sound'];

let activeSound: CloudSound | null = null;
let activeSoundUri = '';
let latestPlaybackRequestId = 0;
const localAudioFileCache = new Set<string>();
const loadedLocalSoundCache = new Map<string, CloudSound>();

function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function getAuthHeader(): Promise<{ Authorization: string } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token?.trim() || SUPABASE_ANON_KEY;
  if (!accessToken) return null;
  return { Authorization: `Bearer ${accessToken}` };
}

async function stopActiveCloudPlayback(): Promise<void> {
  const sound = activeSound;
  const soundUri = activeSoundUri;
  activeSound = null;
  activeSoundUri = '';
  if (!sound) return;

  try {
    await sound.stopAsync();
  } catch {
    // ignore
  }
  try {
    await sound.setPositionAsync(0);
  } catch {
    // ignore
  }
  if (soundUri && loadedLocalSoundCache.get(soundUri) === sound) return;
  try {
    await sound.unloadAsync();
  } catch {
    // ignore
  }
}

async function prepareTtsPlaybackMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.warn('[TTS] audio mode setup failed', error instanceof Error ? error.message : String(error));
  }
}

function normalizeCachePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,!?"'`“”‘’]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function hashText(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function generateLocalFilename(text: string, locale: string, voice: string, rate: string): string {
  const normalizedText = normalizeCachePart(text) || 'tts';
  const normalizedVoice = normalizeCachePart(voice || 'default');
  const normalizedLocale = normalizeCachePart(locale || 'default');
  const normalizedRate = normalizeCachePart(rate || 'default');
  const hash = hashText(`${text}|${locale}|${voice}|${rate}`);
  return `${normalizedText}_${normalizedLocale}_${normalizedVoice}_${normalizedRate}_${hash}.mp3`;
}

function getLocalAudioFile(filename: string): FileSystem.File | null {
  const cacheRoot = FileSystem.Paths.cache || FileSystem.Paths.document;
  if (!cacheRoot) return null;
  return new FileSystem.File(cacheRoot, filename);
}

async function rememberLoadedLocalSound(uri: string, sound: CloudSound): Promise<void> {
  if (loadedLocalSoundCache.has(uri)) {
    loadedLocalSoundCache.delete(uri);
  }
  loadedLocalSoundCache.set(uri, sound);

  while (loadedLocalSoundCache.size > MAX_LOADED_LOCAL_SOUNDS) {
    const oldest = loadedLocalSoundCache.entries().next().value as [string, CloudSound] | undefined;
    if (!oldest) return;
    const [oldestUri, oldestSound] = oldest;
    if (oldestUri === activeSoundUri) {
      loadedLocalSoundCache.delete(oldestUri);
      loadedLocalSoundCache.set(oldestUri, oldestSound);
      return;
    }
    loadedLocalSoundCache.delete(oldestUri);
    try {
      await oldestSound.unloadAsync();
    } catch {
      // ignore
    }
  }
}

async function playAudioUri({
  uri,
  shouldKeepLoaded,
  requestId,
  options,
  startedAt,
  edgeElapsedMs,
  sourceLabel,
  text,
}: {
  uri: string;
  shouldKeepLoaded: boolean;
  requestId: number;
  options?: SpeakOptions;
  startedAt: number;
  edgeElapsedMs: number;
  sourceLabel: string;
  text: string;
}): Promise<boolean> {
  if (requestId !== latestPlaybackRequestId) return true;

  let sound = shouldKeepLoaded ? loadedLocalSoundCache.get(uri) : undefined;
  if (sound) {
    loadedLocalSoundCache.delete(uri);
    loadedLocalSoundCache.set(uri, sound);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } else {
    const result = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, progressUpdateIntervalMillis: 120 },
    );
    sound = result.sound;
    if (shouldKeepLoaded) {
      await rememberLoadedLocalSound(uri, sound);
    }
  }

  if (requestId !== latestPlaybackRequestId) {
    try {
      await sound.stopAsync();
      await sound.setPositionAsync(0);
    } catch {
      // ignore
    }
    if (!shouldKeepLoaded) {
      try {
        await sound.unloadAsync();
      } catch {
        // ignore
      }
    }
    return true;
  }

  activeSound = sound;
  activeSoundUri = shouldKeepLoaded ? uri : '';

  console.log('[TTS] playback started', {
    text,
    source: sourceLabel,
    loadElapsedMs: Date.now() - startedAt - edgeElapsedMs,
    totalElapsedMs: Date.now() - startedAt,
  });

  sound.setOnPlaybackStatusUpdate((status: any) => {
    if (!status?.isLoaded) return;
    if (status.didJustFinish && requestId === latestPlaybackRequestId) {
      activeSound = null;
      activeSoundUri = '';
      if (!shouldKeepLoaded) {
        void sound.unloadAsync();
      } else {
        void sound.setPositionAsync(0);
      }
      options?.onDone?.();
    }
  });

  return true;
}

export async function speakViaAzureTtsProxy(text: string, options?: SpeakOptions): Promise<boolean> {
  const requestId = (latestPlaybackRequestId += 1);
  await stopActiveCloudPlayback();
  await prepareTtsPlaybackMode();
  let didShowDownloadState = false;

  const input = text.trim();
  if (!input) {
    options?.onError?.();
    return false;
  }

  try {
    const locale = options?.locale || 'en-US';
    const voice = options?.voice || '';
    const rate = options?.rate || '0%';
    const startedAt = Date.now();
    const localFile = getLocalAudioFile(generateLocalFilename(input, locale, voice, rate));
    const localUri = localFile?.uri || '';
    let playbackUri = '';
    let sourceLabel: 'LOCAL CACHE' | 'STORAGE CACHE' | 'AZURE API' | 'REMOTE FALLBACK' = 'AZURE API';

    if (localUri) {
      if (localAudioFileCache.has(localUri)) {
        playbackUri = localUri;
        sourceLabel = 'LOCAL CACHE';
      } else {
        if (localFile?.exists) {
          localAudioFileCache.add(localUri);
          playbackUri = localUri;
          sourceLabel = 'LOCAL CACHE';
        }
      }
    }

    const endpoint = `${SUPABASE_URL}/functions/v1/${TTS_EDGE_FUNCTION_NAME}`;
    if (!playbackUri) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        options?.onError?.();
        return false;
      }
      const entitlement = await SubscriptionService.getEntitlementSnapshot(user.id);
      if (!entitlement.canUseCloudTTS) {
        Alert.alert(
          '升級解鎖高品質發音',
          '免費版可使用本地 OCR 與手動建卡；雲端語音與快取下載需要試用版或 Premium。'
        );
        options?.onError?.();
        return false;
      }

      options?.onDownloadStart?.();
      didShowDownloadState = true;

      if (!isConfigured()) {
        console.warn('[TTS] missing Supabase TTS configuration');
        options?.onDownloadEnd?.();
        options?.onError?.();
        return false;
      }

      const auth = await getAuthHeader();
      if (!auth) {
        console.warn('[TTS] missing Supabase auth header');
        options?.onDownloadEnd?.();
        options?.onError?.();
        return false;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: auth.Authorization,
          ...(__DEV__ && DEV_BYPASS_ENABLED && DEV_DEFAULT_PLAN === 'premium'
            ? { 'x-nuances-dev-plan': 'premium' }
            : {}),
        },
        body: JSON.stringify({
          text: input,
          locale,
          voice: options?.voice,
          rate,
        }),
      });

      if (!response.ok) {
        console.warn('[TTS] request failed', {
          text: input,
          status: response.status,
          elapsedMs: Date.now() - startedAt,
        });
        options?.onDownloadEnd?.();
        options?.onError?.();
        return false;
      }

      const payload = (await response.json()) as {
        audioUrl?: string;
        audioBase64?: string;
        mimeType?: string;
        cached?: boolean;
      };
      const audioUrl = (payload.audioUrl || '').trim();
      sourceLabel = payload.cached ? 'STORAGE CACHE' : 'AZURE API';

      if (!audioUrl) {
        console.warn('[TTS] missing audioUrl', {
          text: input,
          source: sourceLabel,
          elapsedMs: Date.now() - startedAt,
        });
        options?.onDownloadEnd?.();
        options?.onError?.();
        return false;
      }

      if (localFile) {
        try {
          const download = await FileSystem.File.downloadFileAsync(audioUrl, localFile, {
            idempotent: true,
          });
          playbackUri = download.uri;
          localAudioFileCache.add(playbackUri);
        } catch (downloadError) {
          console.warn('[TTS] local download failed, playing remote audio', {
            text: input,
            error: downloadError instanceof Error ? downloadError.message : String(downloadError),
          });
          playbackUri = audioUrl;
          sourceLabel = 'REMOTE FALLBACK';
        } finally {
          if (didShowDownloadState) {
            options?.onDownloadEnd?.();
            didShowDownloadState = false;
          }
        }
      } else {
        playbackUri = audioUrl;
        sourceLabel = 'REMOTE FALLBACK';
        if (didShowDownloadState) {
          options?.onDownloadEnd?.();
          didShowDownloadState = false;
        }
      }
    }

    const edgeElapsedMs = Date.now() - startedAt;
    console.log(`[TTS] ${sourceLabel}`, {
      text: input,
      voice: voice || '(default)',
      edgeElapsedMs,
    });

    return await playAudioUri({
      uri: playbackUri,
      shouldKeepLoaded: sourceLabel !== 'REMOTE FALLBACK',
      requestId,
      options,
      startedAt,
      edgeElapsedMs,
      sourceLabel,
      text: input,
    });
  } catch (error) {
    if (requestId !== latestPlaybackRequestId) return true;
    if (didShowDownloadState) {
      options?.onDownloadEnd?.();
    }
    console.warn('[TTS] playback failed', {
      text: input,
      error: error instanceof Error ? error.message : String(error),
    });
    options?.onError?.();
    return false;
  }
}

export async function stopAzureTtsPlayback(): Promise<void> {
  await stopActiveCloudPlayback();
}
