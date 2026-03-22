// Supabase Edge Function: ai-proxy
// Securely proxies AI requests so API keys never live in the mobile app.
declare const Deno: any;

type Provider = 'openai' | 'gemini';
type Action =
  | 'analyze_text'
  | 'generate_card'
  | 'analyze_context'
  | 'analyze_and_generate_card'
  | 'pronunciation_assess'
  | 'usage_summary'
  | 'get_task_result';

type LegacyRequestBody = {
  provider: Provider;
  messages: { role: string; content: unknown }[];
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    stream?: boolean;
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
  includePronunciation?: boolean;
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
  focusSentence?: string;
  fullContext?: string;
  useParagraphMode?: boolean;
  includePronunciation?: boolean;
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

type AnalyzeAndGeneratePayload = {
  text: string;
  userKeywords?: string;
};

type PronunciationAssessPayload = {
  referenceText: string;
  audioBase64: string;
  locale?: string;
};

type GetTaskResultPayload = {
  taskId: string;
};

type ActionRequestBody = {
  action: Action;
  payload?:
    | AnalyzeTextPayload
    | GenerateCardPayload
    | AnalyzeContextPayload
    | AnalyzeAndGeneratePayload
    | PronunciationAssessPayload
    | UsageSummaryPayload
    | GetTaskResultPayload;
  async?: boolean;
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
  Deno.env.get('AI_MAX_TOKENS_ANALYZE') ?? '180'
);
const MAX_TOKENS_GENERATE = Number(
  Deno.env.get('AI_MAX_TOKENS_GENERATE') ?? '420'
);
const MAX_TOKENS_CONTEXT = Number(
  Deno.env.get('AI_MAX_TOKENS_CONTEXT') ?? '300'
);
const MAX_TOKENS_LEGACY = Number(Deno.env.get('AI_MAX_TOKENS_LEGACY') ?? '500');
const AI_OUTPUT_TOKEN_CAP = Number(Deno.env.get('AI_OUTPUT_TOKEN_CAP') ?? '500');
const AI_MAX_CONTEXT_MESSAGES = Number(Deno.env.get('AI_MAX_CONTEXT_MESSAGES') ?? '8');
const AI_MAX_MESSAGE_CHARS = Number(Deno.env.get('AI_MAX_MESSAGE_CHARS') ?? '500');
const AI_MAX_CONTEXT_CHARS = Number(Deno.env.get('AI_MAX_CONTEXT_CHARS') ?? '3200');
const MAX_AUDIO_BASE64_CHARS = Number(
  Deno.env.get('AI_MAX_AUDIO_BASE64_CHARS') ?? '12000000'
);
const USAGE_RETENTION_DAYS = Number(Deno.env.get('AI_USAGE_RETENTION_DAYS') ?? '14');
const USAGE_RECENT_LIMIT_MAX = Number(
  Deno.env.get('AI_USAGE_RECENT_LIMIT_MAX') ?? '50'
);
const AI_TASK_TTL_HOURS = Number(Deno.env.get('AI_TASK_TTL_HOURS') ?? '24');
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

const AZURE_SPEECH_KEY = Deno.env.get('AZURE_SPEECH_KEY') ?? '';
const AZURE_SPEECH_REGION_RAW = Deno.env.get('AZURE_SPEECH_REGION') ?? '';
const AZURE_REQUEST_TIMEOUT_MS = Number(
  Deno.env.get('AZURE_REQUEST_TIMEOUT_MS') ?? '12000'
);
const AZURE_TOKEN_TIMEOUT_MS = Number(
  Deno.env.get('AZURE_TOKEN_TIMEOUT_MS') ?? '4000'
);
const AZURE_MIN_WAV_BYTES = Number(Deno.env.get('AZURE_MIN_WAV_BYTES') ?? '6000');

function normalizeAzureRegion(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const AZURE_SPEECH_REGION = normalizeAzureRegion(AZURE_SPEECH_REGION_RAW);

async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

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
  'analyze_and_generate_card',
  'pronunciation_assess',
  'usage_summary',
  'get_task_result',
]);
const BILLABLE_ACTIONS = new Set<Action>([
  'analyze_text',
  'generate_card',
  'analyze_context',
  'analyze_and_generate_card',
  'pronunciation_assess',
]);

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

function normalizeTargetToken(input: string): string {
  return input
    .replace(/^[\s"'“”‘’()[\]{}<>.,!?;:]+|[\s"'“”‘’()[\]{}<>.,!?;:]+$/g, '')
    .trim();
}

function clampTokens(value: unknown, maxAllowed: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return maxAllowed;
  return Math.max(1, Math.min(Math.floor(value), Math.min(maxAllowed, AI_OUTPUT_TOKEN_CAP)));
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

type ModelRoute = {
  model: string;
  tier: 'fast' | 'balanced' | 'quality';
  reason: string;
};

type AIExecutionMetrics = {
  provider: 'openai' | 'gemini';
  model: string;
  latencyMs: number;
  ttfbMs?: number;
  inputTokens?: number;
  outputTokens?: number;
};

type AIResponse = {
  content: string;
  metrics: AIExecutionMetrics;
};

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function compactMessages(messages: LegacyRequestBody['messages']): { role: string; content: string }[] {
  const normalized = messages
    .map((msg) => ({
      role: String(msg.role || 'user'),
      content: normalizeWhitespace(sanitizeText(msg.content, AI_MAX_MESSAGE_CHARS)),
    }))
    .filter((msg) => Boolean(msg.content));

  if (!normalized.length) return [];

  const systemMessages = normalized.filter((msg) => msg.role === 'system');
  const nonSystem = normalized.filter((msg) => msg.role !== 'system');
  const lastNonSystem = nonSystem.slice(-Math.max(1, AI_MAX_CONTEXT_MESSAGES - 1));
  const merged = [
    ...(systemMessages[0] ? [systemMessages[0]] : []),
    ...lastNonSystem,
  ];

  let budget = AI_MAX_CONTEXT_CHARS;
  const output: { role: string; content: string }[] = [];
  for (const msg of merged) {
    if (budget <= 0) break;
    const clipped = msg.content.slice(0, Math.min(msg.content.length, budget));
    if (!clipped) continue;
    output.push({ role: msg.role, content: clipped });
    budget -= clipped.length;
  }
  return output;
}

function routeOpenAIModelForAction(params: {
  action: Action | 'legacy_openai';
  payloadSize: number;
  requested?: unknown;
}): ModelRoute {
  if (typeof params.requested === 'string' && OPENAI_ALLOWED_MODELS.includes(params.requested)) {
    return {
      model: params.requested,
      tier: 'quality',
      reason: 'explicit_model_override',
    };
  }

  const fast = OPENAI_ALLOWED_MODELS[0] ?? 'gpt-4o-mini';
  const balanced = OPENAI_ALLOWED_MODELS[Math.min(1, OPENAI_ALLOWED_MODELS.length - 1)] ?? fast;
  const quality = OPENAI_ALLOWED_MODELS[Math.min(2, OPENAI_ALLOWED_MODELS.length - 1)] ?? balanced;

  if (params.action === 'analyze_text') {
    return { model: fast, tier: 'fast', reason: 'short_keyword_extraction' };
  }
  if (params.payloadSize > 1200 || params.action === 'analyze_context') {
    return { model: quality, tier: 'quality', reason: 'long_or_context_heavy' };
  }
  if (params.action === 'generate_card' || params.action === 'analyze_and_generate_card') {
    return { model: balanced, tier: 'balanced', reason: 'content_generation' };
  }
  return { model: fast, tier: 'fast', reason: 'default_low_latency' };
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
    payload.includePronunciation !== undefined &&
    typeof payload.includePronunciation !== 'boolean'
  ) {
    errors.push('payload.includePronunciation must be a boolean when provided');
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
  if (
    payload.includePronunciation !== undefined &&
    typeof payload.includePronunciation !== 'boolean'
  ) {
    errors.push('payload.includePronunciation must be a boolean when provided');
  }
  if (payload.contextText !== undefined && typeof payload.contextText !== 'string') {
    errors.push('payload.contextText must be a string when provided');
  }
  if (payload.focusSentence !== undefined && typeof payload.focusSentence !== 'string') {
    errors.push('payload.focusSentence must be a string when provided');
  }
  if (payload.fullContext !== undefined && typeof payload.fullContext !== 'string') {
    errors.push('payload.fullContext must be a string when provided');
  }
  if (
    payload.useParagraphMode !== undefined &&
    typeof payload.useParagraphMode !== 'boolean'
  ) {
    errors.push('payload.useParagraphMode must be a boolean when provided');
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

function validateAnalyzeAndGeneratePayload(payload: unknown): string[] {
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
  return errors;
}

function validatePronunciationAssessPayload(payload: unknown): string[] {
  if (!isObject(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  const referenceText =
    typeof payload.referenceText === 'string' ? payload.referenceText : '';
  const audioBase64 =
    typeof payload.audioBase64 === 'string' ? payload.audioBase64 : '';

  if (!referenceText.trim()) {
    errors.push('payload.referenceText is required and must be a non-empty string');
  }
  if (referenceText.length > MAX_SENTENCE_CHARS) {
    errors.push(`payload.referenceText must be <= ${MAX_SENTENCE_CHARS} chars`);
  }
  if (!audioBase64.trim()) {
    errors.push('payload.audioBase64 is required and must be a non-empty string');
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    errors.push(`payload.audioBase64 must be <= ${MAX_AUDIO_BASE64_CHARS} chars`);
  }
  if (payload.locale !== undefined && typeof payload.locale !== 'string') {
    errors.push('payload.locale must be a string when provided');
  }
  return errors;
}

function validateGetTaskResultPayload(payload: unknown): string[] {
  if (!isObject(payload)) return ['payload must be an object'];
  const taskId = sanitizeText(payload.taskId, 100);
  if (!taskId) {
    return ['payload.taskId is required'];
  }
  return [];
}

function validateActionPayload(action: Action, payload: unknown): string[] {
  if (action === 'analyze_text') return validateAnalyzeTextPayload(payload);
  if (action === 'generate_card') return validateGenerateCardPayload(payload);
  if (action === 'analyze_context') return validateAnalyzeContextPayload(payload);
  if (action === 'analyze_and_generate_card') {
    return validateAnalyzeAndGeneratePayload(payload);
  }
  if (action === 'pronunciation_assess') {
    return validatePronunciationAssessPayload(payload);
  }
  if (action === 'usage_summary') return validateUsageSummaryPayload(payload);
  if (action === 'get_task_result') return validateGetTaskResultPayload(payload);
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
  status: 'success' | 'error' | 'invalid_request' | 'rate_limited' | 'queued';
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
    'analyze_and_generate_card',
    'pronunciation_assess',
    'legacy_openai',
    'legacy_gemini',
    'get_task_result',
  ];
  const statuses = ['success', 'error', 'invalid_request', 'rate_limited', 'queued'];
  const counts: Record<string, Record<string, number>> = {};

  await Promise.all(
    actions.map(async (action) => {
      const statusEntries = await Promise.all(
        statuses.map((status) =>
          kv.get(['ai-usage-count', dayBucket, userId, action, status])
        )
      );
      counts[action] = {};
      statuses.forEach((status, index) => {
        counts[action][status] = (statusEntries[index].value as number | null) ?? 0;
      });
    })
  );

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
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens: number;
  jsonMode?: boolean;
}): Promise<AIResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in Edge Function secrets');
  }

  const startedAt = Date.now();
  const model = pickModel(params.model, OPENAI_ALLOWED_MODELS, OPENAI_ALLOWED_MODELS[0]);

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

  const usage = (data as {
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  })?.usage;

  return {
    content:
      (data as { choices?: { message?: { content?: string } }[] })
        ?.choices?.[0]?.message?.content || '',
    metrics: {
      provider: 'openai',
      model,
      latencyMs: Date.now() - startedAt,
      inputTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
      outputTokens:
        typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : undefined,
    },
  };
}

async function callGeminiLegacy(params: {
  model: string;
  messages: LegacyRequestBody['messages'];
  temperature?: number;
  maxTokens: number;
}): Promise<AIResponse> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY in Edge Function secrets');
  }

  const startedAt = Date.now();
  const model = pickModel(params.model, GEMINI_ALLOWED_MODELS, GEMINI_ALLOWED_MODELS[0]);
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

  const usage = (data as {
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  })?.usageMetadata;

  return {
    content:
      (data as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      })?.candidates?.[0]?.content?.parts?.[0]?.text || '',
    metrics: {
      provider: 'gemini',
      model,
      latencyMs: Date.now() - startedAt,
      inputTokens:
        typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : undefined,
      outputTokens:
        typeof usage?.candidatesTokenCount === 'number'
          ? usage.candidatesTokenCount
          : undefined,
    },
  };
}

async function buildOpenAIStreamResponse(params: {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens: number;
}): Promise<Response> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in Edge Function secrets');
  }
  const startedAt = Date.now();
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: pickModel(params.model, OPENAI_ALLOWED_MODELS, OPENAI_ALLOWED_MODELS[0]),
      messages: params.messages,
      temperature: params.temperature ?? 0.5,
      max_tokens: params.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(text || `OpenAI stream request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let firstTokenAt = 0;
  let outputTokens: number | undefined;
  let inputTokens: number | undefined;
  let lineBuffer = '';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('event: ready\ndata: {"started":true}\n\n'));
      let shouldRead = true;
      while (shouldRead) {
        const { done, value } = await reader.read();
        if (done) {
          shouldRead = false;
          continue;
        }
        lineBuffer += decoder.decode(value, { stream: true });
        const parts = lineBuffer.split('\n');
        lineBuffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') continue;
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            continue;
          }
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            if (!firstTokenAt) firstTokenAt = Date.now();
            controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ delta })}\n\n`));
          }
          if (parsed?.usage) {
            inputTokens = parsed.usage.prompt_tokens;
            outputTokens = parsed.usage.completion_tokens;
          }
        }
      }

      const donePayload = {
        ttfbMs: firstTokenAt ? firstTokenAt - startedAt : null,
        totalMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
      };
      controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(donePayload)}\n\n`));
      controller.close();
    },
    cancel() {
      reader.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

async function handleAnalyzeText(payload: AnalyzeTextPayload): Promise<Response> {
  const text = sanitizeText(payload.text, MAX_TEXT_CHARS);
  const userKeywords = sanitizeText(payload.userKeywords, MAX_KEYWORDS_CHARS);

  if (!text) {
    return jsonResponse({ error: 'text is required' }, 400);
  }

  const prompt = `Analyze the following English text and extract 1 key vocabulary word that a language learner should focus on.

${userKeywords ? `User has expressed interest in: "${userKeywords}". Prioritize these if they appear in the text.` : ''}

Text: "${text}"

Return JSON only:
{"keywords":["word1"],"suggestedWord":"word1"}`;

  const route = routeOpenAIModelForAction({
    action: 'analyze_text',
    payloadSize: text.length + userKeywords.length,
  });
  const aiResponse = await callOpenAIChat({
    model: route.model,
    messages: [
      {
        role: 'system',
        content:
          'You are an English vocabulary coach. Respond with strict JSON only. Keep output concise.',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: MAX_TOKENS_ANALYZE,
    temperature: 0.4,
    jsonMode: true,
  });
  const content = aiResponse.content;

  const parsed = parseJson<{ keywords?: string[]; suggestedWord?: string | null }>(
    content
  );
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.filter((item) => typeof item === 'string').slice(0, 1)
    : [];
  const suggestedWord = typeof parsed.suggestedWord === 'string'
    ? parsed.suggestedWord
    : keywords[0] ?? null;

  return jsonResponse({
    result: {
      keywords,
      suggestedWord,
    },
    meta: {
      route,
      metrics: aiResponse.metrics,
    },
  });
}

async function handleGenerateCard(payload: GenerateCardPayload): Promise<Response> {
  const targetWord = sanitizeText(payload.targetWord, MAX_WORD_CHARS);
  const originalSentence = sanitizeText(payload.originalSentence, MAX_SENTENCE_CHARS);
  const includePronunciation = payload.includePronunciation !== false;

  if (!targetWord || !originalSentence) {
    return jsonResponse(
      { error: 'targetWord and originalSentence are required' },
      400
    );
  }

  const prompt = `Create a vocabulary learning card for "${targetWord}" in:
"${originalSentence}"

Critical semantic rules:
1. Use ONLY the meaning of "${targetWord}" in this specific sentence, not the most common dictionary meaning.
2. If the sentence implies a fixed phrase/collocation, explain that phrase-level meaning first.
3. Prefer Traditional Chinese wording used by learners in Taiwan/Hong Kong context.
4. If multiple senses are possible, choose the single best one for this sentence and mention why in contextualExplanation.
5. In "Frequent collocations", prioritize high-frequency phrasal-verb collocations for the target word.
6. Every collocation must include Traditional Chinese translation next to English. Format: English（繁中）.

Return JSON only:
{
  "part of speech":"What part of speech this word is.",
  "definition":"Traditional Chinese definition.",
  "contextualExplanation":"Explaination mainly in traditional chinese about why this word is used in this context or as this collocation.",
  "Frequent collocations":"The most frequent form or phrase that contains this word.",
  ${includePronunciation
    ? '"phoneticTranscription":"IPA string (prefer UK/US common IPA, e.g. /əˈnaɪz/) or null only if truly unavailable",'
    : ''}
  "tags":["IELTS","Academic"]
}`;

  const route = routeOpenAIModelForAction({
    action: 'generate_card',
    payloadSize: targetWord.length + originalSentence.length,
  });
  const aiResponse = await callOpenAIChat({
    model: route.model,
    messages: [
      {
        role: 'system',
        content:
          'You are an expert bilingual English teacher. Return strict JSON only. Keep each field concise.',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: MAX_TOKENS_GENERATE,
    temperature: 0.6,
    jsonMode: true,
  });
  const content = aiResponse.content;

  const parsed = parseJson<{
    partOfSpeech?: string;
    ['part of speech']?: string;
    definition?: string;
    contextualExplanation?: string;
    frequentCollocations?: string;
    ['Frequent collocations']?: string;
    phoneticTranscription?: string | null;
    pronunciation?: string | null;
    ipa?: string | null;
    phonetic?: string | null;
    tags?: string[];
  }>(content);

  const partOfSpeech = sanitizeText(parsed.partOfSpeech || parsed['part of speech'], 80);
  const definition = sanitizeText(parsed.definition, 2000);
  const contextualExplanation = sanitizeText(parsed.contextualExplanation, 2000);
  const frequentCollocations = sanitizeText(
    parsed.frequentCollocations || parsed['Frequent collocations'],
    500
  );
  const phoneticTranscription =
    typeof parsed.phoneticTranscription === 'string'
      ? sanitizeText(parsed.phoneticTranscription, 120)
      : typeof parsed.pronunciation === 'string'
        ? sanitizeText(parsed.pronunciation, 120)
        : typeof parsed.ipa === 'string'
          ? sanitizeText(parsed.ipa, 120)
          : typeof parsed.phonetic === 'string'
            ? sanitizeText(parsed.phonetic, 120)
      : null;
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
      .filter((item) => typeof item === 'string')
      .map((item) => sanitizeText(item, 40))
      .filter(Boolean)
      .slice(0, 8)
    : [];

  return jsonResponse({
    result: {
      partOfSpeech,
      definition,
      contextualExplanation,
      frequentCollocations,
      phoneticTranscription,
      tags,
    },
    meta: {
      route,
      metrics: aiResponse.metrics,
    },
  });
}

async function handleAnalyzeContext(payload: AnalyzeContextPayload): Promise<Response> {
  const targetText = normalizeTargetToken(
    sanitizeText(payload.targetText, MAX_WORD_CHARS)
  );
  const originalSentence = sanitizeText(payload.originalSentence, MAX_SENTENCE_CHARS);
  const contextText = sanitizeText(payload.contextText, MAX_SENTENCE_CHARS);
  const focusSentence = sanitizeText(payload.focusSentence, MAX_SENTENCE_CHARS) || originalSentence;
  const fullContext = sanitizeText(payload.fullContext, MAX_TEXT_CHARS);
  const useParagraphMode = Boolean(payload.useParagraphMode && fullContext);
  const includePronunciation = payload.includePronunciation !== false;
  const shortModalPattern =
    /^(it|they|he|she|we|i|you)\s+(will|would|shall|should|must|can|could|may|might)\s+[a-z]+$/i
      .test(focusSentence.trim());
  const hasDirectMoneyCue =
    /(\$|dollars?|bucks?|fee|fees|bill|payment|pay for|paying for)/i.test(
      `${focusSentence} ${contextText}`
    );
  const mayNeedPragmaticDisambiguation = shortModalPattern && !hasDirectMoneyCue;

  if (!targetText || !originalSentence) {
    return jsonResponse(
      { error: 'targetText and originalSentence are required' },
      400
    );
  }
  const prompt = `${useParagraphMode
    ? `請先讀完整段落，再回答目標句中的詞義。\n\nFull context:\n"${fullContext}"\n\nFocus sentence:\n"${focusSentence}"`
    : `「${originalSentence}」中的「${targetText}」是什麼意思？`}

Context around target:
"${contextText}"

Critical semantic rules:
1. 僅解釋此情境的詞義。
2. "keyword" 必須等於 "${targetText}"，不可改字、不可擴寫成片語。
3. 先判斷最小語義單位（片語/搭配），再給 translation。
4. "definition" 只能是精簡繁中翻譯（2-8字），不能寫解釋句。
5. 若有片語義，禁止輸出裸字典義。
6. "contextualExplanation" 才能放完整解釋。
7. "Frequent collocations" 只列 1-3 個同義域高頻搭配，格式 English（繁中）；不確定就回空字串。

Return JSON only:
{
  "keyword":"target word",
  "part of speech":"What part of speech this word is.",
  "definition":"Concise Traditional Chinese translation only",
  "contextualExplanation":"Detailed explanation in Traditional Chinese for this sentence",
  "example":"short example sentence",
  "Frequent collocations":"The most frequent form or phrase that contains this word.",
  "confidence":0.0,
  "alternatives":["sense A","sense B"],
  "tags":["Vocabulary"]${includePronunciation
    ? ',\n  "pronunciation":"IPA string (prefer UK/US common IPA) or null only if truly unavailable"'
    : ''}
}`;

  console.log(
    '[ai-proxy][analyze_context][mode]',
    JSON.stringify(
      {
        contextMode: useParagraphMode ? 'paragraph' : 'sentence',
        secondSegmentModeActivated: useParagraphMode,
        shortModalPattern,
        hasDirectMoneyCue,
        promptLength: prompt.length,
      },
      null,
      2
    )
  );

  console.log(
    '[ai-proxy][analyze_context][input]',
    JSON.stringify(
      {
        targetText,
        originalSentence,
        focusSentence,
        contextText,
        contextMode: useParagraphMode ? 'paragraph' : 'sentence',
        secondSegmentModeActivated: useParagraphMode,
        shortModalPattern,
        hasDirectMoneyCue,
        promptLength: prompt.length,
        useParagraphMode,
        fullContext,
        prompt,
      },
      null,
      2
    )
  );

  const route = routeOpenAIModelForAction({
    action: 'analyze_context',
    payloadSize: targetText.length + originalSentence.length + contextText.length + fullContext.length,
  });
  const aiResponse = await callOpenAIChat({
    model: route.model,
    messages: [
      {
        role: 'system',
        content:
          'You are a native English speaker with expert level Chinese skills. Return strict JSON only. Keep wording concise.',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: Math.min(MAX_TOKENS_CONTEXT, 220),
    temperature: 0.2,
    jsonMode: true,
  });
  const content = aiResponse.content;

  console.log(
    '[ai-proxy][analyze_context][openai_raw_output]',
    typeof content === 'string' ? content : JSON.stringify(content)
  );

  const parsed = parseJson<{
    keyword?: string;
    partOfSpeech?: string;
    ['part of speech']?: string;
    definition?: string;
    contextualExplanation?: string;
    example?: string;
    frequentCollocations?: string;
    ['Frequent collocations']?: string;
    confidence?: number;
    alternatives?: string[];
    tags?: string[];
    pronunciation?: string | null;
    phoneticTranscription?: string | null;
    ipa?: string | null;
    phonetic?: string | null;
  }>(content);

  const firstPass = parsed;
  const rawDefinition = sanitizeText(firstPass.definition, 2000);
  const rawExplanation = sanitizeText(firstPass.contextualExplanation, 2000);
  const looksLikeMonetarySense =
    /(支付|付款|付費|繳費|付錢|金錢交易|pay for|payment|monetary|financial)/i.test(
      `${rawDefinition} ${rawExplanation}`
    );

  let finalized = firstPass;
  if (mayNeedPragmaticDisambiguation && looksLikeMonetarySense) {
    const retryPrompt = `${prompt}

Disambiguation check:
- Focus sentence is short modal/aux + verb pattern and context has no explicit money object.
- Re-evaluate pragmatic reading first (consequence/result/retaliation etc.) before transaction meaning.
- Keep all previous JSON schema requirements unchanged.`;

    const retryResponse = await callOpenAIChat({
      model: route.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a native English speaker with expert level Chinese skills. Return strict JSON only.',
        },
        { role: 'user', content: retryPrompt },
      ],
      maxTokens: Math.min(MAX_TOKENS_CONTEXT, 220),
      temperature: 0.1,
      jsonMode: true,
    });
    const retryContent = retryResponse.content;

    console.log(
      '[ai-proxy][analyze_context][retry_raw_output]',
      typeof retryContent === 'string' ? retryContent : JSON.stringify(retryContent)
    );

    const retryParsed = parseJson<{
      keyword?: string;
      partOfSpeech?: string;
      ['part of speech']?: string;
      definition?: string;
      contextualExplanation?: string;
      example?: string;
      frequentCollocations?: string;
      ['Frequent collocations']?: string;
      confidence?: number;
      alternatives?: string[];
      tags?: string[];
      pronunciation?: string | null;
      phoneticTranscription?: string | null;
      ipa?: string | null;
      phonetic?: string | null;
    }>(retryContent);

    console.log(
      '[ai-proxy][analyze_context][retry_parsed_output]',
      JSON.stringify(retryParsed, null, 2)
    );
    finalized = retryParsed;
  }

  console.log(
    '[ai-proxy][analyze_context][parsed_output]',
    JSON.stringify(finalized, null, 2)
  );

  const lockedKeyword = targetText;
  const partOfSpeech = sanitizeText(finalized.partOfSpeech || finalized['part of speech'], 80);
  const definition = sanitizeText(finalized.definition, 2000);
  const contextualExplanation = sanitizeText(finalized.contextualExplanation, 2000);
  const example = sanitizeText(finalized.example || originalSentence, 1200);
  const frequentCollocations = sanitizeText(
    finalized.frequentCollocations || finalized['Frequent collocations'],
    500
  );
  const confidence = typeof finalized.confidence === 'number'
    ? Math.max(0, Math.min(1, finalized.confidence))
    : undefined;
  const alternatives = Array.isArray(finalized.alternatives)
    ? finalized.alternatives
      .filter((item) => typeof item === 'string')
      .map((item) => sanitizeText(item, 120))
      .filter(Boolean)
      .slice(0, 3)
    : [];
  const tags = Array.isArray(finalized.tags)
    ? finalized.tags
      .filter((item) => typeof item === 'string')
      .map((item) => sanitizeText(item, 40))
      .filter(Boolean)
      .slice(0, 8)
    : [];
  const pronunciation =
    typeof finalized.pronunciation === 'string'
      ? sanitizeText(finalized.pronunciation, 120)
      : typeof finalized.phoneticTranscription === 'string'
        ? sanitizeText(finalized.phoneticTranscription, 120)
        : typeof finalized.ipa === 'string'
          ? sanitizeText(finalized.ipa, 120)
          : typeof finalized.phonetic === 'string'
            ? sanitizeText(finalized.phonetic, 120)
      : null;

  return jsonResponse({
    result: {
      keyword: lockedKeyword,
      partOfSpeech,
      definition,
      contextualExplanation,
      example,
      frequentCollocations,
      confidence,
      alternatives,
      tags,
      pronunciation,
    },
    meta: {
      route,
      metrics: aiResponse.metrics,
    },
  });
}

async function handleAnalyzeAndGenerate(
  payload: AnalyzeAndGeneratePayload
): Promise<Response> {
  const text = sanitizeText(payload.text, MAX_TEXT_CHARS);
  const userKeywords = sanitizeText(payload.userKeywords, MAX_KEYWORDS_CHARS);
  if (!text) {
    return jsonResponse({ error: 'text is required' }, 400);
  }

  const analyzedResponse = await handleAnalyzeText({
    text,
    userKeywords,
  });
  const analyzedJson = await analyzedResponse.clone().json() as {
    result?: { keywords?: string[]; suggestedWord?: string | null };
  };

  const suggestedWord = analyzedJson?.result?.suggestedWord || analyzedJson?.result?.keywords?.[0] || null;
  if (!suggestedWord) {
    return jsonResponse({
      result: {
        keywords: analyzedJson?.result?.keywords || [],
        suggestedWord: null,
        definition: '',
        partOfSpeech: '',
        contextualExplanation: '',
        frequentCollocations: '',
        phoneticTranscription: null,
        tags: [],
      },
    });
  }

  const generatedResponse = await handleGenerateCard({
    targetWord: suggestedWord,
    originalSentence: text,
    includePronunciation: true,
  });
  const generatedJson = await generatedResponse.clone().json() as {
    result?: {
      definition?: string;
      partOfSpeech?: string;
      contextualExplanation?: string;
      frequentCollocations?: string;
      phoneticTranscription?: string | null;
      tags?: string[];
    };
  };

  return jsonResponse({
    result: {
      keywords: analyzedJson?.result?.keywords || [],
      suggestedWord,
      definition: generatedJson?.result?.definition || '',
      partOfSpeech: generatedJson?.result?.partOfSpeech || '',
      contextualExplanation: generatedJson?.result?.contextualExplanation || '',
      frequentCollocations: generatedJson?.result?.frequentCollocations || '',
      phoneticTranscription: generatedJson?.result?.phoneticTranscription || null,
      tags: generatedJson?.result?.tags || [],
    },
  });
}

function toAccuracyLevel(score: number): 'red' | 'yellow' | 'green' {
  if (score < 60) return 'red';
  if (score < 80) return 'yellow';
  return 'green';
}

function clampPronScore(score: unknown): number | null {
  const value = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function extractAccuracyScore(source: unknown): number | null {
  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;
  return (
    clampPronScore((obj.PronunciationAssessment as Record<string, unknown> | undefined)?.AccuracyScore)
    ?? clampPronScore(obj.AccuracyScore)
    ?? clampPronScore(obj.accuracyScore)
    ?? clampPronScore(obj.Score)
    ?? clampPronScore(obj.score)
  );
}

function sanitizeLocale(locale: unknown): string {
  const normalized = sanitizeText(locale, 20);
  if (!normalized) return 'en-US';
  return /^[a-z]{2,3}-[A-Z]{2}$/.test(normalized) ? normalized : 'en-US';
}

function normalizeAudioBase64(input: string): string {
  const trimmed = input.trim();
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex >= 0 && trimmed.slice(0, commaIndex).includes('base64')) {
    return trimmed.slice(commaIndex + 1).trim();
  }
  return trimmed;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function readUint16LE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 2 > bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 4 > bytes.length) return null;
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

function isLikelyWav(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const riff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const wave =
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
  return riff && wave;
}

function parseWavFormat(bytes: Uint8Array): {
  audioFormat: number | null;
  channels: number | null;
  sampleRate: number | null;
  byteRate: number | null;
  bitsPerSample: number | null;
} {
  if (!isLikelyWav(bytes)) {
    return {
      audioFormat: null,
      channels: null,
      sampleRate: null,
      byteRate: null,
      bitsPerSample: null,
    };
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkSize = readUint32LE(bytes, offset + 4);
    if (chunkSize === null) break;
    if (chunkId === 'fmt ') {
      return {
        audioFormat: readUint16LE(bytes, offset + 8),
        channels: readUint16LE(bytes, offset + 10),
        sampleRate: readUint32LE(bytes, offset + 12),
        byteRate: readUint32LE(bytes, offset + 16),
        bitsPerSample: readUint16LE(bytes, offset + 22),
      };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return {
    audioFormat: null,
    channels: null,
    sampleRate: null,
    byteRate: null,
    bitsPerSample: null,
  };
}

function buildArticulationHint(expected: string, spoken: string | null): string {
  const substitution = spoken && spoken !== expected
    ? `你目前更接近 ${spoken}，目標要更靠近 ${expected}。`
    : '';
  if (expected === 'θ' || expected === 'ð') return `${substitution}舌尖輕放在上下門牙之間，再平穩送氣。`.trim();
  if (expected === 'r') return `${substitution}R 音舌頭後縮並懸空，不要碰上顎。`.trim();
  if (expected === 'l') return `${substitution}L 音舌尖要碰齒齦，尾音不要糊掉。`.trim();
  if (expected === 'i' || expected === 'iː') return `${substitution}長母音要拉長，嘴角更展開。`.trim();
  return `${substitution}放慢速度重讀此音段，確保子音釋放清楚。`.trim();
}

function splitWordIntoLetterSegments(word: string, segmentCount: number): string[] {
  const normalized = sanitizeText(word, 80);
  if (!normalized) return [];
  if (!Number.isFinite(segmentCount) || segmentCount <= 1) return [normalized];
  const total = Math.min(segmentCount, normalized.length);
  const baseSize = Math.floor(normalized.length / total);
  const remainder = normalized.length % total;
  const segments: string[] = [];
  let offset = 0;
  for (let i = 0; i < total; i += 1) {
    const size = baseSize + (i < remainder ? 1 : 0);
    const next = normalized.slice(offset, offset + size);
    if (next) segments.push(next);
    offset += size;
  }
  return segments.length > 0 ? segments : [normalized];
}

async function handlePronunciationAssess(
  payload: PronunciationAssessPayload
): Promise<Response> {
  const referenceText = sanitizeText(payload.referenceText, MAX_SENTENCE_CHARS);
  const locale = sanitizeLocale(payload.locale);
  const audioBase64 = normalizeAudioBase64(payload.audioBase64 || '');

  if (!referenceText || !audioBase64) {
    return jsonResponse({ error: 'referenceText and audioBase64 are required' }, 400);
  }
  if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
    throw new Error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION in Edge Function secrets');
  }

  const tokenEndpoint = `https://${AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
  const tokenResponse = await fetchWithTimeout(
    tokenEndpoint,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Length': '0',
      },
    },
    AZURE_TOKEN_TIMEOUT_MS
  );
  if (!tokenResponse.ok) {
    const tokenBody = await tokenResponse.text().catch(() => '');
    throw new Error(
      `Azure token endpoint failed (${tokenResponse.status}) body=${tokenBody || '<empty>'}`
    );
  }

  const audioBytes = decodeBase64ToBytes(audioBase64);
  const wavFormat = parseWavFormat(audioBytes);
  if (!isLikelyWav(audioBytes)) {
    throw new Error(`Audio payload is not WAV RIFF/WAVE header (bytes=${audioBytes.length})`);
  }
  if (audioBytes.length < AZURE_MIN_WAV_BYTES) {
    return jsonResponse(
      { error: `Audio too short for cloud assessment (wavBytes=${audioBytes.length}, min=${AZURE_MIN_WAV_BYTES})` },
      400
    );
  }

  const pronunciationHeader = btoa(JSON.stringify({
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: true,
    EnableProsodyAssessment: true,
    NBestPhonemeCount: 3,
  }));
  const endpoint =
    `https://${AZURE_SPEECH_REGION}.stt.speech.microsoft.com/` +
    `speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(locale)}&format=detailed`;

  const audioBuffer = audioBytes.buffer.slice(
    audioBytes.byteOffset,
    audioBytes.byteOffset + audioBytes.byteLength
  ) as ArrayBuffer;
  const azureResponse = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Type': 'audio/wav',
        Accept: 'application/json',
        'Pronunciation-Assessment': pronunciationHeader,
      },
      body: audioBuffer,
    },
    AZURE_REQUEST_TIMEOUT_MS
  );

  const rawText = await azureResponse.text().catch(() => '');
  const raw = rawText ? JSON.parse(rawText) : null;
  if (!azureResponse.ok) {
    const detail =
      (raw as { error?: { message?: string }; RecognitionStatus?: string } | null)?.error?.message
      || (raw as { RecognitionStatus?: string } | null)?.RecognitionStatus
      || `Azure Speech request failed (${azureResponse.status})`;
    throw new Error(`${detail} (wavBytes=${audioBytes.length})`);
  }

  const rawRecord = (raw || {}) as {
    RecognitionStatus?: string;
    DisplayText?: string;
    PronunciationAssessment?: {
      PronScore?: number;
      AccuracyScore?: number;
      FluencyScore?: number;
      CompletenessScore?: number;
      ProsodyScore?: number;
    };
    Words?: Array<{
      Word?: string;
      PronunciationAssessment?: { AccuracyScore?: number };
      Syllables?: Array<{
        Syllable?: string;
        PronunciationAssessment?: { AccuracyScore?: number };
      }>;
      Phonemes?: Array<{
        Phoneme?: string;
        PronunciationAssessment?: {
          AccuracyScore?: number;
          NBestPhonemes?: Array<{ Phoneme?: string }>;
        };
      }>;
    }>;
    NBest?: Array<{
      Display?: string;
      Lexical?: string;
      PronunciationAssessment?: {
        PronScore?: number;
        AccuracyScore?: number;
        FluencyScore?: number;
        CompletenessScore?: number;
        ProsodyScore?: number;
      };
      Words?: Array<{
        Word?: string;
        PronunciationAssessment?: { AccuracyScore?: number };
        Syllables?: Array<{
          Syllable?: string;
          PronunciationAssessment?: { AccuracyScore?: number };
        }>;
        Phonemes?: Array<{
          Phoneme?: string;
          PronunciationAssessment?: {
            AccuracyScore?: number;
            NBestPhonemes?: Array<{ Phoneme?: string }>;
          };
        }>;
      }>;
    }>;
  };
  const best = Array.isArray(rawRecord.NBest) ? rawRecord.NBest[0] : undefined;
  const pa = best?.PronunciationAssessment || rawRecord.PronunciationAssessment;
  const wordsRaw = Array.isArray(best?.Words)
    ? best.Words
    : (Array.isArray(rawRecord.Words) ? rawRecord.Words : []);
  console.log(
    '[ai-proxy][pronunciation_assess] azure-shape',
    JSON.stringify({
      recognitionStatus: rawRecord.RecognitionStatus ?? null,
      hasNBest: Array.isArray(rawRecord.NBest) && rawRecord.NBest.length > 0,
      hasPAInBest: Boolean(best?.PronunciationAssessment),
      hasPAInRoot: Boolean(rawRecord.PronunciationAssessment),
      wordsCount: wordsRaw.length,
      phonemeCountInWords: wordsRaw.reduce(
        (sum, word) => sum + (Array.isArray(word?.Phonemes) ? word.Phonemes.length : 0),
        0
      ),
      syllableCountInWords: wordsRaw.reduce(
        (sum, word) => sum + (Array.isArray(word?.Syllables) ? word.Syllables.length : 0),
        0
      ),
    })
  );

  const phonemeFeedback: Array<{
    phoneme: string;
    letters?: string;
    spokenPhoneme: string | null;
    accuracy: number;
    level: 'red' | 'yellow' | 'green';
    suggestion: string;
  }> = [];
  const letterSegments: Array<{
    text: string;
    letters: string;
    phoneme: string;
    spokenPhoneme: string | null;
    accuracy: number;
    level: 'red' | 'yellow' | 'green';
    suggestion: string;
  }> = [];

  const wordFeedback = wordsRaw
    .map((wordItem) => {
      const word = sanitizeText(wordItem?.Word, 80);
      if (!word) return null;
      const phonemesRaw = Array.isArray(wordItem?.Phonemes) ? wordItem.Phonemes : [];
      const syllablesRaw = Array.isArray(wordItem?.Syllables) ? wordItem.Syllables : [];
      const perWordPhonemes: Array<{
        phoneme: string;
        spokenPhoneme: string | null;
        accuracy: number;
        level: 'red' | 'yellow' | 'green';
        suggestion: string;
      }> = [];
      for (const phonemeItem of phonemesRaw) {
        const phoneme = sanitizeText(phonemeItem?.Phoneme, 20);
        const accuracy = extractAccuracyScore(phonemeItem);
        if (!phoneme || accuracy === null) continue;
        const spokenPhoneme =
          typeof phonemeItem?.PronunciationAssessment?.NBestPhonemes?.[0]?.Phoneme === 'string'
            ? sanitizeText(phonemeItem.PronunciationAssessment.NBestPhonemes[0].Phoneme, 20)
            : '';
        const item = {
          phoneme,
          spokenPhoneme: spokenPhoneme || null,
          accuracy,
          level: toAccuracyLevel(accuracy),
          suggestion: buildArticulationHint(phoneme, spokenPhoneme || null),
        };
        perWordPhonemes.push(item);
        phonemeFeedback.push(item);
      }
      const perWordSyllables: Array<{
        phoneme: string;
        spokenPhoneme: null;
        accuracy: number;
        level: 'red' | 'yellow' | 'green';
        suggestion: string;
      }> = [];
      for (const syllableItem of syllablesRaw) {
        const syllable = sanitizeText(syllableItem?.Syllable, 40);
        const accuracy = extractAccuracyScore(syllableItem);
        if (!syllable || accuracy === null) continue;
        perWordSyllables.push({
          phoneme: syllable,
          spokenPhoneme: null,
          accuracy,
          level: toAccuracyLevel(accuracy),
          suggestion: '放慢語速，將此音節拆開重讀，先求清楚再求連貫。',
        });
      }
      if (perWordPhonemes.length === 0 && perWordSyllables.length > 0) {
        for (const s of perWordSyllables) {
          phonemeFeedback.push(s);
        }
      }
      const mappedLettersByPhoneme = splitWordIntoLetterSegments(word, perWordPhonemes.length);
      for (const [index, p] of perWordPhonemes.entries()) {
        letterSegments.push({
          text: word,
          letters: mappedLettersByPhoneme[index] || p.phoneme || word,
          phoneme: p.phoneme,
          spokenPhoneme: p.spokenPhoneme,
          accuracy: p.accuracy,
          level: p.level,
          suggestion: p.suggestion,
        });
      }
      if (perWordPhonemes.length === 0) {
        for (const s of perWordSyllables) {
          letterSegments.push({
            text: word,
            letters: s.phoneme,
            phoneme: s.phoneme,
            spokenPhoneme: null,
            accuracy: s.accuracy,
            level: s.level,
            suggestion: s.suggestion,
          });
        }
      }
      const accuracy =
        extractAccuracyScore(wordItem)
        ?? (perWordPhonemes.length > 0
          ? Math.round(perWordPhonemes.reduce((sum, item) => sum + item.accuracy, 0) / perWordPhonemes.length)
          : perWordSyllables.length > 0
            ? Math.round(perWordSyllables.reduce((sum, item) => sum + item.accuracy, 0) / perWordSyllables.length)
          : null);
      if (accuracy === null) return null;
      return { word, accuracy, level: toAccuracyLevel(accuracy) };
    })
    .filter((item): item is { word: string; accuracy: number; level: 'red' | 'yellow' | 'green' } => Boolean(item));

  const wordAvgScore = wordFeedback.length > 0
    ? Math.round(wordFeedback.reduce((sum, item) => sum + item.accuracy, 0) / wordFeedback.length)
    : null;
  const hasTopLevelScores =
    clampPronScore(pa?.PronScore) !== null
    || clampPronScore(pa?.AccuracyScore) !== null
    || clampPronScore(pa?.FluencyScore) !== null
    || clampPronScore(pa?.CompletenessScore) !== null
    || clampPronScore(pa?.ProsodyScore) !== null;
  const hasPronunciationAssessment =
    hasTopLevelScores || wordFeedback.length > 0 || phonemeFeedback.length > 0;
  const overallScore =
    clampPronScore(pa?.PronScore)
    ?? clampPronScore(pa?.AccuracyScore)
    ?? clampPronScore(pa?.FluencyScore)
    ?? clampPronScore(pa?.CompletenessScore)
    ?? extractAccuracyScore(wordsRaw[0])
    ?? wordAvgScore
    ?? 0;
  console.log(
    '[ai-proxy][pronunciation_assess] normalized-summary',
    JSON.stringify({
      hasPronunciationAssessment,
      overallScore,
      wordFeedbackCount: wordFeedback.length,
      phonemeFeedbackCount: phonemeFeedback.length,
      letterSegmentCount: letterSegments.length,
      hasTopLevelScores,
    })
  );

  return jsonResponse({
    result: {
      overallScore,
      accuracyScore: clampPronScore(pa?.AccuracyScore) ?? overallScore,
      fluencyScore: clampPronScore(pa?.FluencyScore) ?? overallScore,
      completenessScore: clampPronScore(pa?.CompletenessScore) ?? overallScore,
      prosodyScore: clampPronScore(pa?.ProsodyScore) ?? overallScore,
      hasPronunciationAssessment,
      wordFeedback,
      phonemeFeedback,
      letterSegments,
      recognitionStatus: sanitizeText(rawRecord.RecognitionStatus, 40) || 'Unknown',
      displayText:
        sanitizeText(best?.Display, 300)
        || sanitizeText(rawRecord.DisplayText, 300)
        || sanitizeText(best?.Lexical, 300),
      wavFormat,
      raw,
    },
  });
}

async function executeAction(action: Action, payload: unknown): Promise<Response> {
  if (action === 'analyze_text') {
    return await handleAnalyzeText(payload as AnalyzeTextPayload);
  }
  if (action === 'generate_card') {
    return await handleGenerateCard(payload as GenerateCardPayload);
  }
  if (action === 'analyze_context') {
    return await handleAnalyzeContext(payload as AnalyzeContextPayload);
  }
  if (action === 'analyze_and_generate_card') {
    return await handleAnalyzeAndGenerate(payload as AnalyzeAndGeneratePayload);
  }
  if (action === 'pronunciation_assess') {
    return await handlePronunciationAssess(payload as PronunciationAssessPayload);
  }
  return jsonResponse({ error: 'Unsupported action' }, 400);
}

type AsyncTaskRecord = {
  id: string;
  userId: string;
  action: Action;
  status: 'queued' | 'running' | 'done' | 'error';
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
};

async function createTask(userId: string, action: Action): Promise<AsyncTaskRecord | null> {
  const kv = await getKvClient();
  if (!kv) return null;
  const nowIso = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId,
    action,
    status: 'queued',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

async function saveTask(task: AsyncTaskRecord): Promise<void> {
  const kv = await getKvClient();
  if (!kv) return;
  await kv.set(
    ['ai-task', task.userId, task.id],
    task,
    { expireIn: Math.max(1, AI_TASK_TTL_HOURS) * 60 * 60 * 1000 }
  );
}

async function processTask(task: AsyncTaskRecord, payload: unknown): Promise<void> {
  const runningTask: AsyncTaskRecord = {
    ...task,
    status: 'running',
    updatedAt: new Date().toISOString(),
  };
  await saveTask(runningTask);
  try {
    const response = await executeAction(task.action, payload);
    const json = await response.clone().json();
    const doneTask: AsyncTaskRecord = {
      ...runningTask,
      status: 'done',
      result: json,
      updatedAt: new Date().toISOString(),
    };
    await saveTask(doneTask);
  } catch (error) {
    const failedTask: AsyncTaskRecord = {
      ...runningTask,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unexpected error',
      updatedAt: new Date().toISOString(),
    };
    await saveTask(failedTask);
  }
}

async function getTaskResult(userId: string, payload?: GetTaskResultPayload): Promise<Response> {
  const taskId = sanitizeText(payload?.taskId, 100);
  if (!taskId) {
    return jsonResponse({ error: 'taskId is required' }, 400);
  }
  const kv = await getKvClient();
  if (!kv) {
    return jsonResponse(
      {
        error: 'Task store unavailable',
        reason: 'task_store_unavailable',
      },
      503
    );
  }
  const entry = await kv.get(['ai-task', userId, taskId]);
  if (!entry.value) {
    return jsonResponse({ error: 'Task not found', taskId }, 404);
  }
  const task = entry.value as AsyncTaskRecord;
  return jsonResponse({
    result: {
      taskId: task.id,
      status: task.status,
      action: task.action,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      response: task.result,
      error: task.error,
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
    const userPromise = getUserIdFromAuthorization(req);
    const bodyPromise = req.json().catch(() => null);
    const userId = await userPromise;
    if (!userId) {
      return jsonResponse({ error: 'Unauthorized: missing valid JWT' }, 401);
    }
    const parsedBody = await bodyPromise;
    if (!parsedBody) {
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
    const body = parsedBody as RequestBody;

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

      if (body.action === 'usage_summary') {
        return await getUsageSummary(userId, body.payload as UsageSummaryPayload);
      }
      if (body.action === 'get_task_result') {
        return await getTaskResult(userId, body.payload as GetTaskResultPayload);
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

      if (body.async === true && BILLABLE_ACTIONS.has(body.action)) {
        const task = await createTask(userId, body.action);
        if (!task) {
          return jsonResponse(
            {
              error: 'Task queue unavailable',
              reason: 'task_store_unavailable',
            },
            503
          );
        }
        await saveTask(task);
        const runner = processTask(task, body.payload);
        const edgeRuntime = (globalThis as any).EdgeRuntime;
        if (edgeRuntime && typeof edgeRuntime.waitUntil === 'function') {
          edgeRuntime.waitUntil(runner);
        } else {
          runner.catch((err) => console.error('[ai-proxy] async task failed', err));
        }
        await trackUsage({
          userId,
          action: body.action,
          status: 'queued',
          meta: { taskId: task.id },
        });
        return jsonResponse({
          result: {
            taskId: task.id,
            status: task.status,
            action: task.action,
          },
        }, 202);
      }

      const response = await executeAction(body.action, body.payload);
      let debugMeta: Record<string, unknown> | undefined;
      try {
        const parsed = await response.clone().json() as {
          meta?: {
            route?: ModelRoute;
            metrics?: AIExecutionMetrics;
          };
        };
        if (parsed.meta) {
          debugMeta = {
            ...(debugMeta || {}),
            modelRoute: parsed.meta.route,
            metrics: parsed.meta.metrics,
          };
        }
      } catch {
        // ignore
      }
      if (body.action === 'analyze_context') {
        try {
          const payload = body.payload as AnalyzeContextPayload;
          const parsed = await response.clone().json() as {
            result?: {
              keyword?: string;
              definition?: string;
              contextualExplanation?: string;
              frequentCollocations?: string;
              pronunciation?: string | null;
            };
            meta?: {
              metrics?: AIExecutionMetrics;
              route?: ModelRoute;
            };
          };
          debugMeta = {
            ...(debugMeta || {}),
            input: {
              targetText: sanitizeText(payload.targetText, 120),
              originalSentence: sanitizeText(payload.originalSentence, 600),
              contextText: sanitizeText(payload.contextText, 600),
            },
            output: {
              keyword: sanitizeText(parsed?.result?.keyword, 120),
              definition: sanitizeText(parsed?.result?.definition, 600),
              contextualExplanation: sanitizeText(parsed?.result?.contextualExplanation, 600),
              frequentCollocations: sanitizeText(parsed?.result?.frequentCollocations, 600),
              pronunciation:
                typeof parsed?.result?.pronunciation === 'string'
                  ? sanitizeText(parsed.result.pronunciation, 120)
                  : '',
            },
          };
        } catch {
          debugMeta = { debug: 'failed_to_capture_analyze_context_result' };
        }
      }
      await trackUsage({
        userId,
        action: body.action,
        status: 'success',
        meta: debugMeta,
      });
      return response;
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
      const compactedMessages = compactMessages(body.messages);
      if (!compactedMessages.length) {
        return jsonResponse(
          { error: 'Invalid payload: no usable messages after compaction' },
          400
        );
      }

      if (body.provider === 'openai') {
        const route = routeOpenAIModelForAction({
          action: 'legacy_openai',
          payloadSize: compactedMessages.reduce((sum, item) => sum + item.content.length, 0),
          requested: options.model,
        });
        if (options.stream) {
          await trackUsage({
            userId,
            action: 'legacy_openai',
            status: 'success',
            meta: { mode: 'stream', route },
          });
          return await buildOpenAIStreamResponse({
            model: route.model,
            messages: compactedMessages,
            temperature:
              typeof options.temperature === 'number' ? options.temperature : 0.7,
            maxTokens,
          });
        }
        const result = await callOpenAIChat({
          model: route.model,
          messages: compactedMessages,
          temperature:
            typeof options.temperature === 'number' ? options.temperature : 0.7,
          maxTokens,
          jsonMode: options.jsonMode,
        });
        await trackUsage({
          userId,
          action: 'legacy_openai',
          status: 'success',
          meta: {
            route,
            metrics: result.metrics,
          },
        });
        return jsonResponse({ content: result.content, meta: { route, metrics: result.metrics } });
      }

      if (body.provider === 'gemini') {
        const model = pickModel(options.model, GEMINI_ALLOWED_MODELS, GEMINI_ALLOWED_MODELS[0]);
        const result = await callGeminiLegacy({
          model,
          messages: compactedMessages,
          temperature:
            typeof options.temperature === 'number' ? options.temperature : 0.7,
          maxTokens,
        });
        await trackUsage({
          userId,
          action: 'legacy_gemini',
          status: 'success',
          meta: {
            model,
            metrics: result.metrics,
          },
        });
        return jsonResponse({
          content: result.content,
          meta: {
            model,
            metrics: result.metrics,
          },
        });
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
