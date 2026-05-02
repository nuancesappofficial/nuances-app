import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
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

let activeSound: Audio.Sound | null = null;

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
    const endpoint = `${SUPABASE_URL}/functions/v1/${TTS_EDGE_FUNCTION_NAME}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: auth.Authorization,
      },
      body: JSON.stringify({
        text: input,
        locale: options?.locale || 'en-US',
        voice: options?.voice,
        rate: options?.rate,
      }),
    });

    if (!response.ok) {
      options?.onError?.();
      return false;
    }

    const payload = (await response.json()) as { audioBase64?: string; mimeType?: string };
    const audioBase64 = (payload.audioBase64 || '').trim();
    if (!audioBase64) {
      options?.onError?.();
      return false;
    }

    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDir) {
      options?.onError?.();
      return false;
    }

    const uri = `${baseDir}azure-tts-${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(uri, audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    await stopActiveCloudPlayback();
    const result = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, progressUpdateIntervalMillis: 120 },
    );
    activeSound = result.sound;

    result.sound.setOnPlaybackStatusUpdate((status: any) => {
      if (!status?.isLoaded) return;
      if (status.didJustFinish) {
        void stopActiveCloudPlayback();
        options?.onDone?.();
      }
    });

    return true;
  } catch {
    options?.onError?.();
    return false;
  }
}

export async function stopAzureTtsPlayback(): Promise<void> {
  await stopActiveCloudPlayback();
}
