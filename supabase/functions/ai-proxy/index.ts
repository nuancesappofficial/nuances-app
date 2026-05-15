// Supabase Edge Function: ai-proxy
// Securely proxies AI requests so API keys never live in the mobile app.
declare const Deno: any;
import {
  getAuthenticatedUserFromAuthorization,
  getUserIdFromAuthorization,
} from './auth/resolveUserFromBearerToken.ts';
import { createServiceRoleClient, resolveServerEntitlement } from '../_shared/entitlement.ts';
import { corsHeaders, jsonResponse } from './_shared/httpResponse.ts';
import { handlePronunciationAssess } from './providers/azureProvider.ts';
import { callGeminiLegacy, routeGeminiModelForAction } from './providers/geminiProvider.ts';
import {
  buildOpenAIStreamResponse,
  callOpenAIChat,
  routeOpenAIModelForAction,
} from './providers/openaiProvider.ts';
import {
  clampTokens,
  sanitizeText,
} from './_shared/requestSanitizers.ts';
import {
  AI_MAX_CONTEXT_CHARS,
  AI_MAX_CONTEXT_MESSAGES,
  AI_MAX_MESSAGE_CHARS,
  AI_TASK_TTL_HOURS,
  ALLOW_BILLABLE_WITHOUT_KV,
  DAILY_QUOTA,
  MAX_AUDIO_BASE64_CHARS,
  MAX_SENTENCE_CHARS,
  MAX_TOKENS_GENERATE,
  MAX_TOKENS_LEGACY,
  MAX_WORD_CHARS,
  RATE_LIMIT_PER_MINUTE,
  USAGE_RECENT_LIMIT_MAX,
  USAGE_RETENTION_DAYS,
} from './_shared/runtimeConfig.ts';

const DEV_ENTITLEMENT_BYPASS_ENABLED =
  (Deno.env.get('SUBSCRIPTION_DEV_BYPASS') ?? '').trim().toLowerCase() === 'true';

type Provider = 'openai' | 'gemini';
type Action =
  | 'generate_card'
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

type GenerateCardPayload = {
  targetWord: string;
  originalSentence: string;
  includePronunciation?: boolean;
  replyLanguage?: string;
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
    | GenerateCardPayload
    | PronunciationAssessPayload
    | UsageSummaryPayload
    | GetTaskResultPayload;
  async?: boolean;
};

type RequestBody = LegacyRequestBody | ActionRequestBody;

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
  'generate_card',
  'pronunciation_assess',
  'usage_summary',
  'get_task_result',
]);
const BILLABLE_ACTIONS = new Set<Action>([
  'generate_card',
  'pronunciation_assess',
]);
const LOG_RAW_GEMINI = String(Deno.env.get('AI_LOG_RAW_GEMINI') || '').toLowerCase() === 'true';
const GENERATE_CARD_MODEL =
  sanitizeText(Deno.env.get('AI_GENERATE_CARD_MODEL') || '', 120) ||
  'gemini-2.5-flash';
const GENERATE_CARD_FALLBACK_MODELS = String(
  Deno.env.get('AI_GENERATE_CARD_FALLBACK_MODELS') || 'gemini-2.0-flash-lite,gemini-3-flash-preview'
)
  .split(',')
  .map((item) => sanitizeText(item, 120))
  .filter(Boolean);

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

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function extractFirstJsonObject(raw: string): string | null {
  if (!raw) return null;
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }
  return null;
}

function normalizeHeadword(input: unknown, fallback: string): string {
  const cleaned = sanitizeText(input, MAX_WORD_CHARS)
    .toLowerCase()
    .replace(/[^a-z'\-\s]/g, ' ')
    .trim();
  const firstToken = cleaned.split(/\s+/).find(Boolean) || '';
  if (firstToken) return firstToken;
  return sanitizeText(fallback, MAX_WORD_CHARS)
    .toLowerCase()
    .replace(/[^a-z'\-]/g, '')
    .trim();
}

function resolveReplyLanguageMeta(input: unknown): {
  code: 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko';
  label: string;
} {
  const normalized = sanitizeText(input, 20).toLowerCase();
  if (normalized === 'zh-cn' || normalized === 'zh_hans' || normalized === 'zh-hans' || normalized === 'cn') {
    return { code: 'zh-CN', label: 'Simplified Chinese' };
  }
  if (normalized === 'en' || normalized === 'en-us' || normalized === 'en-gb') {
    return { code: 'en', label: 'English' };
  }
  if (normalized === 'ja' || normalized === 'ja-jp' || normalized === 'jp') {
    return { code: 'ja', label: 'Japanese' };
  }
  if (normalized === 'ko' || normalized === 'ko-kr' || normalized === 'kr') {
    return { code: 'ko', label: 'Korean' };
  }
  return { code: 'zh-TW', label: 'Traditional Chinese' };
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shouldTrustModelNormalizedWord(
  originalSentence: string,
  targetWord: string,
  modelNormalizedWord: string
): boolean {
  if (!modelNormalizedWord) return false;
  const targetNormalized = normalizeHeadword(targetWord, targetWord);
  if (!targetNormalized) return true;
  if (modelNormalizedWord === targetNormalized) return true;

  const sentence = originalSentence.toLowerCase();
  const tokenRegex = new RegExp(`(^|[^a-z'])${escapeRegExp(targetNormalized)}([^a-z']|$)`, 'i');
  const targetAppearsVerbatim = tokenRegex.test(sentence);
  const obviousInflection =
    modelNormalizedWord.startsWith(targetNormalized) ||
    targetNormalized.startsWith(modelNormalizedWord);

  if (!targetAppearsVerbatim) return true;
  return obviousInflection;
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

function levenshteinDistance(a: string, b: string): number {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  const rows = aa.length + 1;
  const cols = bb.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[rows - 1][cols - 1];
}

function shouldApplyTypoCorrection(
  originalSentence: string,
  targetWord: string,
  correction: string
): boolean {
  const target = normalizeHeadword(targetWord, targetWord);
  const corrected = normalizeHeadword(correction, '');
  if (!target || !corrected || target === corrected) return false;

  const sentence = originalSentence.toLowerCase();
  const tokenRegex = new RegExp(`(^|[^a-z'])${escapeRegExp(target)}([^a-z']|$)`, 'i');
  const targetAppearsVerbatim = tokenRegex.test(sentence);
  const distance = levenshteinDistance(target, corrected);
  const shortToken = target.length <= 3;

  if (shortToken && distance > 1) return false;
  if (!shortToken && distance > 2) return false;
  if (targetAppearsVerbatim && distance > 1) return false;
  return true;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  if (payload.replyLanguage !== undefined && typeof payload.replyLanguage !== 'string') {
    errors.push('payload.replyLanguage must be a string when provided');
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
  if (action === 'generate_card') return validateGenerateCardPayload(payload);
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
    'generate_card',
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

// ==========================================
// 🚀 UPDATED GENERATE CARD LOGIC
// ==========================================
async function handleGenerateCard(payload: GenerateCardPayload): Promise<Response> {
  const targetWord = sanitizeText(payload.targetWord, MAX_WORD_CHARS);
  const originalSentence = sanitizeText(payload.originalSentence, MAX_SENTENCE_CHARS);
  const replyLanguage = resolveReplyLanguageMeta(payload.replyLanguage);

  if (!targetWord || !originalSentence) {
    return jsonResponse({ error: 'targetWord and originalSentence are required' }, 400);
  }

  const prompt = `
Analyze the word "${targetWord}" within this sentence: "${originalSentence}".
Output a JSON object with the following exact keys:
- "normalizedTargetWord": The base form of the word.
- "partOfSpeech": The grammatical role in the sentence.
- "definition": The primary meaning in this specific context (in ${replyLanguage.label}).
- "contextualExplanation": Explain why it means this, citing sentence context or cultural slang usage (in ${replyLanguage.label}).
- "frequentCollocations": Provide 1 to 3 natural collocations or short phrases using this exact meaning, comma-separated (in the source language of the target word).
- "example": Provide another example sentence using one of the collocations above and this exact meaning (in ${replyLanguage.label}).
- "tags": Array of strings (e.g., ["slang", "hip-hop", "noun"]).
`;

  const generateCardSystemInstruction = [
    'You are a multilingual, slang-aware lexicography assistant.',
    'Be fluent in contemporary internet and youth-culture language, including emergent slang and second-culture usage across English, Chinese, Korean, and Japanese.',
    'Prioritize in-context meaning over traditional dictionary defaults when sentence context indicates slang, meme, gaming, music, social media, or community-specific usage.',
    'Apply your knowledge of modern cultural references even if the provided sentence is short or lacks explicit context.',
    `Use ${replyLanguage.label} for natural-language output fields (especially definition/contextualExplanation/example) unless the user explicitly requests another language.`,
    'Always provide at least one usable collocation or short phrase in frequentCollocations. Prefer concrete, common combinations over isolated single words.',
    'Make the example sentence sound natural and clearly demonstrate one of the collocations you returned.',
    'If meaning is ambiguous, explicitly mark uncertainty and provide concise alternatives.',
    'Return strict JSON only matching the requested schema. Keep each field concise.'
  ].join(' ');

  const modelCandidates = Array.from(
    new Set([GENERATE_CARD_MODEL, ...GENERATE_CARD_FALLBACK_MODELS])
  );
  let parsed: any = null;
  let aiResponse: any = null;
  let lastErrorMsg = '';
  let usedModel = modelCandidates[0] || GENERATE_CARD_MODEL;

  for (let attempt = 1; attempt <= modelCandidates.length; attempt++) {
    const modelName = modelCandidates[attempt - 1] || GENERATE_CARD_MODEL;
    try {
      aiResponse = await callGeminiLegacy({
        model: modelName,
        messages: [
          {
            role: 'system',
            content: generateCardSystemInstruction,
          },
          { role: 'user', content: prompt },
        ],
        maxTokens: MAX_TOKENS_GENERATE,
        temperature: 0.6,
        jsonMode: true,
      });
      usedModel = modelName;

      if (LOG_RAW_GEMINI) {
        const rawBody = String(aiResponse.content || '');
        console.log('[ai-proxy][generate_card][raw]', {
          attempt,
          model: modelName,
          targetWord,
          originalSentence,
          replyLanguage: replyLanguage.code,
          rawContentLength: rawBody.length,
          rawContentPreview: rawBody.slice(0, 2500),
        });
      }

      // Robust JSON extraction with brace-balance parser.
      const rawContent = aiResponse.content.trim();
      const jsonString = extractFirstJsonObject(rawContent);
      if (!jsonString) throw new Error('No JSON object found in response');
      parsed = JSON.parse(jsonString);
      if (parsed) break; 
    } catch (error) {
      lastErrorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[ai-proxy][generate_card] Attempt ${attempt} failed:`, lastErrorMsg);
    }
  }

  // 🚀 Explicit UI messages for Quota limits
  if (!parsed) {
    const loweredError = lastErrorMsg.toLowerCase();
    const isOutOfQuota = loweredError.includes('quota') || 
                         lastErrorMsg.includes('429') || 
                         lastErrorMsg.includes('limit');
    const isHighDemand = loweredError.includes('high demand');

    return jsonResponse({
      result: {
        normalizedTargetWord: normalizeHeadword(targetWord, targetWord),
        partOfSpeech: '',
        definition: isOutOfQuota ? '⚠️ 目前 AI 額度已用盡' : `${targetWord}（AI 暫時無法分析）`,
        contextualExplanation: isOutOfQuota 
          ? '請稍後再試，或聯絡開發者增加 API 額度。' 
          : isHighDemand
            ? 'AI 服務目前繁忙，已自動嘗試備援模型但仍失敗，請稍後重試。'
          : `發生錯誤：${lastErrorMsg.slice(0, 50)}... 請檢查網路連線。`,
        example: originalSentence,
        frequentCollocations: '',
        phoneticTranscription: null,
        tags: ['ai-error'],
      },
    });
  }

  // Robust Key parsing
  const normalizedTargetWord = normalizeHeadword(
    parsed.normalizedTargetWord ||
      parsed.correctedTargetWord ||
      parsed.lemma ||
      parsed.targetWord ||
      parsed.keyword,
    targetWord
  );
  const baseSafeNormalizedTargetWord = shouldTrustModelNormalizedWord(
    originalSentence,
    targetWord,
    normalizedTargetWord
  )
    ? normalizedTargetWord
    : normalizeHeadword(targetWord, targetWord);
  const isLikelyTypo = parseBooleanLike(
    parsed.isLikelyTypo ?? parsed.hasTypo ?? parsed.typo
  );
  const typoCorrection = normalizeHeadword(
    parsed.correctedTargetWord || parsed.correctedWord || '',
    ''
  );
  const isPartOfPhrase = parseBooleanLike(
    parsed.isPartOfPhrase ?? parsed.partOfPhrase ?? parsed.inPhrase
  );
  const detectedPhraseRaw = sanitizeText(
    parsed.detectedPhrase || parsed.phrase || parsed.mwe || '',
    160
  );
  const detectedPhrase = normalizeWhitespace(detectedPhraseRaw).toLowerCase();
  const confidence = Math.max(
    0,
    Math.min(
      1,
      typeof parsed.confidence === 'number'
        ? parsed.confidence
        : Number(parsed.confidence || 0)
    )
  );
  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives
      .filter((item: unknown) => typeof item === 'string')
      .map((item: string) => sanitizeText(item, 120))
      .filter(Boolean)
      .slice(0, 3)
    : [];
  const targetTokenInPhrase = detectedPhrase
    ? new RegExp(`(^|\\s)${escapeRegExp(targetWord.toLowerCase())}(\\s|$)`, 'i').test(detectedPhrase)
    : false;
  const normalizedTarget = normalizeHeadword(targetWord, targetWord);
  const isShortTarget = normalizedTarget.length > 0 && normalizedTarget.length <= 3;
  const wordCount = originalSentence.trim().split(/\s+/).filter(Boolean).length;
  const isLowContext = wordCount <= 4;
  const shouldForceAmbiguousOutput =
    isShortTarget &&
    isLowContext &&
    !isLikelyTypo &&
    confidence > 0 &&
    confidence < 0.78;

  let safeNormalizedTargetWord = baseSafeNormalizedTargetWord;
  if (isLikelyTypo && typoCorrection && shouldApplyTypoCorrection(originalSentence, targetWord, typoCorrection)) {
    safeNormalizedTargetWord = typoCorrection;
  }
  if (isPartOfPhrase && detectedPhrase && targetTokenInPhrase) {
    safeNormalizedTargetWord = detectedPhrase;
  }
  const ambiguousHint = alternatives.length
    ? `可能義項：${alternatives.join(' / ')}`
    : '需要更多上下文才能判定唯一意思';
  const safeDefinition = shouldForceAmbiguousOutput
    ? `此縮寫在此句脈絡可能有多種意思，${ambiguousHint}。`
    : sanitizeText(parsed.definition || '', 2000);
  const safeContextualExplanation = shouldForceAmbiguousOutput
    ? sanitizeText(
      `${originalSentence.replace(new RegExp(escapeRegExp(targetWord), 'ig'), `"${targetWord}"`)}\n此句語境不足，建議提供前後句以判定「${targetWord}」精確語意。`,
      2000
    )
    : sanitizeText(parsed.contextualExplanation || parsed['explanation'] || '', 2000);

  console.log('[ai-proxy][generate_card] disambiguation', {
    targetWord,
    modelNormalizedTargetWord: normalizedTargetWord,
    isLikelyTypo,
    typoCorrection,
    isPartOfPhrase,
    detectedPhrase,
    confidence,
    alternatives,
    shouldForceAmbiguousOutput,
    finalHeadword: safeNormalizedTargetWord,
  });

  return jsonResponse({
    result: {
      normalizedTargetWord: safeNormalizedTargetWord,
      meaningInContext: sanitizeText(parsed.meaningInContext || parsed.contextMeaning || '', 400),
      isLikelyTypo,
      correctedTargetWord: typoCorrection || '',
      typoReason: sanitizeText(parsed.typoReason || parsed.correctionReason || '', 200),
      isPartOfPhrase,
      detectedPhrase: detectedPhrase || '',
      confidence,
      alternatives,
      partOfSpeech: sanitizeText(parsed.partOfSpeech || parsed['part of speech'] || parsed['pos'] || '', 80),
      definition: safeDefinition,
      contextualExplanation: safeContextualExplanation,
      example: sanitizeText(parsed.example || '', 1200),
      frequentCollocations: sanitizeText(
        parsed.frequentCollocations || 
        parsed['frequent_collocations'] || 
        parsed['collocations'] || 
        parsed['Frequent collocations'] || '', 
        500
      ),
      phoneticTranscription: typeof (parsed.phoneticTranscription || parsed.pronunciation || parsed.ipa) === 'string' 
        ? sanitizeText(parsed.phoneticTranscription || parsed.pronunciation || parsed.ipa, 120) 
        : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['Vocabulary'],
    },
    meta: { modelUsed: usedModel, metrics: aiResponse?.metrics },
  });
}
// ==========================================

async function executeAction(action: Action, payload: unknown): Promise<Response> {
  if (action === 'generate_card') {
    return await handleGenerateCard(payload as GenerateCardPayload);
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
    const userPromise = getAuthenticatedUserFromAuthorization(req);
    const bodyPromise = req.json().catch(() => null);
    const authUser = await userPromise;
    const userId = authUser?.id ?? null;
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
    const supabase = createServiceRoleClient();
    const devPlan = (req.headers.get('x-nuances-dev-plan') ?? '').trim().toLowerCase();
    const entitlement =
      DEV_ENTITLEMENT_BYPASS_ENABLED && devPlan === 'premium'
        ? { planType: 'premium' as const }
        : await resolveServerEntitlement({ supabase, userId, user: authUser });
    const planType = entitlement.planType;

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
      if (planType === 'free' && BILLABLE_ACTIONS.has(body.action)) {
        return jsonResponse(
          {
            error: 'Premium or active trial required',
            reason: 'premium_required',
            planType,
            paywallType: body.action === 'pronunciation_assess' ? 'pronunciation' : 'ai_generate',
          },
          403
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
      await trackUsage({
        userId,
        action: body.action,
        status: 'success',
        meta: debugMeta,
      });
      return response;
    }

    if (planType === 'free') {
      return jsonResponse(
        {
          error: 'Premium or active trial required',
          reason: 'premium_required',
          planType,
          paywallType: 'ai_generate',
        },
        403
      );
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
        const route = routeGeminiModelForAction({
          action: 'legacy_gemini',
          payloadSize: compactedMessages.reduce((sum, item) => sum + item.content.length, 0),
          requested: options.model,
        });
        const result = await callGeminiLegacy({
          model: route.model,
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
            route,
            metrics: result.metrics,
          },
        });
        return jsonResponse({
          content: result.content,
          meta: {
            model: route.model,
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
