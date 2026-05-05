import { Audio } from 'expo-av';
import { supabase } from '@services/supabase/client';

type SpeakOptions = {
  locale?: string;
  voice?: string;
  rate?: string;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};

const TTS_EDGE_FUNCTION_NAME = process.env.EXPO_PUBLIC_TTS_EDGE_FUNCTION_NAME || 'tts-proxy';
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

let activeSound: Awaited<ReturnType<typeof Audio.Sound.createAsync>>['sound'] | null = null;
const sessionAudioUrlCache = new Map<string, string>();

function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function getAuthHeader(): Promise<{ Authorization: string } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token?.trim();
  if (!accessToken) return null;
  return { Authorization: `Bearer ${accessToken}` };
}

async function stopActiveCloudPlayback(): Promise<void> {
  if (!activeSound) return;
  try {
    await activeSound.stopAsync();
  } catch {
    // ignore
  }
  try {
    await activeSound.unloadAsync();
  } catch {
    // ignore
  }
  activeSound = null;
}

export async function speakViaAzureTtsProxy(text: string, options?: SpeakOptions): Promise<boolean> {
  const input = text.trim();
  if (!input) {
    options?.onError?.();
    return false;
  }
  if (!isConfigured()) {
    options?.onError?.();
    return false;
  }

  const auth = await getAuthHeader();
  if (!auth) {
    options?.onError?.();
    return false;
  }

  try {
    const locale = options?.locale || 'en-US';
    const voice = options?.voice || '';
    const rate = options?.rate || '0%';
    const cacheKey = `${input.toLowerCase().replace(/[.,!?"'\`“”‘’]/g, ' ').replace(/\s+/g, ' ').trim()}|${locale}|${voice}|${rate}`;
    const startedAt = Date.now();
    let audioUrl = sessionAudioUrlCache.get(cacheKey) || '';
    let sourceLabel: 'MEMORY CACHE' | 'STORAGE CACHE' | 'AZURE API' = audioUrl ? 'MEMORY CACHE' : 'AZURE API';

    const endpoint = `${SUPABASE_URL}/functions/v1/${TTS_EDGE_FUNCTION_NAME}`;
    if (!audioUrl) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: auth.Authorization,
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
        options?.onError?.();
        return false;
      }

      const payload = (await response.json()) as {
        audioUrl?: string;
        audioBase64?: string;
        mimeType?: string;
        cached?: boolean;
      };
      audioUrl = (payload.audioUrl || '').trim();
      sourceLabel = payload.cached ? 'STORAGE CACHE' : 'AZURE API';
      if (audioUrl) {
        sessionAudioUrlCache.set(cacheKey, audioUrl);
      }
    }

    if (!audioUrl) {
      console.warn('[TTS] missing audioUrl', {
        text: input,
        source: sourceLabel,
        elapsedMs: Date.now() - startedAt,
      });
      options?.onError?.();
      return false;
    }

    const edgeElapsedMs = Date.now() - startedAt;
    console.log(`[TTS] ${sourceLabel}`, {
      text: input,
      voice: voice || '(default)',
      edgeElapsedMs,
    });

    await stopActiveCloudPlayback();
    const result = await Audio.Sound.createAsync(
      { uri: audioUrl },
      { shouldPlay: true, progressUpdateIntervalMillis: 120 },
    );
    console.log('[TTS] playback started', {
      text: input,
      source: sourceLabel,
      loadElapsedMs: Date.now() - startedAt - edgeElapsedMs,
      totalElapsedMs: Date.now() - startedAt,
    });
    activeSound = result.sound;

    result.sound.setOnPlaybackStatusUpdate((status: any) => {
      if (!status?.isLoaded) return;
      if (status.didJustFinish) {
        void stopActiveCloudPlayback();
        options?.onDone?.();
      }
    });

    return true;
  } catch (error) {
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
