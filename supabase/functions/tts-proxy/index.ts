import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function xmlEscape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[.,!?"'`“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type TtsRequest = {
  text?: string;
  locale?: string;
  voice?: string;
  rate?: string;
};

const AZURE_TTS_KEY = (Deno.env.get('AZURE_TTS_KEY') ?? Deno.env.get('AZURE_SPEECH_KEY') ?? '').trim();
const AZURE_TTS_REGION = (Deno.env.get('AZURE_TTS_REGION') ?? Deno.env.get('AZURE_SPEECH_REGION') ?? '').trim();
const AZURE_TTS_VOICE = (Deno.env.get('AZURE_TTS_VOICE') ?? 'en-US-AndrewNeural').trim();
const AZURE_TTS_ENDPOINT = (Deno.env.get('AZURE_TTS_ENDPOINT') ?? '').trim();
const AZURE_TTS_TIMEOUT_MS = Number(Deno.env.get('AZURE_TTS_TIMEOUT_MS') ?? '15000');

function resolveTtsEndpoint(region: string, endpoint: string): string {
  if (endpoint) {
    return endpoint.replace(/\/+$/, '');
  }
  if (!region) {
    return '';
  }
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!AZURE_TTS_KEY) {
    return jsonResponse({ error: 'Missing AZURE_TTS_KEY' }, 500);
  }

  const endpoint = resolveTtsEndpoint(AZURE_TTS_REGION, AZURE_TTS_ENDPOINT);
  if (!endpoint) {
    return jsonResponse({ error: 'Missing AZURE_TTS_REGION or AZURE_TTS_ENDPOINT' }, 500);
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: TtsRequest;
  try {
    payload = (await req.json()) as TtsRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const rawText = (payload.text || '').trim();
  if (!rawText) {
    return jsonResponse({ error: 'text is required' }, 400);
  }

  const normalizedText = normalizeText(rawText);
  if (!normalizedText) {
    return jsonResponse({ error: 'text is empty after normalization' }, 400);
  }

  const locale = (payload.locale || 'en-US').trim();
  const resolvedVoice = (payload.voice || AZURE_TTS_VOICE).trim();
  const rate = (payload.rate || '0%').trim();

  try {
    const { data: cacheHit, error: selectError } = await supabase
      .from('cached_pronunciations')
      .select('audio_url')
      .eq('phrase', normalizedText)
      .eq('voice', resolvedVoice)
      .maybeSingle();

    if (selectError) {
      console.warn('[tts-proxy] cache lookup failed; falling back to azure', {
        phrase: normalizedText,
        voice: resolvedVoice,
        error: selectError.message,
      });
    }

    if (!selectError && cacheHit?.audio_url) {
      console.log('[tts-proxy] cache hit', {
        phrase: normalizedText,
        voice: resolvedVoice,
      });
      return jsonResponse({ audioUrl: cacheHit.audio_url, cached: true });
    }

    console.log('[tts-proxy] cache miss -> calling azure', {
      phrase: normalizedText,
      voice: resolvedVoice,
    });

    const ssml =
      `<speak version="1.0" xml:lang="${xmlEscape(locale)}">` +
      `<voice name="${xmlEscape(resolvedVoice)}">` +
      `<prosody rate="${xmlEscape(rate)}">${xmlEscape(rawText)}</prosody>` +
      `</voice></speak>`;

    const ttsResponse = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_TTS_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
          'User-Agent': 'nuances-tts-proxy',
        },
        body: ssml,
      },
      AZURE_TTS_TIMEOUT_MS,
    );

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text().catch(() => '');
      return jsonResponse(
        {
          error: `Azure TTS failed (${ttsResponse.status})`,
          details: errorText.slice(0, 500),
        },
        502,
      );
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    const safeStem = normalizedText
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 80) || 'tts';
    const safeVoice = resolvedVoice
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 60) || 'voice';
    const fileName = `${safeStem}_${safeVoice}_${Date.now()}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from('audio_cache')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      return jsonResponse(
        {
          error: 'Storage upload failed',
          details: uploadError.message.slice(0, 300),
        },
        502,
      );
    }

    const { data: publicData } = supabase.storage.from('audio_cache').getPublicUrl(fileName);
    const publicUrl = (publicData?.publicUrl || '').trim();
    if (!publicUrl) {
      return jsonResponse({ error: 'Failed to resolve public URL' }, 502);
    }

    const { error: insertError } = await supabase.from('cached_pronunciations').insert({
      phrase: normalizedText,
      voice: resolvedVoice,
      audio_url: publicUrl,
    });

    if (insertError) {
      return jsonResponse(
        {
          error: 'DB insert failed',
          details: insertError.message.slice(0, 300),
        },
        502,
      );
    }

    console.log('[tts-proxy] azure audio cached', {
      phrase: normalizedText,
      voice: resolvedVoice,
      fileName,
    });

    return jsonResponse({ audioUrl: publicUrl, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: 'Azure TTS request failed', details: message }, 502);
  }
});
