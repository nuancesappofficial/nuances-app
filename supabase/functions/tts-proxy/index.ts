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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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

  let payload: TtsRequest;
  try {
    payload = (await req.json()) as TtsRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const text = (payload.text || '').trim();
  if (!text) {
    return jsonResponse({ error: 'text is required' }, 400);
  }

  const locale = (payload.locale || 'en-US').trim();
  const voice = (payload.voice || AZURE_TTS_VOICE).trim();
  const rate = (payload.rate || '0%').trim();

  const ssml =
    `<speak version="1.0" xml:lang="${xmlEscape(locale)}">` +
    `<voice name="${xmlEscape(voice)}">` +
    `<prosody rate="${xmlEscape(rate)}">${xmlEscape(text)}</prosody>` +
    `</voice></speak>`;

  try {
    const response = await fetchWithTimeout(
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

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return jsonResponse(
        {
          error: `Azure TTS failed (${response.status})`,
          details: errorText.slice(0, 500),
        },
        502,
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = arrayBufferToBase64(audioBuffer);

    return jsonResponse({
      audioBase64,
      mimeType: 'audio/mpeg',
      locale,
      voice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: 'Azure TTS request failed', details: message }, 502);
  }
});
