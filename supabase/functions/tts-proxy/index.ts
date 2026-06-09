import { getAuthenticatedUserFromAuthorization } from '../ai-proxy/auth/resolveUserFromBearerToken.ts';
import { createServiceRoleClient, resolveServerEntitlement } from '../_shared/entitlement.ts';
import { incrementPostgresRateLimitCounter } from '../_shared/rateLimitStore.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nuances-dev-plan',
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
const AZURE_TTS_MAX_TEXT_CHARS = Number(Deno.env.get('AZURE_TTS_MAX_TEXT_CHARS') ?? '500');
const TTS_RATE_LIMIT_PER_MINUTE = Number(Deno.env.get('TTS_RATE_LIMIT_PER_MINUTE') ?? '30');
const TTS_DAILY_QUOTA = Number(Deno.env.get('TTS_DAILY_QUOTA') ?? '300');
const ALLOW_TTS_WITHOUT_KV = String(Deno.env.get('TTS_ALLOW_WITHOUT_KV') ?? 'false').toLowerCase() === 'true';
const DEV_ENTITLEMENT_BYPASS_ENABLED =
  (Deno.env.get('SUBSCRIPTION_DEV_BYPASS') ?? '').trim().toLowerCase() === 'true';
const ALLOWED_TTS_LOCALES = new Set(
  (Deno.env.get('AZURE_TTS_ALLOWED_LOCALES') ?? 'en-US,en-GB,zh-TW,zh-CN,ja-JP,ko-KR,es-ES,fr-FR')
    .split(',')
    .map((item: string) => item.trim())
    .filter(Boolean)
);
const ALLOWED_TTS_VOICES = new Set(
  (Deno.env.get('AZURE_TTS_ALLOWED_VOICES') ??
    [
      'en-US-AndrewNeural',
      'en-US-JennyNeural',
      'en-US-GuyNeural',
      'en-GB-SoniaNeural',
      'zh-TW-HsiaoChenNeural',
      'zh-CN-XiaoxiaoNeural',
      'ja-JP-NanamiNeural',
      'ko-KR-SunHiNeural',
      'es-ES-ElviraNeural',
      'fr-FR-DeniseNeural',
    ].join(','))
    .split(',')
    .map((item: string) => item.trim())
    .filter(Boolean)
);
const ALLOWED_TTS_RATES = new Set(
  (Deno.env.get('AZURE_TTS_ALLOWED_RATES') ?? '-20%,-10%,0%,+10%,+20%')
    .split(',')
    .map((item: string) => item.trim())
    .filter(Boolean)
);
let kvClient: any | null = null;
let kvInitAttempted = false;

function isProductionRuntime(): boolean {
  const runtimeEnv = (
    Deno.env.get('APP_ENV') ??
    Deno.env.get('ENVIRONMENT') ??
    Deno.env.get('NODE_ENV') ??
    Deno.env.get('SUPABASE_ENV') ??
    ''
  ).trim().toLowerCase();
  return ['prod', 'production'].includes(runtimeEnv);
}

function canUseDevEntitlementBypass(): boolean {
  if (!DEV_ENTITLEMENT_BYPASS_ENABLED) return false;
  if (isProductionRuntime()) {
    console.error('[tts-proxy] SUBSCRIPTION_DEV_BYPASS is enabled in production; ignoring bypass header');
    return false;
  }
  return true;
}

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

async function getKvClient(): Promise<any | null> {
  if (kvInitAttempted) return kvClient;
  kvInitAttempted = true;
  try {
    if (typeof Deno?.openKv !== 'function') {
      console.warn('[tts-proxy] Deno KV is unavailable; TTS limits disabled by runtime');
      kvClient = null;
      return kvClient;
    }
    kvClient = await Deno.openKv();
    return kvClient;
  } catch (error) {
    console.error('[tts-proxy] Failed to initialize Deno KV', error);
    kvClient = null;
    return kvClient;
  }
}

async function incrementCounter(
  kv: any,
  key: readonly unknown[],
  expireInMs: number
): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await kv.get(key);
    const currentValue = (current.value as number | null) ?? 0;
    const nextValue = currentValue + 1;
    const committed = await kv.atomic()
      .check(current)
      .set(key, nextValue, { expireIn: expireInMs })
      .commit();
    if (committed.ok) return nextValue;
  }
  throw new Error('Counter update conflict');
}

async function enforceTtsLimits(userId: string): Promise<Response | null> {
  const kv = await getKvClient();
  const now = new Date();
  const minuteBucket = now.toISOString().slice(0, 16);
  const dayBucket = now.toISOString().slice(0, 10);
  const increment = async (bucket: string, bucketKey: string, expireInMs: number) => {
    if (kv) {
      return incrementCounter(kv, ['tts-rate', userId, bucket, bucketKey], expireInMs);
    }
    const supabase = createServiceRoleClient();
    return incrementPostgresRateLimitCounter({
      supabase,
      service: 'tts-proxy',
      userId,
      bucket,
      bucketKey,
      expireInMs,
    });
  };

  if (!kv) {
    console.warn('[tts-proxy] KV unavailable; using Postgres rate-limit fallback');
  }

  try {
    const minuteCount = await increment(
      'minute',
      minuteBucket,
      2 * 60 * 1000
    );
    if (minuteCount > TTS_RATE_LIMIT_PER_MINUTE) {
      return jsonResponse(
        {
          error: 'Rate limit exceeded',
          limit: TTS_RATE_LIMIT_PER_MINUTE,
          bucket: 'minute',
        },
        429
      );
    }

    const dayCount = await increment(
      'day',
      dayBucket,
      2 * 24 * 60 * 60 * 1000
    );
    if (dayCount > TTS_DAILY_QUOTA) {
      return jsonResponse(
        {
          error: 'Daily quota exceeded',
          limit: TTS_DAILY_QUOTA,
          bucket: 'day',
        },
        429
      );
    }

    return null;
  } catch (error) {
    if (ALLOW_TTS_WITHOUT_KV) {
      console.warn('[tts-proxy] Rate limit store unavailable; allowing request due to TTS_ALLOW_WITHOUT_KV=true', error);
      return null;
    }
    console.error('[tts-proxy] Rate limit store unavailable', error);
    return jsonResponse(
      {
        error: 'Service temporarily unavailable',
        reason: 'rate_limit_store_unavailable',
      },
      503
    );
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

  const supabase = createServiceRoleClient();

  const authUser = await getAuthenticatedUserFromAuthorization(req);
  const userId = authUser?.id ?? null;
  if (!userId) {
    return jsonResponse({ error: 'Unauthorized: missing valid JWT' }, 401);
  }

  const devPlan = (req.headers.get('x-nuances-dev-plan') ?? '').trim().toLowerCase();
  const entitlement =
    canUseDevEntitlementBypass() && devPlan === 'premium'
      ? { planType: 'premium' }
      : await resolveServerEntitlement({ supabase, userId, user: authUser });
  if (entitlement.planType === 'free') {
    return jsonResponse(
      {
        error: 'Premium or active trial required',
        reason: 'premium_required',
        planType: 'free',
        paywallType: 'tts',
      },
      403
    );
  }

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
  if (rawText.length > AZURE_TTS_MAX_TEXT_CHARS) {
    return jsonResponse(
      {
        error: 'text is too long',
        maxChars: AZURE_TTS_MAX_TEXT_CHARS,
      },
      400
    );
  }

  const normalizedText = normalizeText(rawText);
  if (!normalizedText) {
    return jsonResponse({ error: 'text is empty after normalization' }, 400);
  }

  const locale = (payload.locale || 'en-US').trim();
  const resolvedVoice = (payload.voice || AZURE_TTS_VOICE).trim();
  const rate = (payload.rate || '0%').trim();
  if (!ALLOWED_TTS_LOCALES.has(locale)) {
    return jsonResponse({ error: 'Unsupported locale' }, 400);
  }
  if (!ALLOWED_TTS_VOICES.has(resolvedVoice)) {
    return jsonResponse({ error: 'Unsupported voice' }, 400);
  }
  if (!ALLOWED_TTS_RATES.has(rate)) {
    return jsonResponse({ error: 'Unsupported rate' }, 400);
  }

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

    const limitsError = await enforceTtsLimits(userId);
    if (limitsError) {
      return limitsError;
    }

    console.log('[tts-proxy] cache miss -> calling azure', {
      phrase: normalizedText,
      voice: resolvedVoice,
    });

    const ssml =
      `<speak version="1.0" xml:lang="${xmlEscape(locale)}">` +
      `<voice name="${xmlEscape(resolvedVoice)}">` +
      `<prosody rate="${xmlEscape(rate)}">${xmlEscape(rawText)}</prosody>` +
      '</voice></speak>';

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
