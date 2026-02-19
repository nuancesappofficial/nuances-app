// Supabase Edge Function: ai-proxy
// Securely proxies AI requests so API keys never live in the mobile app.
declare const Deno: any;

type Provider = 'openai' | 'gemini';
type Action = 'analyze_text' | 'generate_card' | 'analyze_context';

type LegacyRequestBody = {
  provider: Provider;
  messages: { role: string; content: unknown }[];
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  };
};

type AnalyzeTextPayload = {
  text: string;
  userKeywords?: string;
  learningGoal?: 'ielts' | 'casual' | 'professional' | string;
};

type GenerateCardPayload = {
  targetWord: string;
  originalSentence: string;
  learningGoal?: 'ielts' | 'casual' | 'professional' | string;
};

type AnalyzeContextPayload = {
  targetText: string;
  originalSentence: string;
  contextText?: string;
};

type ActionRequestBody = {
  action: Action;
  payload: AnalyzeTextPayload | GenerateCardPayload | AnalyzeContextPayload;
};

type RequestBody = LegacyRequestBody | ActionRequestBody;

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

const MAX_TEXT_CHARS = Number(Deno.env.get('AI_MAX_TEXT_CHARS') ?? '2000');
const MAX_SENTENCE_CHARS = Number(
  Deno.env.get('AI_MAX_SENTENCE_CHARS') ?? '600'
);
const MAX_WORD_CHARS = Number(Deno.env.get('AI_MAX_WORD_CHARS') ?? '64');
const MAX_KEYWORDS_CHARS = Number(
  Deno.env.get('AI_MAX_KEYWORDS_CHARS') ?? '200'
);

const MAX_TOKENS_ANALYZE = Number(
  Deno.env.get('AI_MAX_TOKENS_ANALYZE') ?? '260'
);
const MAX_TOKENS_GENERATE = Number(
  Deno.env.get('AI_MAX_TOKENS_GENERATE') ?? '700'
);
const MAX_TOKENS_CONTEXT = Number(
  Deno.env.get('AI_MAX_TOKENS_CONTEXT') ?? '500'
);
const MAX_TOKENS_LEGACY = Number(Deno.env.get('AI_MAX_TOKENS_LEGACY') ?? '900');

const OPENAI_ALLOWED_MODELS = (Deno.env.get('OPENAI_ALLOWED_MODELS')
  ?? 'gpt-4o-mini')
  .split(',')
  .map((item: string) => item.trim())
  .filter(Boolean);

const GEMINI_ALLOWED_MODELS = (Deno.env.get('GEMINI_ALLOWED_MODELS')
  ?? 'gemini-2.0-flash-lite,gemini-3-flash-preview')
  .split(',')
  .map((item: string) => item.trim())
  .filter(Boolean);

const kv = await Deno.openKv();

const GOAL_INSTRUCTIONS: Record<string, string> = {
  ielts:
    'Focus on academic vocabulary suitable for IELTS exam (band 6-9). Prioritize formal and academic words.',
  casual:
    'Focus on conversational vocabulary, idioms, and practical daily expressions.',
  professional:
    'Focus on business and workplace terminology with practical professional usage.',
};

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

function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

function clampTokens(value: unknown, maxAllowed: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return maxAllowed;
  return Math.max(1, Math.min(Math.floor(value), maxAllowed));
}

function pickModel(
  requested: unknown,
  allowed: string[],
  fallback: string
): string {
  if (typeof requested === 'string' && allowed.includes(requested)) {
    return requested;
  }
  return fallback;
}

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
}

function extractJsonObject(raw: string): string {
  const cleaned = stripMarkdownFences(raw);
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : cleaned;
}

function parseJson<T>(raw: string): T {
  return JSON.parse(extractJsonObject(raw)) as T;
}

function toGeminiContents(messages: LegacyRequestBody['messages']) {
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

async function callOpenAIChat(params: {
  model?: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens: number;
  jsonMode?: boolean;
}): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in Edge Function secrets');
  }

  const model = pickModel(
    params.model,
    OPENAI_ALLOWED_MODELS,
    OPENAI_ALLOWED_MODELS[0]
  );

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      temperature: params.temperature ?? 0.5,
      max_tokens: params.maxTokens,
      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      (data as { error?: { message?: string } })?.error?.message
        || `OpenAI request failed (${response.status})`
    );
  }

  return (
    (data as { choices?: { message?: { content?: string } }[] })
      ?.choices?.[0]?.message?.content || ''
  );
}

async function callGeminiLegacy(params: {
  model?: string;
  messages: LegacyRequestBody['messages'];
  temperature?: number;
  maxTokens: number;
}): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY in Edge Function secrets');
  }

  const model = pickModel(
    params.model,
    GEMINI_ALLOWED_MODELS,
    GEMINI_ALLOWED_MODELS[0]
  );
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: toGeminiContents(params.messages),
        generationConfig: {
          temperature: params.temperature ?? 0.7,
          maxOutputTokens: params.maxTokens,
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      (data as { error?: { message?: string } })?.error?.message
        || `Gemini request failed (${response.status})`
    );
  }

  return (
    (data as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    })?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  );
}

async function handleAnalyzeText(payload: AnalyzeTextPayload): Promise<Response> {
  const text = sanitizeText(payload.text, MAX_TEXT_CHARS);
  const userKeywords = sanitizeText(payload.userKeywords, MAX_KEYWORDS_CHARS);
  const learningGoal = sanitizeText(payload.learningGoal, 32) || 'ielts';

  if (!text) {
    return jsonResponse({ error: 'text is required' }, 400);
  }

  const goalInstruction = GOAL_INSTRUCTIONS[learningGoal] || GOAL_INSTRUCTIONS.ielts;

  const prompt = `Analyze the following English text and extract 3-5 key vocabulary words that a language learner should focus on.

${goalInstruction}
${userKeywords ? `User has expressed interest in: "${userKeywords}". Prioritize these if they appear in the text.` : ''}

Text: "${text}"

Return JSON only:
{"keywords":["word1","word2","word3"],"suggestedWord":"word1"}`;

  const content = await callOpenAIChat({
    messages: [
      {
        role: 'system',
        content:
          'You are an English vocabulary coach. Respond with strict JSON only.',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: MAX_TOKENS_ANALYZE,
    temperature: 0.4,
    jsonMode: true,
  });

  const parsed = parseJson<{ keywords?: string[]; suggestedWord?: string | null }>(
    content
  );
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.filter((item) => typeof item === 'string').slice(0, 5)
    : [];
  const suggestedWord = typeof parsed.suggestedWord === 'string'
    ? parsed.suggestedWord
    : keywords[0] ?? null;

  return jsonResponse({
    result: {
      keywords,
      suggestedWord,
    },
  });
}

async function handleGenerateCard(payload: GenerateCardPayload): Promise<Response> {
  const targetWord = sanitizeText(payload.targetWord, MAX_WORD_CHARS);
  const originalSentence = sanitizeText(payload.originalSentence, MAX_SENTENCE_CHARS);
  const learningGoal = sanitizeText(payload.learningGoal, 32) || 'ielts';

  if (!targetWord || !originalSentence) {
    return jsonResponse(
      { error: 'targetWord and originalSentence are required' },
      400
    );
  }

  const contextHint = GOAL_INSTRUCTIONS[learningGoal] || GOAL_INSTRUCTIONS.ielts;
  const prompt = `Create a vocabulary learning card for "${targetWord}" in:
"${originalSentence}"

Learning context:
${contextHint}

Return JSON only:
{
  "definition":"Traditional Chinese definition plus short English explanation in parentheses",
  "contextualExplanation":"2-3 Traditional Chinese sentences about usage in this sentence",
  "phoneticTranscription":"IPA string or null",
  "tags":["IELTS","Academic"]
}`;

  const content = await callOpenAIChat({
    messages: [
      {
        role: 'system',
        content:
          'You are an expert bilingual English teacher. Return strict JSON only.',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: MAX_TOKENS_GENERATE,
    temperature: 0.6,
    jsonMode: true,
  });

  const parsed = parseJson<{
    definition?: string;
    contextualExplanation?: string;
    phoneticTranscription?: string | null;
    tags?: string[];
  }>(content);

  return jsonResponse({
    result: {
      definition: sanitizeText(parsed.definition, 2000),
      contextualExplanation: sanitizeText(parsed.contextualExplanation, 2000),
      phoneticTranscription:
        typeof parsed.phoneticTranscription === 'string'
          ? sanitizeText(parsed.phoneticTranscription, 120)
          : null,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags
          .filter((item) => typeof item === 'string')
          .map((item) => sanitizeText(item, 40))
          .filter(Boolean)
          .slice(0, 8)
        : [],
    },
  });
}

async function handleAnalyzeContext(payload: AnalyzeContextPayload): Promise<Response> {
  const targetText = sanitizeText(payload.targetText, MAX_WORD_CHARS);
  const originalSentence = sanitizeText(payload.originalSentence, MAX_SENTENCE_CHARS);
  const contextText = sanitizeText(payload.contextText, MAX_SENTENCE_CHARS);

  if (!targetText || !originalSentence) {
    return jsonResponse(
      { error: 'targetText and originalSentence are required' },
      400
    );
  }

  const prompt = `For language learning, analyze "${targetText}" in sentence:
"${originalSentence}"

Context around target:
"${contextText}"

Return JSON only:
{
  "keyword":"target word",
  "definition":"Traditional Chinese explanation",
  "example":"short example sentence",
  "tags":["Vocabulary"],
  "pronunciation":"IPA or null"
}`;

  const content = await callOpenAIChat({
    messages: [
      {
        role: 'system',
        content:
          'You are a language learning assistant. Return strict JSON only.',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: MAX_TOKENS_CONTEXT,
    temperature: 0.5,
    jsonMode: true,
  });

  const parsed = parseJson<{
    keyword?: string;
    definition?: string;
    example?: string;
    tags?: string[];
    pronunciation?: string | null;
  }>(content);

  return jsonResponse({
    result: {
      keyword: sanitizeText(parsed.keyword || targetText, MAX_WORD_CHARS),
      definition: sanitizeText(parsed.definition, 2000),
      example: sanitizeText(parsed.example || originalSentence, 1200),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags
          .filter((item) => typeof item === 'string')
          .map((item) => sanitizeText(item, 40))
          .filter(Boolean)
          .slice(0, 8)
        : [],
      pronunciation:
        typeof parsed.pronunciation === 'string'
          ? sanitizeText(parsed.pronunciation, 120)
          : null,
    },
  });
}

function isActionRequest(body: RequestBody): body is ActionRequestBody {
  return typeof (body as ActionRequestBody).action === 'string';
}

function isLegacyRequest(body: RequestBody): body is LegacyRequestBody {
  return typeof (body as LegacyRequestBody).provider === 'string';
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

    if (isActionRequest(body)) {
      if (body.action === 'analyze_text') {
        return await handleAnalyzeText(body.payload as AnalyzeTextPayload);
      }
      if (body.action === 'generate_card') {
        return await handleGenerateCard(body.payload as GenerateCardPayload);
      }
      if (body.action === 'analyze_context') {
        return await handleAnalyzeContext(body.payload as AnalyzeContextPayload);
      }
      return jsonResponse({ error: 'Unsupported action' }, 400);
    }

    // Backward-compatible legacy mode (kept for temporary compatibility).
    if (isLegacyRequest(body)) {
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return jsonResponse(
          { error: 'Invalid payload: provider/messages required' },
          400
        );
      }

      const options = body.options || {};
      const maxTokens = clampTokens(options.maxTokens, MAX_TOKENS_LEGACY);

      if (body.provider === 'openai') {
        const content = await callOpenAIChat({
          model: options.model,
          messages: body.messages.map((msg) => ({
            role: String(msg.role),
            content: sanitizeText(msg.content, MAX_TEXT_CHARS),
          })),
          temperature:
            typeof options.temperature === 'number' ? options.temperature : 0.7,
          maxTokens,
          jsonMode: options.jsonMode,
        });
        return jsonResponse({ content });
      }

      if (body.provider === 'gemini') {
        const content = await callGeminiLegacy({
          model: options.model,
          messages: body.messages.map((msg) => ({
            role: String(msg.role),
            content: sanitizeText(msg.content, MAX_TEXT_CHARS),
          })),
          temperature:
            typeof options.temperature === 'number' ? options.temperature : 0.7,
          maxTokens,
        });
        return jsonResponse({ content });
      }
    }

    return jsonResponse({ error: 'Invalid payload' }, 400);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unexpected error',
      },
      500
    );
  }
});
