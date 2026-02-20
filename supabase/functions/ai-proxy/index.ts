// Supabase Edge Function: ai-proxy
// Securely proxies AI requests so API keys never live in the mobile app.
declare const Deno: any;

type Provider = 'openai' | 'gemini';
type Action =
  | 'analyze_text'
  | 'generate_card'
  | 'analyze_context'
  | 'usage_summary';

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
  proficiencyStandard?: string;
  proficiencyLevel?: string;
  domain?: string;
  tone?: string;
};

type GenerateCardPayload = {
  targetWord: string;
  originalSentence: string;
  learningGoal?: 'ielts' | 'casual' | 'professional' | string;
  proficiencyStandard?: string;
  proficiencyLevel?: string;
  domain?: string;
  tone?: string;
};

type AnalyzeContextPayload = {
  targetText: string;
  originalSentence: string;
  contextText?: string;
  learningGoal?: 'ielts' | 'casual' | 'professional' | string;
  proficiencyStandard?: string;
  proficiencyLevel?: string;
  domain?: string;
  tone?: string;
};

type UsageSummaryPayload = {
  day?: string;
  includeRecent?: boolean;
  limit?: number;
};

type ActionRequestBody = {
  action: Action;
  payload?:
    | AnalyzeTextPayload
    | GenerateCardPayload
    | AnalyzeContextPayload
    | UsageSummaryPayload;
};

type RequestBody = LegacyRequestBody | ActionRequestBody;

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
const USAGE_RETENTION_DAYS = Number(Deno.env.get('AI_USAGE_RETENTION_DAYS') ?? '14');
const USAGE_RECENT_LIMIT_MAX = Number(
  Deno.env.get('AI_USAGE_RECENT_LIMIT_MAX') ?? '50'
);
// Default to fail-open for compatibility because some hosted runtimes
// do not provide Deno KV for Edge Functions.
const ALLOW_BILLABLE_WITHOUT_KV = String(
  Deno.env.get('AI_ALLOW_BILLABLE_WITHOUT_KV') ?? 'true'
).toLowerCase() === 'true';

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

let kvClient: any | null = null;
let kvInitAttempted = false;

async function getKvClient(): Promise<any | null> {
  if (kvInitAttempted) return kvClient;
  kvInitAttempted = true;

  try {
    if (typeof Deno?.openKv !== 'function') {
      console.warn('[ai-proxy] Deno KV is unavailable in this runtime; limits/usage tracking disabled');
      kvClient = null;
      return kvClient;
    }
    kvClient = await Deno.openKv();
    return kvClient;
  } catch (error) {
    console.error('[ai-proxy] Failed to initialize Deno KV; limits/usage tracking disabled', error);
    kvClient = null;
    return kvClient;
  }
}
const SUPPORTED_ACTIONS = new Set<Action>([
  'analyze_text',
  'generate_card',
  'analyze_context',
  'usage_summary',
]);
const BILLABLE_ACTIONS = new Set<Action>([
  'analyze_text',
  'generate_card',
  'analyze_context',
]);

const GOAL_INSTRUCTIONS: Record<string, string> = {
  ielts:
    'Focus on academic vocabulary suitable for IELTS exam (band 6-9). Prioritize formal and academic words.',
  casual:
    'Focus on conversational vocabulary, idioms, and practical daily expressions.',
  professional:
    'Focus on business and workplace terminology with practical professional usage.',
};

function buildPersonalizationInstruction(options: {
  proficiencyStandard?: string;
  proficiencyLevel?: string;
  domain?: string;
  tone?: string;
}): string {
  const parts: string[] = [];
  if (options.proficiencyStandard) {
    parts.push(`English proficiency standard: ${options.proficiencyStandard}`);
  }
  if (options.proficiencyLevel) {
    parts.push(`English proficiency target range: ${options.proficiencyLevel}`);
  }
  if (options.domain) {
    parts.push(`Domain focus: ${options.domain}`);
  }
  if (options.tone) {
    parts.push(`Explanation tone: ${options.tone}`);
  }
  return parts.length > 0 ? parts.join('\n') : '';
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

async function resolveUserIdViaSupabaseAuth(
  req: Request,
  token: string
): Promise<string | null> {
  const requestUrl = new URL(req.url);
  const supabaseOrigin = requestUrl.origin;
  const reqApiKey = req.headers.get('apikey');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = reqApiKey || supabaseAnonKey || supabaseServiceRoleKey;
  if (!supabaseOrigin || !apiKey) return null;

  try {
    const response = await fetch(`${supabaseOrigin}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.id === 'string' && payload.id.trim()) {
      return payload.id;
    }
    return null;
  } catch {
    return null;
  }
}

async function getUserIdFromAuthorization(req: Request): Promise<string | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  // Always verify bearer token via Supabase Auth service.
  return await resolveUserIdViaSupabaseAuth(req, token);
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateAnalyzeTextPayload(payload: unknown): string[] {
  if (!isObject(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    errors.push('payload.text is required and must be a non-empty string');
  }
  if (
    payload.userKeywords !== undefined &&
    typeof payload.userKeywords !== 'string'
  ) {
    errors.push('payload.userKeywords must be a string when provided');
  }
  if (
    payload.learningGoal !== undefined &&
    typeof payload.learningGoal !== 'string'
  ) {
    errors.push('payload.learningGoal must be a string when provided');
  }
  if (
    payload.proficiencyStandard !== undefined &&
    typeof payload.proficiencyStandard !== 'string'
  ) {
    errors.push('payload.proficiencyStandard must be a string when provided');
  }
  if (
    payload.proficiencyLevel !== undefined &&
    typeof payload.proficiencyLevel !== 'string'
  ) {
    errors.push('payload.proficiencyLevel must be a string when provided');
  }
  if (payload.domain !== undefined && typeof payload.domain !== 'string') {
    errors.push('payload.domain must be a string when provided');
  }
  if (payload.tone !== undefined && typeof payload.tone !== 'string') {
    errors.push('payload.tone must be a string when provided');
  }
  return errors;
}

function validateGenerateCardPayload(payload: unknown): string[] {
  if (!isObject(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  if (typeof payload.targetWord !== 'string' || !payload.targetWord.trim()) {
    errors.push('payload.targetWord is required and must be a non-empty string');
  }
  if (
    typeof payload.originalSentence !== 'string' ||
    !payload.originalSentence.trim()
  ) {
    errors.push(
      'payload.originalSentence is required and must be a non-empty string'
    );
  }
  if (
    payload.learningGoal !== undefined &&
    typeof payload.learningGoal !== 'string'
  ) {
    errors.push('payload.learningGoal must be a string when provided');
  }
  if (
    payload.proficiencyStandard !== undefined &&
    typeof payload.proficiencyStandard !== 'string'
  ) {
    errors.push('payload.proficiencyStandard must be a string when provided');
  }
  if (
    payload.proficiencyLevel !== undefined &&
    typeof payload.proficiencyLevel !== 'string'
  ) {
    errors.push('payload.proficiencyLevel must be a string when provided');
  }
  if (payload.domain !== undefined && typeof payload.domain !== 'string') {
    errors.push('payload.domain must be a string when provided');
  }
  if (payload.tone !== undefined && typeof payload.tone !== 'string') {
    errors.push('payload.tone must be a string when provided');
  }
  return errors;
}

function validateAnalyzeContextPayload(payload: unknown): string[] {
  if (!isObject(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  if (typeof payload.targetText !== 'string' || !payload.targetText.trim()) {
    errors.push('payload.targetText is required and must be a non-empty string');
  }
  if (
    typeof payload.originalSentence !== 'string' ||
    !payload.originalSentence.trim()
  ) {
    errors.push(
      'payload.originalSentence is required and must be a non-empty string'
    );
  }
  if (payload.contextText !== undefined && typeof payload.contextText !== 'string') {
    errors.push('payload.contextText must be a string when provided');
  }
  if (
    payload.learningGoal !== undefined &&
    typeof payload.learningGoal !== 'string'
  ) {
    errors.push('payload.learningGoal must be a string when provided');
  }
  if (
    payload.proficiencyStandard !== undefined &&
    typeof payload.proficiencyStandard !== 'string'
  ) {
    errors.push('payload.proficiencyStandard must be a string when provided');
  }
  if (
    payload.proficiencyLevel !== undefined &&
    typeof payload.proficiencyLevel !== 'string'
  ) {
    errors.push('payload.proficiencyLevel must be a string when provided');
  }
  if (payload.domain !== undefined && typeof payload.domain !== 'string') {
    errors.push('payload.domain must be a string when provided');
  }
  if (payload.tone !== undefined && typeof payload.tone !== 'string') {
    errors.push('payload.tone must be a string when provided');
  }
  return errors;
}

function validateUsageSummaryPayload(payload: unknown): string[] {
  if (payload === undefined) return [];
  if (!isObject(payload)) return ['payload must be an object when provided'];
  const errors: string[] = [];
  if (payload.day !== undefined && typeof payload.day !== 'string') {
    errors.push('payload.day must be a string in YYYY-MM-DD format');
  }
  if (
    payload.includeRecent !== undefined &&
    typeof payload.includeRecent !== 'boolean'
  ) {
    errors.push('payload.includeRecent must be a boolean');
  }
  if (payload.limit !== undefined && typeof payload.limit !== 'number') {
    errors.push('payload.limit must be a number');
  }
  return errors;
}

function validateActionPayload(action: Action, payload: unknown): string[] {
  if (action === 'analyze_text') return validateAnalyzeTextPayload(payload);
  if (action === 'generate_card') return validateGenerateCardPayload(payload);
  if (action === 'analyze_context') return validateAnalyzeContextPayload(payload);
  if (action === 'usage_summary') return validateUsageSummaryPayload(payload);
  return ['unsupported action'];
}

function isValidDayBucket(input: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(input);
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
    if (committed.ok) {
      return nextValue;
    }
  }
  throw new Error('Counter update conflict');
}

async function enforceLimits(userId: string): Promise<Response | null> {
  const kv = await getKvClient();
  if (!kv) {
    if (ALLOW_BILLABLE_WITHOUT_KV) {
      console.warn('[ai-proxy] KV unavailable; allowing request due to AI_ALLOW_BILLABLE_WITHOUT_KV=true');
      return null;
    }
    return jsonResponse(
      {
        error: 'Service temporarily unavailable',
        reason: 'rate_limit_store_unavailable',
      },
      503
    );
  }

  const now = new Date();
  const minuteBucket = `${now.toISOString().slice(0, 16)}`;
  const dayBucket = now.toISOString().slice(0, 10);

  const minuteCount = await incrementCounter(
    kv,
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
    kv,
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

async function trackUsage(params: {
  userId: string;
  action: string;
  status: 'success' | 'error' | 'invalid_request' | 'rate_limited';
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const kv = await getKvClient();
    if (!kv) {
      return;
    }

    const now = new Date();
    const dayBucket = now.toISOString().slice(0, 10);
    const ttlMs = Math.max(1, USAGE_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
    const eventId = `${now.toISOString()}-${crypto.randomUUID()}`;
    await kv.set(
      ['ai-usage-event', dayBucket, params.userId, eventId],
      {
        userId: params.userId,
        action: params.action,
        status: params.status,
        timestamp: now.toISOString(),
        meta: params.meta ?? {},
      },
      { expireIn: ttlMs }
    );
    await incrementCounter(
      kv,
      ['ai-usage-count', dayBucket, params.userId, params.action, params.status],
      ttlMs
    );
  } catch (err) {
    console.error('[ai-proxy] usage tracking failed', err);
  }
}

async function getUsageSummary(
  userId: string,
  payload?: UsageSummaryPayload
): Promise<Response> {
  const kv = await getKvClient();
  if (!kv) {
    return jsonResponse(
      {
        error: 'Usage summary unavailable',
        reason: 'usage_store_unavailable',
      },
      503
    );
  }

  const dayInput = sanitizeText(payload?.day, 10);
  const dayBucket = isValidDayBucket(dayInput)
    ? dayInput
    : new Date().toISOString().slice(0, 10);
  const includeRecent = payload?.includeRecent ?? true;
  const limit = Math.max(
    1,
    Math.min(
      typeof payload?.limit === 'number'
        ? Math.floor(payload.limit)
        : 20,
      USAGE_RECENT_LIMIT_MAX
    )
  );

  const actions = [
    'analyze_text',
    'generate_card',
    'analyze_context',
    'legacy_openai',
    'legacy_gemini',
  ];
  const statuses = ['success', 'error', 'invalid_request', 'rate_limited'];
  const counts: Record<string, Record<string, number>> = {};

  for (const action of actions) {
    counts[action] = {};
    for (const status of statuses) {
      const entry = await kv.get([
        'ai-usage-count',
        dayBucket,
        userId,
        action,
        status,
      ]);
      counts[action][status] = (entry.value as number | null) ?? 0;
    }
  }

  const recent: Array<Record<string, unknown>> = [];
  if (includeRecent) {
    const iter = kv.list({
      prefix: ['ai-usage-event', dayBucket, userId],
    }, { reverse: true, limit });
    for await (const item of iter) {
      recent.push(item.value ?? {});
    }
  }

  return jsonResponse({
    result: {
      day: dayBucket,
      counts,
      recent,
    },
  });
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
  const proficiencyStandard = sanitizeText(payload.proficiencyStandard, 24).toUpperCase();
  const proficiencyLevel = sanitizeText(payload.proficiencyLevel, 32).toUpperCase();
  const domain = sanitizeText(payload.domain, 40);
  const tone = sanitizeText(payload.tone, 40);

  if (!text) {
    return jsonResponse({ error: 'text is required' }, 400);
  }

  const goalInstruction = GOAL_INSTRUCTIONS[learningGoal] || GOAL_INSTRUCTIONS.ielts;
  const personalizationInstruction = buildPersonalizationInstruction({
    proficiencyStandard,
    proficiencyLevel,
    domain,
    tone,
  });

  const prompt = `Analyze the following English text and extract 3-5 key vocabulary words that a language learner should focus on.

${goalInstruction}
${personalizationInstruction ? `${personalizationInstruction}\n` : ''}
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
  const proficiencyStandard = sanitizeText(payload.proficiencyStandard, 24).toUpperCase();
  const proficiencyLevel = sanitizeText(payload.proficiencyLevel, 32).toUpperCase();
  const domain = sanitizeText(payload.domain, 40);
  const tone = sanitizeText(payload.tone, 40);

  if (!targetWord || !originalSentence) {
    return jsonResponse(
      { error: 'targetWord and originalSentence are required' },
      400
    );
  }

  const contextHint = GOAL_INSTRUCTIONS[learningGoal] || GOAL_INSTRUCTIONS.ielts;
  const personalizationInstruction = buildPersonalizationInstruction({
    proficiencyStandard,
    proficiencyLevel,
    domain,
    tone,
  });
  const prompt = `Create a vocabulary learning card for "${targetWord}" in:
"${originalSentence}"

Learning context:
${contextHint}
${personalizationInstruction ? `\n${personalizationInstruction}` : ''}

Return JSON only:
{
  "part of speech":"What part of speech this word is.",
  "definition":"Traditional Chinese definition.",
  "contextualExplanation":"Explaination mainly in traditional chinese about why this word is used in this context or as this collocation.",
  "Frequent collocations":"The most frequent form or phrase that contains this word.",
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
    partOfSpeech?: string;
    ['part of speech']?: string;
    definition?: string;
    contextualExplanation?: string;
    frequentCollocations?: string;
    ['Frequent collocations']?: string;
    phoneticTranscription?: string | null;
    tags?: string[];
  }>(content);

  return jsonResponse({
    result: {
      partOfSpeech: sanitizeText(
        parsed.partOfSpeech || parsed['part of speech'],
        80
      ),
      definition: sanitizeText(parsed.definition, 2000),
      contextualExplanation: sanitizeText(parsed.contextualExplanation, 2000),
      frequentCollocations: sanitizeText(
        parsed.frequentCollocations || parsed['Frequent collocations'],
        500
      ),
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
  const learningGoal = sanitizeText(payload.learningGoal, 32) || 'ielts';
  const proficiencyStandard = sanitizeText(payload.proficiencyStandard, 24).toUpperCase();
  const proficiencyLevel = sanitizeText(payload.proficiencyLevel, 32).toUpperCase();
  const domain = sanitizeText(payload.domain, 40);
  const tone = sanitizeText(payload.tone, 40);

  if (!targetText || !originalSentence) {
    return jsonResponse(
      { error: 'targetText and originalSentence are required' },
      400
    );
  }

  const goalInstruction = GOAL_INSTRUCTIONS[learningGoal] || GOAL_INSTRUCTIONS.ielts;
  const personalizationInstruction = buildPersonalizationInstruction({
    proficiencyStandard,
    proficiencyLevel,
    domain,
    tone,
  });
  const prompt = `For language learning, analyze "${targetText}" in sentence:
"${originalSentence}"

Context around target:
"${contextText}"

Learning context:
${goalInstruction}
${personalizationInstruction ? `${personalizationInstruction}\n` : ''}

Return JSON only:
{
  "keyword":"target word",
  "part of speech":"What part of speech this word is.",
  "definition":"Traditional Chinese explanation",
  "example":"short example sentence",
  "Frequent collocations":"The most frequent form or phrase that contains this word.",
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
    partOfSpeech?: string;
    ['part of speech']?: string;
    definition?: string;
    example?: string;
    frequentCollocations?: string;
    ['Frequent collocations']?: string;
    tags?: string[];
    pronunciation?: string | null;
  }>(content);

  return jsonResponse({
    result: {
      keyword: sanitizeText(parsed.keyword || targetText, MAX_WORD_CHARS),
      partOfSpeech: sanitizeText(
        parsed.partOfSpeech || parsed['part of speech'],
        80
      ),
      definition: sanitizeText(parsed.definition, 2000),
      example: sanitizeText(parsed.example || originalSentence, 1200),
      frequentCollocations: sanitizeText(
        parsed.frequentCollocations || parsed['Frequent collocations'],
        500
      ),
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
    const userId = await getUserIdFromAuthorization(req);
    if (!userId) {
      return jsonResponse({ error: 'Unauthorized: missing valid JWT' }, 401);
    }
    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      await trackUsage({
        userId,
        action: 'unknown',
        status: 'invalid_request',
        meta: { reason: 'invalid_json' },
      });
      return jsonResponse(
        {
          error: 'Invalid JSON payload',
          details: ['Request body must be valid JSON'],
        },
        400
      );
    }

    if (isActionRequest(body)) {
      if (!SUPPORTED_ACTIONS.has(body.action)) {
        await trackUsage({
          userId,
          action: String(body.action),
          status: 'invalid_request',
          meta: { reason: 'unsupported_action' },
        });
        return jsonResponse(
          {
            error: 'Unsupported action',
            details: [`Supported actions: ${[...SUPPORTED_ACTIONS].join(', ')}`],
          },
          400
        );
      }

      const validationErrors = validateActionPayload(body.action, body.payload);
      if (validationErrors.length > 0) {
        await trackUsage({
          userId,
          action: body.action,
          status: 'invalid_request',
          meta: { validationErrors },
        });
        return jsonResponse(
          {
            error: 'Invalid action payload',
            details: validationErrors,
          },
          400
        );
      }

      if (BILLABLE_ACTIONS.has(body.action)) {
        const limitsError = await enforceLimits(userId);
        if (limitsError) {
          await trackUsage({
            userId,
            action: body.action,
            status: 'rate_limited',
          });
          return limitsError;
        }
      }

      if (body.action === 'analyze_text') {
        const response = await handleAnalyzeText(body.payload as AnalyzeTextPayload);
        await trackUsage({ userId, action: body.action, status: 'success' });
        return response;
      }
      if (body.action === 'generate_card') {
        const response = await handleGenerateCard(
          body.payload as GenerateCardPayload
        );
        await trackUsage({ userId, action: body.action, status: 'success' });
        return response;
      }
      if (body.action === 'analyze_context') {
        const response = await handleAnalyzeContext(
          body.payload as AnalyzeContextPayload
        );
        await trackUsage({ userId, action: body.action, status: 'success' });
        return response;
      }
      if (body.action === 'usage_summary') {
        return await getUsageSummary(userId, body.payload as UsageSummaryPayload);
      }
      return jsonResponse({ error: 'Unsupported action' }, 400);
    }

    // Backward-compatible legacy mode (kept for temporary compatibility).
    if (isLegacyRequest(body)) {
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        await trackUsage({
          userId,
          action: `legacy_${body.provider ?? 'unknown'}`,
          status: 'invalid_request',
          meta: { reason: 'messages_required' },
        });
        return jsonResponse(
          { error: 'Invalid payload: provider/messages required' },
          400
        );
      }

      const limitsError = await enforceLimits(userId);
      if (limitsError) {
        await trackUsage({
          userId,
          action: `legacy_${body.provider}`,
          status: 'rate_limited',
        });
        return limitsError;
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
        await trackUsage({
          userId,
          action: 'legacy_openai',
          status: 'success',
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
        await trackUsage({
          userId,
          action: 'legacy_gemini',
          status: 'success',
        });
        return jsonResponse({ content });
      }
    }

    await trackUsage({
      userId,
      action: 'unknown',
      status: 'invalid_request',
      meta: { reason: 'invalid_payload_shape' },
    });
    return jsonResponse({ error: 'Invalid payload' }, 400);
  } catch (error) {
    const userId = await getUserIdFromAuthorization(req);
    if (userId) {
      await trackUsage({
        userId,
        action: 'unknown',
        status: 'error',
        meta: {
          message: error instanceof Error ? error.message : 'Unexpected error',
        },
      });
    }
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unexpected error',
      },
      500
    );
  }
});
