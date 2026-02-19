// Supabase Edge Function: ai-proxy
// Securely proxies AI requests so API keys never live in the mobile app.
declare const Deno: any;

type Provider = 'openai' | 'gemini';

type RequestBody = {
  provider: Provider;
  messages: { role: string; content: unknown }[];
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  };
};

type JwtPayload = {
  sub?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RATE_LIMIT_PER_MINUTE = Number(
  Deno.env.get('AI_RATE_LIMIT_PER_MINUTE') ?? '20'
);
const DAILY_QUOTA = Number(Deno.env.get('AI_DAILY_QUOTA') ?? '200');
const kv = await Deno.openKv();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64UrlToJson(input: string): JwtPayload {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (input.length % 4)) % 4);
  const decoded = atob(padded);
  return JSON.parse(decoded) as JwtPayload;
}

function getUserIdFromAuthorization(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const payload = base64UrlToJson(parts[1]);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function toGeminiContents(messages: RequestBody['messages']) {
  const contents = messages.map((msg) => ({
    role: msg.role === 'system' ? 'user' : msg.role,
    parts: [{ text: String(msg.content ?? '') }],
  }));

  if (messages[0]?.role === 'system' && messages.length > 1) {
    contents[0] = {
      role: 'user',
      parts: [
        {
          text: `[System Instructions]\n${String(
            messages[0].content ?? ''
          )}\n\n[User Query]\n${String(messages[1].content ?? '')}`,
        },
      ],
    };
    contents.splice(1, 1);
  }

  return contents;
}

async function incrementCounter(
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
    if (committed.ok) {
      return nextValue;
    }
  }
  throw new Error('Counter update conflict');
}

async function enforceLimits(userId: string): Promise<Response | null> {
  const now = new Date();
  const minuteBucket = `${now.toISOString().slice(0, 16)}`;
  const dayBucket = now.toISOString().slice(0, 10);

  const minuteCount = await incrementCounter(
    ['ai-rate', userId, minuteBucket],
    2 * 60 * 1000
  );
  if (minuteCount > RATE_LIMIT_PER_MINUTE) {
    return jsonResponse(
      {
        error: 'Rate limit exceeded',
        limit: RATE_LIMIT_PER_MINUTE,
        bucket: 'minute',
      },
      429
    );
  }

  const dayCount = await incrementCounter(
    ['ai-quota', userId, dayBucket],
    2 * 24 * 60 * 60 * 1000
  );
  if (dayCount > DAILY_QUOTA) {
    return jsonResponse(
      {
        error: 'Daily quota exceeded',
        limit: DAILY_QUOTA,
        bucket: 'day',
      },
      429
    );
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = getUserIdFromAuthorization(req);
    if (!userId) {
      return jsonResponse({ error: 'Unauthorized: missing valid JWT' }, 401);
    }

    const limitsError = await enforceLimits(userId);
    if (limitsError) return limitsError;

    const body = (await req.json()) as RequestBody;
    const provider = body.provider;
    const options = body.options || {};

    if (!provider || !Array.isArray(body.messages) || body.messages.length === 0) {
      return jsonResponse(
        { error: 'Invalid payload: provider/messages required' },
        400
      );
    }

    if (provider === 'openai') {
      const apiKey = Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('Missing OPENAI_API_KEY in Edge Function secrets');
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || 'gpt-4o-mini',
          messages: body.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1000,
          ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return jsonResponse(
          {
            error:
              (data as { error?: { message?: string } })?.error?.message
              || 'OpenAI request failed',
            status: response.status,
          },
          502
        );
      }

      const content = (
        data as { choices?: { message?: { content?: string } }[] }
      )?.choices?.[0]?.message?.content || '';

      return jsonResponse({ content });
    }

    if (provider === 'gemini') {
      const apiKey = Deno.env.get('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('Missing GEMINI_API_KEY in Edge Function secrets');
      }

      const model = options.model || 'gemini-2.0-flash-lite';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: toGeminiContents(body.messages),
            generationConfig: {
              temperature: options.temperature ?? 0.7,
              maxOutputTokens: options.maxTokens ?? 1000,
            },
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return jsonResponse(
          {
            error: (data as { error?: { message?: string } })?.error?.message
              || 'Gemini request failed',
            status: response.status,
          },
          502
        );
      }

      const content = (
        data as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        }
      )?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return jsonResponse({ content });
    }

    return jsonResponse({ error: 'Unsupported provider' }, 400);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unexpected error',
      },
      500
    );
  }
});
