// Supabase Edge Function: ai-proxy
// Securely proxies AI requests so API keys never live in the mobile app.
import {
  getAuthenticatedUserFromAuthorization,
  getUserIdFromAuthorization,
} from './auth/resolveUserFromBearerToken.ts';
import { createServiceRoleClient, resolveServerEntitlement } from '../_shared/entitlement.ts';
import { corsHeaders, jsonResponse } from './_shared/httpResponse.ts';
import {
  estimateWavDurationSecondsFromBase64,
  handlePronunciationAssess,
} from './providers/azureProvider.ts';
import {
  GeminiProviderError,
  buildGeminiStreamResponse,
  callGeminiLegacy,
  routeGeminiModelForAction,
} from './providers/geminiProvider.ts';
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
  MAX_AUDIO_BASE64_CHARS,
  MAX_SENTENCE_CHARS,
  MAX_TOKENS_GENERATE,
  MAX_TOKENS_LEGACY,
  MAX_WORD_CHARS,
  RATE_LIMIT_PER_MINUTE,
  USAGE_RECENT_LIMIT_MAX,
  USAGE_RETENTION_DAYS,
} from './_shared/runtimeConfig.ts';
import { incrementPostgresRateLimitCounter } from '../_shared/rateLimitStore.ts';
import { DependencyUnavailableError } from '../_shared/dependencyGuard.ts';
import {
  recordAICostEventInBackground,
  wrapAICostTrackedSSE,
} from './_shared/aiCostTracking.ts';
import { CARD_SUBJECT_SELECTION_INSTRUCTION } from './_shared/cardSubjectPrompt.ts';
import { FREE_STARTER_CARD_LIMIT } from './_shared/freeStarterAllowance.ts';
import { chooseLearningTerm } from './_shared/learningTermResolution.ts';

declare const Deno: any;

const DEV_ENTITLEMENT_BYPASS_ENABLED =
  (Deno.env.get('SUBSCRIPTION_DEV_BYPASS') ?? '').trim().toLowerCase() === 'true';

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
    console.error('[ai-proxy] SUBSCRIPTION_DEV_BYPASS is enabled in production; ignoring bypass header');
    return false;
  }
  return true;
}

type Provider = 'openai' | 'gemini';
type Action =
  | 'generate_card'
  | 'generate_card_stream'
  | 'generate_card_core_stream'
  | 'generate_card_enrichment_stream'
  | 'get_or_create_demo_card'
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
  generationId?: string;
  targetWord: string;
  originalSentence: string;
  cardSubject?: string;
  includePronunciation?: boolean;
  replyLanguage?: string;
  sourceLanguage?: string;
  aiBreakdownMode?: string;
  learningGoal?: 'ielts' | 'casual' | 'professional' | string;
  proficiencyStandard?: string;
  proficiencyLevel?: string;
  domain?: string;
  tone?: string;
  canonicalSubject?: string;
  partOfSpeech?: string;
  definition?: string;
  coreSentenceTranslation?: string;
};

type AIBreakdownMode = 'short_punchy' | 'context' | 'deep_dive';

const CARD_SECTION_BUDGETS: Record<AIBreakdownMode, {
  definitionChars: number;
  contextChars: number;
  exampleChars: number;
  sentenceTranslationChars: number;
  sentenceNotesChars: number;
  collocationChars: number;
  collocationCount: number;
  exampleCount: number;
  synonymCount: number;
  antonymCount: number;
  semanticRelationChars: number;
  runtimeTokens: number;
}> = {
  short_punchy: {
    definitionChars: 48,
    contextChars: 180,
    exampleChars: 420,
    sentenceTranslationChars: 520,
    sentenceNotesChars: 80,
    collocationChars: 150,
    collocationCount: 1,
    exampleCount: 1,
    synonymCount: 1,
    antonymCount: 1,
    semanticRelationChars: 90,
    runtimeTokens: 880,
  },
  context: {
    definitionChars: 48,
    contextChars: 360,
    exampleChars: 760,
    sentenceTranslationChars: 720,
    sentenceNotesChars: 120,
    collocationChars: 160,
    collocationCount: 2,
    exampleCount: 2,
    synonymCount: 2,
    antonymCount: 1,
    semanticRelationChars: 100,
    runtimeTokens: 1480,
  },
  deep_dive: {
    definitionChars: 48,
    contextChars: 520,
    exampleChars: 1180,
    sentenceTranslationChars: 860,
    sentenceNotesChars: 120,
    collocationChars: 170,
    collocationCount: 3,
    exampleCount: 3,
    synonymCount: 3,
    antonymCount: 2,
    semanticRelationChars: 110,
    runtimeTokens: 2160,
  },
};

function sanitizeDirectTargetTranslation(value: unknown, fallback: string, maxChars: number): string {
  const firstLine = String(value ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) || '';
  const cleaned = sanitizeText(firstLine, maxChars)
    .replace(/^(?:definition|translation|direct translation|翻譯|翻译|直譯|直译)\s*[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return sanitizeText(fallback, maxChars);

  const definitionLikePattern =
    /\b(means|meaning|refers to|used to|used for|describes|indicates|is when|a term for)\b|意思是|指的是|表示|用來|用于|用於|形容|描述|表示的是/i;
  if (definitionLikePattern.test(cleaned)) {
    return sanitizeText(fallback, maxChars);
  }

  return cleaned;
}

function isLowContextSourceInput(targetWord: string, originalSentence: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[“”"'‘’`「」『』()[\]{}.,!?;:。！？、，；：]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const normalizedTarget = normalize(targetWord);
  const normalizedSentence = normalize(originalSentence);
  const sourceWordCount = normalizedSentence.split(' ').filter(Boolean).length;

  return Boolean(normalizedTarget && normalizedSentence === normalizedTarget && sourceWordCount <= 2);
}


type UsageSummaryPayload = {
  day?: string;
  includeRecent?: boolean;
  limit?: number;
};

type PronunciationAssessPayload = {
  referenceText: string;
  audioBase64: string;
  locale?: string;
  demoExperience?: boolean;
};

type GetTaskResultPayload = {
  taskId: string;
};

type DemoCardPayload = {
  replyLanguage?: string;
};

type ActionRequestBody = {
  action: Action;
  payload?:
    | GenerateCardPayload
    | DemoCardPayload
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
      console.warn('[ai-proxy] Deno KV is unavailable in this runtime; rate limits will use Postgres fallback');
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
  'generate_card_stream',
  'generate_card_core_stream',
  'generate_card_enrichment_stream',
  'get_or_create_demo_card',
  'pronunciation_assess',
  'usage_summary',
  'get_task_result',
]);
const BILLABLE_ACTIONS = new Set<Action>([
  'generate_card',
  'generate_card_stream',
  'generate_card_core_stream',
  'generate_card_enrichment_stream',
  'pronunciation_assess',
]);
const STARTER_CARD_ACTIONS = new Set<Action>([
  'generate_card',
  'generate_card_stream',
  'generate_card_core_stream',
  'generate_card_enrichment_stream',
]);
const FREE_PRONUNCIATION_DAILY_QUOTA = Number(Deno.env.get('FREE_PRONUNCIATION_DAILY_QUOTA') ?? '5');
const PREMIUM_PRONUNCIATION_DAILY_QUOTA = Number(Deno.env.get('PREMIUM_PRONUNCIATION_DAILY_QUOTA') ?? '60');
const AI_DAILY_GENERATION_QUOTA = Number(Deno.env.get('AI_DAILY_GENERATION_QUOTA') ?? '100');
const AI_WEEKLY_GENERATION_QUOTA = Number(Deno.env.get('AI_WEEKLY_GENERATION_QUOTA') ?? '200');
const AI_MONTHLY_GENERATION_QUOTA = Number(Deno.env.get('AI_MONTHLY_GENERATION_QUOTA') ?? '800');
const PRONUNCIATION_WEEKLY_QUOTA = Number(Deno.env.get('PRONUNCIATION_WEEKLY_QUOTA') ?? '100');
const PRONUNCIATION_MONTHLY_QUOTA = Number(Deno.env.get('PRONUNCIATION_MONTHLY_QUOTA') ?? '300');
const LOG_AI_DIAGNOSTICS =
  String(Deno.env.get('AI_LOG_DIAGNOSTICS') ?? 'false').toLowerCase() === 'true';
const GENERATE_CARD_MODEL =
  sanitizeText(Deno.env.get('AI_GENERATE_CARD_MODEL') || '', 120) ||
  'gemini-3.5-flash';
const GENERATE_CARD_CLARITY_MODEL =
  sanitizeText(Deno.env.get('AI_GENERATE_CARD_CLARITY_MODEL') || '', 120) ||
  GENERATE_CARD_MODEL;
const GENERATE_CARD_APPLICATION_MODEL =
  sanitizeText(Deno.env.get('AI_GENERATE_CARD_APPLICATION_MODEL') || '', 120) ||
  GENERATE_CARD_MODEL;
const GENERATE_CARD_MASTERY_MODEL =
  sanitizeText(Deno.env.get('AI_GENERATE_CARD_MASTERY_MODEL') || '', 120) ||
  GENERATE_CARD_MODEL;
  const GENERATE_CARD_FALLBACK_MODELS = String(
    Deno.env.get('AI_GENERATE_CARD_FALLBACK_MODELS') || 'gemini-3.5-flash,gemini-3.1-flash-lite'
  )
  .split(',')
  .map((item) => sanitizeText(item, 120))
  .filter(Boolean);
const GENERATE_CARD_TOTAL_BUDGET_MS = Math.max(
  60000,
  Number(Deno.env.get('AI_GENERATE_CARD_TOTAL_BUDGET_MS') || '60000')
);
const GENERATE_CARD_MAX_MODEL_ATTEMPTS = 3;
const GENERATE_CARD_ATTEMPT_TIMEOUTS_MS = [15000, 15000, 15000] as const;
const OPENAI_GENERATE_CARD_MODEL =
  sanitizeText(Deno.env.get('OPENAI_GENERATE_CARD_MODEL') || '', 120) ||
  'gpt-4o-mini';
  const GEMINI_GENERATE_CARD_FALLBACK_MODEL =
  sanitizeText(Deno.env.get('GEMINI_GENERATE_CARD_FALLBACK_MODEL') || '', 120) ||
  'gemini-3.1-flash-lite'; // ⬅️ 換成最新最快的穩定輕量版！

type GenerateCardModelCandidate = {
  provider: 'openai' | 'gemini';
  model: string;
};

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

function createRequestId(prefix = 'ai'): string {
  try {
    const randomUUID = (globalThis as any)?.crypto?.randomUUID;
    if (typeof randomUUID === 'function') {
      return `${prefix}_${randomUUID.call((globalThis as any).crypto)}`;
    }
  } catch {
    // Fall through to timestamp-based ID.
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function userLogSuffix(userId?: string | null): string {
  if (!userId) return 'anonymous';
  return userId.slice(-8);
}

function logAIDiagnostic(
  event: string,
  meta: Record<string, unknown>,
  level: 'log' | 'warn' | 'error' = 'log'
) {
  if (level === 'log' && !LOG_AI_DIAGNOSTICS) return;
  const safeMeta = {
    service: 'ai-proxy',
    event,
    ...meta,
  };
  if (level === 'error') {
    console.error('[ai-proxy][diagnostic]', safeMeta);
    return;
  }
  if (level === 'warn') {
    console.warn('[ai-proxy][diagnostic]', safeMeta);
    return;
  }
  console.log('[ai-proxy][diagnostic]', safeMeta);
}

function logAIOutcome(
  event: string,
  meta: Record<string, unknown>
) {
  console.log('[ai-proxy][outcome]', {
    service: 'ai-proxy',
    event,
    ...meta,
  });
}

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
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned) return cleaned;
  return sanitizeText(fallback, MAX_WORD_CHARS)
    .toLowerCase()
    .replace(/[^a-z'\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSingleTokenWord(input: unknown, fallback: string): string {
  const normalized = normalizeHeadword(input, fallback);
  const firstToken = normalized.split(/\s+/).find(Boolean) || '';
  return firstToken;
}

function resolveReplyLanguageMeta(input: unknown): {
  code: 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko' | 'es' | 'fr';
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
  if (normalized === 'es' || normalized.startsWith('es-')) {
    return { code: 'es', label: 'Spanish' };
  }
  if (normalized === 'fr' || normalized.startsWith('fr-')) {
    return { code: 'fr', label: 'French' };
  }
  return { code: 'zh-TW', label: 'Traditional Chinese' };
}

function resolveSourceLanguageMeta(
  input: unknown,
  sourceText: string
): { code: 'ja' | 'ko' | 'zh' | 'es' | 'en'; label: string } {
  const normalized = sanitizeText(input, 20).toLowerCase();
  if (normalized === 'ja' || normalized === 'ja-jp' || normalized === 'jp') {
    return { code: 'ja', label: 'Japanese' };
  }
  if (normalized === 'ko' || normalized === 'ko-kr' || normalized === 'kr') {
    return { code: 'ko', label: 'Korean' };
  }
  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    return { code: 'zh', label: 'Chinese' };
  }
  if (normalized === 'es' || normalized.startsWith('es-')) {
    return { code: 'es', label: 'Spanish' };
  }
  if (normalized === 'en' || normalized.startsWith('en-')) {
    return { code: 'en', label: 'English' };
  }
  if (/[\u3040-\u30FF]/u.test(sourceText)) return { code: 'ja', label: 'Japanese' };
  if (/[\uAC00-\uD7AF]/u.test(sourceText)) return { code: 'ko', label: 'Korean' };
  if (/[\u3400-\u9FFF]/u.test(sourceText)) return { code: 'zh', label: 'Chinese' };
  if (/[¿¡ñÑáéíóúüÁÉÍÓÚÜ]/u.test(sourceText)) return { code: 'es', label: 'Spanish' };
  return { code: 'en', label: 'English' };
}

function getSourceLanguageInstruction(sourceLanguage: ReturnType<typeof resolveSourceLanguageMeta>): string {
  return `The learning/source language is ${sourceLanguage.label}. The final subject, collocations, synonyms, antonyms, and every example sentence must stay in ${sourceLanguage.label}; never replace them with English or another language. Only translation fields and context notes use the requested reply language.`;
}

function getNaturalReplyLanguageInstruction(
  replyLanguage: ReturnType<typeof resolveReplyLanguageMeta>
): string {
  if (replyLanguage.code === 'zh-TW') {
    return 'Use natural contemporary Taiwan Mandarin. Translate the meaning people would actually understand here; do not force dictionary wording or English part-of-speech shape.';
  }
  if (replyLanguage.code === 'zh-CN') {
    return 'Use natural contemporary Mainland Mandarin. Translate the meaning people would actually understand here; do not force dictionary wording or English part-of-speech shape.';
  }
  if (replyLanguage.code === 'ja') {
    return 'For definition, use one concise natural Japanese expression for what the subject means in this exact sentence. For context and sentence prose, use natural contemporary Japanese.';
  }
  if (replyLanguage.code === 'ko') {
    return 'For definition, use one concise natural Korean expression for what the subject means in this exact sentence. For context and sentence prose, use natural contemporary Korean.';
  }
  if (replyLanguage.code === 'es') {
    return 'For definition, use one concise natural Spanish expression for what the subject means in this exact sentence. For context and sentence prose, use natural contemporary Spanish.';
  }
  if (replyLanguage.code === 'fr') {
    return 'For definition, use one concise natural French expression for what the subject means in this exact sentence. For context and sentence prose, use natural contemporary French.';
  }
  return 'For definition, use one concise natural English expression for what the subject means in this exact sentence. For context and sentence prose, use plain contemporary English at approximately CEFR B1 reading level.';
}

function getLexicalDefinitionScopeInstruction(
  _replyLanguage: ReturnType<typeof resolveReplyLanguageMeta>
): string {
  return [
    'First understand the full sentence naturally, then choose the short UI definition from that understood meaning.',
    'The definition should be the natural word or short phrase in the reply language that best matches the target’s contribution here.',
    'Do not force a dictionary-style gloss when the local meaning is slang, a meme, an idiom, irony, or community shorthand.',
    'It should not encode a relationship assumption or implication that exists only in this source sentence.',
    'Move source-only implications and relationship assumptions into culturalBackground.',
    'If there is no exact word, use the shortest natural phrase with the same lexical meaning.',
  ].join(' ');
}

function getDomainRegisterSenseInstruction(): string {
  return 'Interpret the sentence as a native participant in its contemporary speech community would, resolving the intended sense before translating.';
}

function resolveAIBreakdownMode(input: unknown): AIBreakdownMode {
  const normalized = sanitizeText(input, 40).toLowerCase();
  if (normalized === 'short_punchy' || normalized === 'clarity' || normalized === 'quick') return 'short_punchy';
  if (normalized === 'context' || normalized === 'application' || normalized === 'detailed') return 'context';
  if (normalized === 'deep_dive' || normalized === 'deep dive' || normalized === 'mastery') return 'deep_dive';
  return 'context';
}

function getAIBreakdownModeInstruction(mode: AIBreakdownMode, replyLanguageLabel: string): string {
  const budget = CARD_SECTION_BUDGETS[mode];
  if (mode === 'short_punchy') {
    return [
      'Mode: Quick.',
      `definition <= ${budget.definitionChars} chars, one line and normally 1-4 words in ${replyLanguageLabel}.`,
      `sentenceTranslation <= ${budget.sentenceTranslationChars} chars total.`,
      `culturalBackground <= ${budget.contextChars} chars, 1-2 concise sentences explaining why the speaker/writer chose this word in this sentence, including tone or implication. Do not explain the subject as general knowledge.`,
      `Return ${budget.collocationCount} usage pair(s), each with one usage phrase and one example, unless the subject genuinely has fewer common reusable patterns.`,
    ].join(' ');
  }

  if (mode === 'deep_dive') {
    return [
      'Mode: Deep Dive.',
      `definition <= ${budget.definitionChars} chars, one line and normally 1-6 words: the single best natural in-context translation in ${replyLanguageLabel}.`,
      `sentenceTranslation <= ${budget.sentenceTranslationChars} chars total.`,
      `culturalBackground <= ${budget.contextChars} chars; give 3-4 useful sentences about the word's role in this sentence: why it fits, nearby-word interaction, tone/register, implication, and any useful contrast. Do not explain the subject as general knowledge.`,
      `Return ${budget.collocationCount} usage pairs, each with one example, unless the subject genuinely has fewer common reusable patterns. Prefer varied everyday, professional/abstract, and nuanced contexts.`,
    ].join(' ');
  }

  return [
    'Mode: Detailed.',
    `definition <= ${budget.definitionChars} chars, one line and normally 1-6 words: the single best natural in-context translation in ${replyLanguageLabel}.`,
    `sentenceTranslation <= ${budget.sentenceTranslationChars} chars total.`,
    `culturalBackground <= ${budget.contextChars} chars, 2-3 concise sentences about the word's role in this sentence: why it fits, nearby-word interaction, tone/register, and implication. Do not explain the subject as general knowledge.`,
    `Return ${budget.collocationCount} usage pairs, each with one example, unless the subject genuinely has fewer common reusable patterns. Prefer practical examples in different contexts.`,
  ].join(' ');
}

function getGenerateCardModelCandidates(_mode: AIBreakdownMode): GenerateCardModelCandidate[] {
  const candidates: GenerateCardModelCandidate[] = [
    { provider: 'openai', model: OPENAI_GENERATE_CARD_MODEL },
    { provider: 'gemini', model: GEMINI_GENERATE_CARD_FALLBACK_MODEL },
  ];
  return candidates
    .filter((candidate) => candidate.model)
    .filter((candidate, index, all) =>
      all.findIndex((item) => item.provider === candidate.provider && item.model === candidate.model) === index
    )
    .slice(0, GENERATE_CARD_MAX_MODEL_ATTEMPTS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function isTransientGeminiFailure(error: unknown): boolean {
  if (error instanceof GeminiProviderError && [429, 500, 502, 503, 504].includes(error.status)) {
    return true;
  }
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return [
    'high demand',
    'try again later',
    'resource exhausted',
    'temporarily unavailable',
    'service unavailable',
    'timed out',
    'timeout',
    'overloaded',
    'finishreason=max_tokens',
    'max_tokens',
  ].some((fragment) => message.includes(fragment));
}

function isNoJsonGeminiFailure(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes('no json object found');
}

function getGenerateCardRetryDelayMs(error: unknown, failedAttempt: number): number {
  if (error instanceof GeminiProviderError && typeof error.retryAfterMs === 'number') {
    return Math.min(8000, Math.max(2000, error.retryAfterMs)); // 給予更寬容的等待
  }
  // ✅ 真正的緩衝等待：第一次失敗等 3 秒，第二次失敗等 6 秒
  const baseMs = failedAttempt <= 1 ? 3000 : 6000;
  // 加入 Jitter (隨機抖動)，避免請求在同一毫秒撞車
  return baseMs + Math.floor(Math.random() * 1000);
}

function buildGenerateCardResponseSchema(sectionBudget: (typeof CARD_SECTION_BUDGETS)[AIBreakdownMode]) {
  return {
    type: 'OBJECT',
    properties: {
      sentenceTranslation: {
        type: 'STRING',
        description: 'Two lines: complete source sentence, then a natural target-language translation.',
      },
      meaningResolution: {
        type: 'OBJECT',
        description: 'What the target means in this sentence.',
        properties: {
          sentenceTranslation: { type: 'STRING' },
          targetTranslation: { type: 'STRING' },
          meaningHere: { type: 'STRING' },
          whyGoodFit: { type: 'STRING' },
          literalMeaningNote: { type: 'STRING' },
          confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
        },
        required: [
          'sentenceTranslation',
          'targetTranslation',
          'meaningHere',
          'whyGoodFit',
          'literalMeaningNote',
          'confidence',
        ],
      },
      definition: {
        type: 'STRING',
        description: 'Short natural in-context translation of the subject. One line, normally 1-6 words.',
      },
      normalizedTargetWord: { type: 'STRING' },
      lemma: {
        type: 'STRING',
        description: 'Single-word lemma for the target’s part of speech in context.',
      },
      lemmaMeaningPreserved: {
        type: 'BOOLEAN',
        description: 'Whether the lemma alone preserves the target’s corresponding contextual meaning.',
      },
      partOfSpeech: {
        type: 'STRING',
        enum: [
          'noun',
          'verb',
          'adjective',
          'adverb',
          'phrasal verb',
          'idiom',
          'fixed expression',
          'phrase',
          'slang',
          'proper noun',
          'other',
        ],
      },
      culturalBackground: {
        type: 'STRING',
        description: 'Explain the subject’s role in this sentence: why it fits, nearby-word interaction, tone/register, or implication. Do not give general encyclopedia knowledge about the subject.',
      },
      frequentCollocations: {
        type: 'ARRAY',
        minItems: 0,
        maxItems: sectionBudget.collocationCount,
        description: 'Reusable usage patterns containing the final card subject or a normal inflection. Empty only when no common pattern genuinely exists.',
        items: {
          type: 'OBJECT',
          properties: {
            phrase: { type: 'STRING' },
            translation: { type: 'STRING' },
          },
          required: ['phrase', 'translation'],
        },
      },
      example: {
        type: 'ARRAY',
        minItems: 0,
        maxItems: sectionBudget.exampleCount,
        description: 'Complete example sentences. Pair each item with frequentCollocations at the same array index.',
        items: {
          type: 'OBJECT',
          properties: {
            sentence: { type: 'STRING' },
            translation: { type: 'STRING' },
          },
          required: ['sentence', 'translation'],
        },
      },
      semanticRelations: {
        type: 'OBJECT',
        properties: {
          synonyms: {
            type: 'ARRAY',
            maxItems: sectionBudget.synonymCount,
            items: {
              type: 'OBJECT',
              properties: {
                term: { type: 'STRING' },
                translation: { type: 'STRING' },
              },
              required: ['term', 'translation'],
            },
          },
          antonyms: {
            type: 'ARRAY',
            maxItems: sectionBudget.antonymCount,
            items: {
              type: 'OBJECT',
              properties: {
                term: { type: 'STRING' },
                translation: { type: 'STRING' },
              },
              required: ['term', 'translation'],
            },
          },
        },
        required: ['synonyms', 'antonyms'],
      },
      isPartOfPhrase: { type: 'BOOLEAN' },
      detectedPhrase: { type: 'STRING' },
      phraseType: { type: 'STRING' },
      isEstablishedExpression: { type: 'BOOLEAN' },
      phraseConfidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
      phraseMinimalityConfidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
      phraseMeaningDiffers: { type: 'BOOLEAN' },
      isLikelyTypo: { type: 'BOOLEAN' },
      correctedTargetWord: { type: 'STRING' },
      typoReason: { type: 'STRING' },
      tags: {
        type: 'ARRAY',
        maxItems: 3,
        items: { type: 'STRING' },
      },
    },
    required: [
      'sentenceTranslation',
      'meaningResolution',
      'definition',
      'normalizedTargetWord',
      'lemma',
      'lemmaMeaningPreserved',
      'partOfSpeech',
      'culturalBackground',
      'frequentCollocations',
      'example',
      'semanticRelations',
      'isPartOfPhrase',
      'detectedPhrase',
      'phraseType',
      'isEstablishedExpression',
      'phraseConfidence',
      'phraseMinimalityConfidence',
      'phraseMeaningDiffers',
      'isLikelyTypo',
      'correctedTargetWord',
      'typoReason',
      'tags',
    ],
  };
}

function getGenerateCardRuntimeOptions(mode: AIBreakdownMode): {
  maxTokens: number;
  temperature: number;
} {
  return {
    maxTokens: CARD_SECTION_BUDGETS[mode].runtimeTokens,
    temperature: 0.1,
  };
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
  const targetNormalized = normalizeSingleTokenWord(targetWord, targetWord);
  if (!targetNormalized) return true;
  if (modelNormalizedWord === targetNormalized) return true;

  const sentence = originalSentence.toLowerCase();
  const tokenRegex = new RegExp(`(^|[^a-z'])${escapeRegExp(targetNormalized)}([^a-z']|$)`, 'i');
  const targetAppearsVerbatim = tokenRegex.test(sentence);
  const obviousInflection = isPlausibleEnglishLemma(targetNormalized, modelNormalizedWord);
  const targetTokenInPhrase = modelNormalizedWord
    .split(/\s+/)
    .filter(Boolean)
    .includes(targetNormalized);

  if (targetTokenInPhrase && modelNormalizedWord.includes(' ')) {
    const normalizedSentence = normalizeLexicalSequence(originalSentence);
    const normalizedPhrase = normalizeLexicalSequence(modelNormalizedWord);
    return Boolean(normalizedPhrase && (` ${normalizedSentence} `).includes(` ${normalizedPhrase} `));
  }

  if (!targetAppearsVerbatim) return true;
  if (targetTokenInPhrase) return true;
  return obviousInflection;
}

const IRREGULAR_ENGLISH_LEMMAS: Record<string, string> = {
  am: 'be',
  are: 'be',
  been: 'be',
  brought: 'bring',
  bought: 'buy',
  came: 'come',
  did: 'do',
  done: 'do',
  drank: 'drink',
  drunk: 'drink',
  ate: 'eat',
  eaten: 'eat',
  felt: 'feel',
  found: 'find',
  got: 'get',
  gotten: 'get',
  gave: 'give',
  given: 'give',
  went: 'go',
  gone: 'go',
  had: 'have',
  heard: 'hear',
  held: 'hold',
  kept: 'keep',
  knew: 'know',
  known: 'know',
  laid: 'lay',
  led: 'lead',
  left: 'leave',
  lost: 'lose',
  made: 'make',
  meant: 'mean',
  met: 'meet',
  paid: 'pay',
  put: 'put',
  read: 'read',
  risen: 'rise',
  rose: 'rise',
  ran: 'run',
  said: 'say',
  saw: 'see',
  seen: 'see',
  sat: 'sit',
  set: 'set',
  sold: 'sell',
  sent: 'send',
  spoke: 'speak',
  spoken: 'speak',
  stood: 'stand',
  struck: 'strike',
  stuck: 'stick',
  took: 'take',
  taken: 'take',
  taught: 'teach',
  thought: 'think',
  told: 'tell',
  understood: 'understand',
  was: 'be',
  were: 'be',
  won: 'win',
  wrote: 'write',
  written: 'write',
};

function englishInflectedForms(lemma: string): Set<string> {
  const normalizedLemma = normalizeSingleTokenWord(lemma, '');
  const forms = new Set<string>([
    normalizedLemma,
    `${normalizedLemma}s`,
    `${normalizedLemma}es`,
    `${normalizedLemma}ed`,
    `${normalizedLemma}ing`,
    `${normalizedLemma}er`,
    `${normalizedLemma}est`,
  ]);
  if (normalizedLemma.endsWith('e')) {
    forms.add(`${normalizedLemma}d`);
    forms.add(`${normalizedLemma.slice(0, -1)}ing`);
  }
  if (/[^aeiou]y$/i.test(normalizedLemma)) {
    forms.add(`${normalizedLemma.slice(0, -1)}ies`);
    forms.add(`${normalizedLemma.slice(0, -1)}ied`);
  }
  if (normalizedLemma.endsWith('ie')) {
    forms.add(`${normalizedLemma.slice(0, -2)}ying`);
  }
  if (normalizedLemma.endsWith('c')) {
    forms.add(`${normalizedLemma}ked`);
    forms.add(`${normalizedLemma}king`);
  }
  if (/[aeiou][^aeiouwxy]$/i.test(normalizedLemma)) {
    const last = normalizedLemma.slice(-1);
    forms.add(`${normalizedLemma}${last}ed`);
    forms.add(`${normalizedLemma}${last}ing`);
  }
  return forms;
}

function isPlausibleEnglishLemma(surface: string, lemma: string): boolean {
  const normalizedSurface = normalizeSingleTokenWord(surface, '');
  const normalizedLemma = normalizeSingleTokenWord(lemma, '');
  if (!normalizedSurface || !normalizedLemma) return false;
  if (IRREGULAR_ENGLISH_LEMMAS[normalizedSurface] === normalizedLemma) return true;
  const forms = englishInflectedForms(normalizedLemma);
  return forms.has(normalizedSurface);
}

/**
 * A model can correctly identify the lemma while overlooking a typo in the
 * selected inflected surface form. Recover the nearest regular surface form so
 * spelling confirmation and lexical normalization remain separate decisions.
 */
function inferCorrectedSurfaceFromLemma(surface: string, lemma: string): string {
  const normalizedSurface = normalizeSingleTokenWord(surface, '');
  const normalizedLemma = normalizeSingleTokenWord(lemma, '');
  if (
    !normalizedSurface ||
    !normalizedLemma ||
    normalizedSurface === normalizedLemma
  ) {
    return '';
  }

  const rankedForms = Array.from(englishInflectedForms(normalizedLemma))
    .filter(Boolean)
    .map((form) => ({
      form,
      distance: typoCorrectionDistance(normalizedSurface, form),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        Math.abs(left.form.length - normalizedSurface.length) -
          Math.abs(right.form.length - normalizedSurface.length)
    );
  const nearest = rankedForms[0];
  if (!nearest || nearest.form === normalizedSurface) return '';

  const maxDistance =
    normalizedSurface.length <= 3 ? 1 : normalizedSurface.length >= 8 ? 2 : 1;
  return nearest.distance <= maxDistance ? nearest.form : '';
}

function isAdjectivalPartOfSpeech(value: unknown): boolean {
  const normalized = sanitizeText(value, 80).toLowerCase();
  return (
    /\b(?:adj|adjective|participial adjective)\b/i.test(normalized) ||
    /形容(?:詞|词)?/u.test(normalized)
  );
}

function normalizeLexicalSequence(value: string): string {
  return (value || '')
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}'-]+/gu)
    ?.join(' ')
    .trim() || '';
}

function containsLexicalSequence(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeLexicalSequence(haystack);
  const normalizedNeedle = normalizeLexicalSequence(needle);
  if (!normalizedHaystack || !normalizedNeedle) return false;
  return (` ${normalizedHaystack} `).includes(` ${normalizedNeedle} `);
}

function compactLatinSequence(value: string): string {
  return normalizeHeadword(value, '').replace(/[^a-z]/g, '');
}

function isOCRSpacingRestoration(targetWord: string, candidate: string): boolean {
  const target = normalizeHeadword(targetWord, '');
  const restored = normalizeHeadword(candidate, '');
  const restoredTokens = restored.split(/\s+/).filter(Boolean);
  if (!/^[a-z]{5,24}$/.test(target)) return false;
  if (restoredTokens.length < 2 || restoredTokens.length > 5) return false;
  if (restoredTokens.some((token) => !/^[a-z]+$/.test(token))) return false;
  return compactLatinSequence(restored) === target;
}

function firstOCRSpacingRestoration(targetWord: string, ...candidates: string[]): string {
  return candidates.find((candidate) => isOCRSpacingRestoration(targetWord, candidate)) || '';
}

type PhraseEvidence = {
  phraseType: unknown;
  isEstablishedExpression: unknown;
  phraseConfidence: unknown;
  phraseMinimalityConfidence: unknown;
  phraseMeaningDiffers: unknown;
};

function isConfirmedDetectedPhrase(
  originalSentence: string,
  targetWord: string,
  phrase: string,
  evidence: PhraseEvidence
): boolean {
  const source = normalizeLexicalSequence(originalSentence);
  const target = normalizeLexicalSequence(targetWord);
  const candidate = normalizeLexicalSequence(phrase);
  const candidateTokens = candidate.split(/\s+/).filter(Boolean);
  const phraseType = sanitizeText(evidence.phraseType, 32).toLowerCase().replace(/[\s-]+/g, '_');
  const acceptedPhraseType =
    phraseType === 'phrasal_verb' ||
    phraseType === 'idiom' ||
    phraseType === 'fixed_expression';
  const phraseConfidence = Math.max(0, Math.min(1, Number(evidence.phraseConfidence || 0)));
  const minimalityConfidence = Math.max(
    0,
    Math.min(1, Number(evidence.phraseMinimalityConfidence || 0))
  );
  const rawCandidate = normalizeWhitespace(phrase)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .trim();
  if (!source || !target || !candidate) return false;
  if (candidate === target || candidateTokens.length < 2 || candidateTokens.length > 10) return false;
  if (isOCRSpacingRestoration(targetWord, phrase)) return false;
  if (!acceptedPhraseType) return false;
  if (!parseBooleanLike(evidence.isEstablishedExpression)) return false;
  if (!parseBooleanLike(evidence.phraseMeaningDiffers)) return false;
  if (phraseConfidence < 0.95 || minimalityConfidence < 0.95) return false;
  // Commas, semicolons, and colons indicate a clause/list, not one lexical unit.
  if (/[,;:]/u.test(rawCandidate)) return false;
  if (!(` ${source} `).includes(` ${candidate} `)) return false;
  if (!(` ${candidate} `).includes(` ${target} `)) return false;
  // A whole source sentence is only eligible when the expression itself is
  // conventionally sentence-shaped (for example, a full-clause idiom).
  if (candidate === source && candidateTokens.length >= 4 && phraseType !== 'idiom') return false;
  return true;
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

function firstText(maxLen: number, ...values: unknown[]): string {
  for (const value of values) {
    const text = sanitizeText(value, maxLen);
    if (text) return text;
  }
  return '';
}

function normalizeCollocationItem(value: unknown, maxItemChars: number): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const contentBudget = Math.max(96, maxItemChars - 3);
    const phraseBudget = Math.max(24, Math.floor(contentBudget * 0.58));
    const translationBudget = Math.max(48, contentBudget - phraseBudget);
    const phrase = sanitizeText(
      record.phrase || record.collocation || record.source || record.text,
      phraseBudget
    );
    const translation = sanitizeText(
      record.translation || record.meaning || record.translated || record.replyLanguageTranslation,
      translationBudget
    );
    if (phrase && translation) return `${phrase} — ${translation}`;
    return sanitizeText(phrase || translation, maxItemChars);
  }
  return sanitizeText(value, maxItemChars);
}

function collocationPhraseFromValue(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return sanitizeText(record.phrase || record.collocation || record.source || record.text, 240);
  }
  return sanitizeText(value, 240).split(/\s+[—–-]\s+/)[0]?.trim() || '';
}

const COLLOCATION_PLACEHOLDER_TOKENS = new Set([
  'one',
  "one's",
  'oneself',
  'somebody',
  "somebody's",
  'someone',
  "someone's",
  'something',
  "something's",
]);

function collocationContainsSubject(phrase: string, subject: string): boolean {
  const phraseKey = normalizeLexicalSequence(phrase);
  const subjectKey = normalizeLexicalSequence(subject);
  const phraseTokens = phraseKey.split(/\s+/).filter(Boolean);
  if (!phraseKey || !subjectKey) return false;
  if ((` ${phraseKey} `).includes(` ${subjectKey} `)) return true;

  const subjectAnchors = subjectKey
    .split(/\s+/)
    .filter((token) => token && !COLLOCATION_PLACEHOLDER_TOKENS.has(token));
  if (subjectAnchors.length === 0) return false;

  return subjectAnchors.every((anchor) =>
    phraseTokens.some((token) =>
      token === anchor ||
      isPlausibleEnglishLemma(token, anchor) ||
      (!/[a-z]/i.test(anchor) && token.includes(anchor))
    )
  );
}

function exampleSentenceFromValue(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return sanitizeText(record.sentence || record.example || record.source || record.text, 1200);
  }
  return sanitizeText(value, 1200).split(/\s+[—–-]\s+/)[0]?.trim() || '';
}

function exampleRealizesCollocation(sentence: string, collocation: string): boolean {
  const sentenceKey = normalizeLexicalSequence(sentence);
  const collocationKey = normalizeLexicalSequence(collocation);
  if (!sentenceKey || !collocationKey) return false;
  if ((` ${sentenceKey} `).includes(` ${collocationKey} `)) return true;

  const sentenceTokens = sentenceKey.split(/\s+/).filter(Boolean);
  const anchors = collocationKey
    .split(/\s+/)
    .filter((token) => token && !COLLOCATION_PLACEHOLDER_TOKENS.has(token));
  return anchors.length > 0 && anchors.every((anchor) =>
    sentenceTokens.some((token) =>
      token === anchor ||
      isPlausibleEnglishLemma(token, anchor) ||
      (!/[a-z]/i.test(anchor) && token.includes(anchor))
    )
  );
}

function filterUsagePairs(
  collocationValue: unknown,
  exampleValue: unknown,
  subject: string
): { collocations: unknown[]; examples: unknown[] } {
  const collocations = Array.isArray(collocationValue)
    ? collocationValue
    : sanitizeText(collocationValue, 1800)
      .split(/[\n;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  const examples = Array.isArray(exampleValue)
    ? exampleValue
    : sanitizeText(exampleValue, 3600)
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);

  const validPairs = collocations
    .map((collocation, index) => ({
      collocation,
      example: examples[index],
      phrase: collocationPhraseFromValue(collocation),
      sentence: exampleSentenceFromValue(examples[index]),
    }))
    .filter(({ phrase }) => collocationContainsSubject(phrase, subject))
    .filter(({ example, phrase, sentence }) =>
      Boolean(example && exampleRealizesCollocation(sentence, phrase))
    );

  return {
    collocations: validPairs.map(({ collocation }) => collocation),
    examples: validPairs.map(({ example }) => example),
  };
}

function normalizeCollocations(
  value: unknown,
  limit = 2,
  maxItemChars = 60,
  forbiddenSubject = ''
): string {
  const subjectKey = normalizeLexicalSequence(forbiddenSubject);
  const isAllowed = (item: unknown) => {
    const phrase = collocationPhraseFromValue(item);
    const phraseKey = normalizeLexicalSequence(phrase);
    return Boolean(
      phraseKey &&
      (!subjectKey || collocationContainsSubject(phrase, forbiddenSubject))
    );
  };
  if (Array.isArray(value)) {
    return value
      .filter(isAllowed)
      .map((item) => normalizeCollocationItem(item, maxItemChars))
      .filter(Boolean)
      .slice(0, limit)
      .join('\n');
  }
  return sanitizeText(value, 180)
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(isAllowed)
    .slice(0, limit)
    .map((item) => sanitizeText(item, maxItemChars))
    .join('\n');
}

function normalizeExamples(value: unknown, limit = 1, maxTotalChars = 140): string {
  const maxItemChars = Math.max(260, Math.floor(maxTotalChars / Math.max(1, limit)));
  const normalizeExampleItem = (item: unknown): string => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const contentBudget = Math.max(240, maxItemChars - 3);
      const sentenceBudget = Math.max(120, Math.floor(contentBudget * 0.58));
      const translationBudget = Math.max(100, contentBudget - sentenceBudget);
      const sentence = sanitizeText(
        record.sentence || record.example || record.source || record.text,
        sentenceBudget
      );
      const translation = sanitizeText(
        record.translation || record.meaning || record.translated || record.replyLanguageTranslation,
        translationBudget
      );
      if (sentence && translation) return `${sentence} — ${translation}`;
      return sanitizeText(sentence || translation, maxItemChars);
    }
    return sanitizeText(item, maxItemChars);
  };
  const rawItems = Array.isArray(value)
    ? value
    : sanitizeText(value, maxTotalChars * 2)
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);

  return rawItems
    .map((item) => normalizeExampleItem(item))
    .filter(Boolean)
    .slice(0, limit)
    .join('\n');
}

function normalizeSemanticRelations(
  value: unknown,
  synonymLimit: number,
  antonymLimit: number,
  maxItemChars: number
) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const normalizeItems = (items: unknown, limit: number) => {
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    return items
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const record = item as Record<string, unknown>;
        const term = sanitizeText(
          record.term || record.word || record.phrase,
          Math.ceil(maxItemChars * 0.55)
        );
        const translation = sanitizeText(
          record.translation || record.meaning,
          Math.ceil(maxItemChars * 0.45)
        );
        if (!term) return null;
        const key = term.toLocaleLowerCase();
        if (seen.has(key)) return null;
        seen.add(key);
        return translation ? { term, translation } : { term };
      })
      .filter(Boolean)
      .slice(0, limit);
  };

  return {
    synonyms: normalizeItems(source.synonyms, synonymLimit),
    antonyms: normalizeItems(source.antonyms, antonymLimit),
  };
}

function buildStructuredContextExplanation(params: {
  parsed: Record<string, unknown>;
  targetWord: string;
  definition: string;
  originalSentence: string;
  culturalBackgroundMaxChars?: number;
  sentenceTranslationMaxChars?: number;
  sentenceNotesMaxChars?: number;
  exampleMaxChars?: number;
  exampleCount?: number;
}): string {
  const {
    parsed,
    targetWord,
    definition,
    originalSentence,
    culturalBackgroundMaxChars = 240,
    sentenceTranslationMaxChars = 220,
    sentenceNotesMaxChars = 120,
    exampleMaxChars = 140,
    exampleCount = 1,
  } = params;
  const contextObject =
    parsed.contextualExplanation && typeof parsed.contextualExplanation === 'object' && !Array.isArray(parsed.contextualExplanation)
      ? parsed.contextualExplanation as Record<string, unknown>
      : {};
  const meaningResolution =
    parsed.meaningResolution && typeof parsed.meaningResolution === 'object' && !Array.isArray(parsed.meaningResolution)
      ? parsed.meaningResolution as Record<string, unknown>
      : {};

  const sentenceTranslation = firstText(
    sentenceTranslationMaxChars,
    meaningResolution.sentenceTranslation,
    parsed.sentenceTranslation,
    parsed.translation,
    contextObject.sentenceTranslation,
    contextObject.translation,
  );
  const sentenceNotes = firstText(
    sentenceNotesMaxChars,
    parsed.sentenceNotes,
    parsed.contextNote,
    parsed.usageNote,
    contextObject.sentenceNotes,
    contextObject.contextNote,
    parsed.contextualExplanation,
  );
  const culturalBackground = firstText(
    culturalBackgroundMaxChars,
    meaningResolution.whyGoodFit,
    meaningResolution.literalMeaningNote,
    meaningResolution.meaningHere,
    parsed.context,
    parsed.culturalBackground,
    parsed.culturalContext,
    parsed.usageFit,
    parsed.whyItFits,
    parsed.origin,
    contextObject.context,
    contextObject.culturalBackground,
    contextObject.culturalContext,
  );
  const exampleSentence = normalizeExamples(
    parsed.example || parsed.exampleSentence || parsed.naturalExample || contextObject.exampleSentence || contextObject.example,
    exampleCount,
    exampleMaxChars
  );

  return JSON.stringify({
    sentenceTranslation: sentenceTranslation || originalSentence || targetWord,
    sentenceNotes: sentenceNotes || '',
    culturalBackground: culturalBackground || '',
    exampleSentence,
  });
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

function typoCorrectionDistance(target: string, corrected: string): number {
  const adjacentTransposition =
    target.length === corrected.length &&
    (() => {
      const mismatches: number[] = [];
      for (let index = 0; index < target.length; index += 1) {
        if (target[index] !== corrected[index]) mismatches.push(index);
      }
      return (
        mismatches.length === 2 &&
        mismatches[1] === mismatches[0] + 1 &&
        target[mismatches[0]] === corrected[mismatches[1]] &&
        target[mismatches[1]] === corrected[mismatches[0]]
      );
    })();
  return adjacentTransposition ? 1 : levenshteinDistance(target, corrected);
}

function shouldApplyTypoCorrection(
  originalSentence: string,
  targetWord: string,
  correction: string
): boolean {
  const target = normalizeSingleTokenWord(targetWord, targetWord);
  const corrected = normalizeSingleTokenWord(correction, '');
  if (!target || !corrected || target === corrected) return false;

  const sentence = originalSentence.toLowerCase();
  const tokenRegex = new RegExp(`(^|[^a-z'])${escapeRegExp(target)}([^a-z']|$)`, 'i');
  const targetAppearsVerbatim = tokenRegex.test(sentence);
  const distance = typoCorrectionDistance(target, corrected);
  const shortToken = target.length <= 3;

  if (shortToken && distance > 1) return false;
  if (!shortToken && distance > 2) return false;
  if (targetAppearsVerbatim && distance > 1) return false;
  return true;
}

function isPlausibleTypoSuggestion(targetWord: string, correction: string): boolean {
  const target = normalizeSingleTokenWord(targetWord, targetWord);
  const corrected = normalizeSingleTokenWord(correction, '');
  if (!target || !corrected || target === corrected) return false;
  if (isPlausibleEnglishLemma(target, corrected)) return false;

  const distance = typoCorrectionDistance(target, corrected);
  if (target.length <= 3) return distance === 1;
  if (distance === 1) return true;
  return target.length >= 8 && distance === 2;
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
  if (
    payload.generationId !== undefined &&
    (typeof payload.generationId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.generationId))
  ) {
    errors.push('payload.generationId must be a UUID when provided');
  }
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
  if (payload.cardSubject !== undefined && typeof payload.cardSubject !== 'string') {
    errors.push('payload.cardSubject must be a string when provided');
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
  if (payload.sourceLanguage !== undefined && typeof payload.sourceLanguage !== 'string') {
    errors.push('payload.sourceLanguage must be a string when provided');
  }
  if (
    payload.aiBreakdownMode !== undefined &&
    typeof payload.aiBreakdownMode !== 'string'
  ) {
    errors.push('payload.aiBreakdownMode must be a string when provided');
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
  if (
    payload.demoExperience !== undefined &&
    typeof payload.demoExperience !== 'boolean'
  ) {
    errors.push('payload.demoExperience must be a boolean when provided');
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
  if (action === 'get_or_create_demo_card') {
    if (payload === undefined || payload === null) return [];
    if (!isObject(payload)) return ['payload must be an object'];
    if (payload.replyLanguage !== undefined && typeof payload.replyLanguage !== 'string') {
      return ['payload.replyLanguage must be a string when provided'];
    }
    return [];
  }
  if (
    action === 'generate_card' ||
    action === 'generate_card_stream' ||
    action === 'generate_card_core_stream' ||
    action === 'generate_card_enrichment_stream'
  ) {
    return validateGenerateCardPayload(payload);
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

function getUtcWeekBucket(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getSubscriptionCadence(productId: unknown): 'weekly' | 'monthly' {
  const value = typeof productId === 'string' ? productId.toLowerCase() : '';
  return value.includes('weekly') ? 'weekly' : 'monthly';
}

function getPeriodQuota(params: {
  feature: 'ai_generation' | 'pronunciation';
  productId?: unknown;
}): { bucket: 'week' | 'month'; limit: number; bucketLabel: string; resetCopy: string } {
  const cadence = getSubscriptionCadence(params.productId);
  if (params.feature === 'ai_generation') {
    return cadence === 'weekly'
      ? { bucket: 'week', limit: AI_WEEKLY_GENERATION_QUOTA, bucketLabel: 'weekly', resetCopy: 'next week' }
      : { bucket: 'month', limit: AI_MONTHLY_GENERATION_QUOTA, bucketLabel: 'monthly', resetCopy: 'next month' };
  }
  return cadence === 'weekly'
    ? { bucket: 'week', limit: PRONUNCIATION_WEEKLY_QUOTA, bucketLabel: 'weekly', resetCopy: 'next week' }
    : { bucket: 'month', limit: PRONUNCIATION_MONTHLY_QUOTA, bucketLabel: 'monthly', resetCopy: 'next month' };
}

async function enforceBillableActionLimits(params: {
  userId: string;
  action: Action;
  productId?: unknown;
}): Promise<Response | null> {
  const { userId, action, productId } = params;
  const isAIAction =
    action === 'generate_card' ||
    action === 'generate_card_stream' ||
    action === 'generate_card_core_stream' ||
    action === 'generate_card_enrichment_stream';
  const isPronunciationAction = action === 'pronunciation_assess';
  if (!isAIAction && !isPronunciationAction) return null;

  const kv = await getKvClient();
  const now = new Date();
  const minuteBucket = `${now.toISOString().slice(0, 16)}`;
  const dayBucket = now.toISOString().slice(0, 10);
  const monthBucket = now.toISOString().slice(0, 7);
  const weekBucket = getUtcWeekBucket(now);
  const increment = async (bucket: string, bucketKey: string, expireInMs: number) => {
    if (kv) {
      return incrementCounter(kv, ['ai-rate', userId, bucket, bucketKey], expireInMs);
    }
    const supabase = createServiceRoleClient();
    return incrementPostgresRateLimitCounter({
      supabase,
      service: 'ai-proxy',
      userId,
      bucket,
      bucketKey,
      expireInMs,
    });
  };

  try {
    const minuteCount = await increment(
      'minute',
      minuteBucket,
      2 * 60 * 1000
    );
    if (minuteCount > RATE_LIMIT_PER_MINUTE) {
      return jsonResponse(
        {
          error: 'Rate limit exceeded',
          reason: 'rate_limit_exceeded',
          limit: RATE_LIMIT_PER_MINUTE,
          bucket: 'minute',
          message: 'You are sending requests too quickly. Please wait a moment and try again.',
        },
        429
      );
    }

    if (isAIAction) {
      const dayCount = await increment(
        'ai_generation_day',
        dayBucket,
        2 * 24 * 60 * 60 * 1000
      );
      if (dayCount > AI_DAILY_GENERATION_QUOTA) {
        return jsonResponse(
          {
            error: 'Daily AI generation quota exceeded',
            reason: 'ai_generation_daily_quota_exceeded',
            limit: AI_DAILY_GENERATION_QUOTA,
            bucket: 'day',
            message: "You've used today's AI card generation limit. You can still review existing cards and use features that do not need new AI generation; this resets tomorrow.",
          },
          429
        );
      }
    }

    const feature = isAIAction ? 'ai_generation' : 'pronunciation';
    const period = getPeriodQuota({ feature, productId });
    const periodCount = await increment(
      `${feature}_${period.bucket}`,
      period.bucket === 'week' ? weekBucket : monthBucket,
      period.bucket === 'week'
        ? 8 * 24 * 60 * 60 * 1000
        : 33 * 24 * 60 * 60 * 1000
    );
    if (periodCount > period.limit) {
      const reason = isAIAction
        ? `ai_generation_${period.bucket}_quota_exceeded`
        : `pronunciation_${period.bucket}_quota_exceeded`;
      const featureCopy = isAIAction ? 'AI card generation' : 'pronunciation scoring';
      return jsonResponse(
        {
          error: `${period.bucketLabel} quota exceeded`,
          reason,
          limit: period.limit,
          bucket: period.bucket,
          message: `You've used this subscription period's ${featureCopy} fair-use limit. You can still use other study features; ${featureCopy} resets ${period.resetCopy}.`,
        },
        429
      );
    }

    return null;
  } catch (error) {
    if (ALLOW_BILLABLE_WITHOUT_KV) {
      console.warn('[ai-proxy] Rate limit store unavailable; allowing request due to AI_ALLOW_BILLABLE_WITHOUT_KV=true', error);
      return null;
    }
    console.error('[ai-proxy] Rate limit store unavailable', error);
    return jsonResponse(
      {
        error: 'Service temporarily unavailable',
        reason: 'rate_limit_store_unavailable',
      },
      503
    );
  }
}

async function consumePronunciationDailyQuota(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  planType: 'trial' | 'free' | 'premium';
}): Promise<Response | null> {
  const { supabase, userId, planType } = params;
  const dailyLimit = planType === 'free'
    ? FREE_PRONUNCIATION_DAILY_QUOTA
    : PREMIUM_PRONUNCIATION_DAILY_QUOTA;
  const { data, error } = await supabase.rpc('consume_pronunciation_quota', {
    p_user_id: userId,
    p_daily_limit: dailyLimit,
  });

  if (error) {
    console.error('[ai-proxy] pronunciation quota check failed', {
      user: userLogSuffix(userId),
      error: error.message,
    });
    return jsonResponse(
      {
        error: 'Pronunciation quota check failed',
        reason: 'pronunciation_quota_unavailable',
      },
      503
    );
  }

  const quota = Array.isArray(data) ? data[0] : data;
  if (!quota) {
    console.error('[ai-proxy] pronunciation quota returned no row', {
      user: userLogSuffix(userId),
    });
    return jsonResponse(
      {
        error: 'Pronunciation quota check failed',
        reason: 'pronunciation_quota_unavailable',
      },
      503
    );
  }
  const allowed = Boolean(quota?.allowed);
  const used = Number(quota?.used ?? 0);
  const limit = Number(quota?.daily_limit ?? dailyLimit);
  const resetDate = typeof quota?.reset_date === 'string' ? quota.reset_date : new Date().toISOString().slice(0, 10);

  if (!allowed) {
    return jsonResponse(
      {
        error: 'Daily pronunciation quota exceeded',
        reason: 'pronunciation_daily_quota_exceeded',
        planType,
        used,
        limit,
        resetDate,
        message: "You've used today's pronunciation check limit. You can still create cards and study; pronunciation scoring resets tomorrow.",
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
const DEMO_CARD_FIXTURE_VERSION = 'smallest-nuances-v2';
const DEMO_CARD_TARGET_WORD = 'nuances';
const DEMO_CARD_SENTENCE = 'The smallest nuances can make the biggest differences.';
const DEMO_PRONUNCIATION_CLAIM_TIMEOUT_MS = 2 * 60 * 1000;

type DemoReplyLanguage = ReturnType<typeof resolveReplyLanguageMeta>['code'];
type DemoCardLocalizedCopy = {
  definition: string;
  sentenceTranslation: string;
  contextualExplanation: string;
  collocations: Array<{ phrase: string; translation: string }>;
  examples: Array<{ sentence: string; translation: string }>;
  synonyms: Array<{ term: string; translation: string }>;
};

const DEMO_CARD_LOCALIZED_COPY: Record<DemoReplyLanguage, DemoCardLocalizedCopy> = {
  'zh-TW': {
    definition: '細節，細微的差異',
    sentenceTranslation: '最細微的差異，也能帶來最大的不同。',
    contextualExplanation: '這裡的 nuances 指不易察覺、卻會影響整體結果的細節或差異。',
    collocations: [
      { phrase: 'subtle nuances', translation: '細微差異' },
      { phrase: 'cultural nuances', translation: '文化上的細微差異' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: '她注意到他語氣中的細微差異。' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: '理解文化上的細微差異有助於避免誤會。',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: '細微之處' },
      { term: 'fine distinctions', translation: '細微區別' },
    ],
  },
  'zh-CN': {
    definition: '细节，细微的差异',
    sentenceTranslation: '最细微的差异，也能带来最大的不同。',
    contextualExplanation: '这里的 nuances 指不易察觉、却会影响整体结果的细节或差异。',
    collocations: [
      { phrase: 'subtle nuances', translation: '细微差异' },
      { phrase: 'cultural nuances', translation: '文化上的细微差异' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: '她注意到他语气中的细微差异。' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: '理解文化上的细微差异有助于避免误会。',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: '细微之处' },
      { term: 'fine distinctions', translation: '细微区别' },
    ],
  },
  en: {
    definition: 'details; subtle differences',
    sentenceTranslation: 'Even the smallest subtle details can create the biggest differences.',
    contextualExplanation:
      'Here, nuances means small, hard-to-notice details or differences that can shape the overall result.',
    collocations: [
      { phrase: 'subtle nuances', translation: 'small, hard-to-notice differences' },
      { phrase: 'cultural nuances', translation: 'subtle differences shaped by culture' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: 'She noticed small differences in his tone.' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: 'Understanding subtle cultural differences helps prevent misunderstandings.',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: 'small subtle details' },
      { term: 'fine distinctions', translation: 'small but meaningful differences' },
    ],
  },
  ja: {
    definition: '細部、わずかな違い',
    sentenceTranslation: 'ほんのわずかなニュアンスが、最も大きな違いを生むことがあります。',
    contextualExplanation:
      'ここでの nuances は、気づきにくくても全体の結果に影響する細部やわずかな違いを指します。',
    collocations: [
      { phrase: 'subtle nuances', translation: '微妙なニュアンス' },
      { phrase: 'cultural nuances', translation: '文化的なニュアンス' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: '彼女は彼の口調の微妙なニュアンスに気づきました。' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: '文化的なニュアンスを理解すると、誤解を防ぎやすくなります。',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: '微妙な点' },
      { term: 'fine distinctions', translation: '細かな違い' },
    ],
  },
  ko: {
    definition: '세부적인 차이, 미묘한 차이',
    sentenceTranslation: '아주 작은 뉘앙스가 가장 큰 차이를 만들 수 있습니다.',
    contextualExplanation:
      '여기서 nuances는 눈에 잘 띄지 않지만 전체 결과에 영향을 줄 수 있는 세부적이거나 미묘한 차이를 뜻합니다.',
    collocations: [
      { phrase: 'subtle nuances', translation: '미묘한 뉘앙스' },
      { phrase: 'cultural nuances', translation: '문화적 뉘앙스' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: '그녀는 그의 말투에서 미묘한 뉘앙스를 알아챘습니다.' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: '문화적 뉘앙스를 이해하면 오해를 예방하는 데 도움이 됩니다.',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: '미묘한 점' },
      { term: 'fine distinctions', translation: '세밀한 차이' },
    ],
  },
  es: {
    definition: 'detalles, diferencias sutiles',
    sentenceTranslation: 'Los matices más pequeños pueden marcar las mayores diferencias.',
    contextualExplanation:
      'Aquí, nuances se refiere a detalles o diferencias difíciles de percibir que pueden influir en el resultado general.',
    collocations: [
      { phrase: 'subtle nuances', translation: 'matices sutiles' },
      { phrase: 'cultural nuances', translation: 'matices culturales' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: 'Ella notó matices sutiles en su tono.' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: 'Comprender los matices culturales ayuda a evitar malentendidos.',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: 'sutilezas' },
      { term: 'fine distinctions', translation: 'distinciones sutiles' },
    ],
  },
  fr: {
    definition: 'détails, différences subtiles',
    sentenceTranslation: 'Les nuances les plus subtiles peuvent faire les plus grandes différences.',
    contextualExplanation:
      'Ici, nuances désigne des détails ou des différences difficiles à percevoir qui peuvent influencer le résultat global.',
    collocations: [
      { phrase: 'subtle nuances', translation: 'nuances subtiles' },
      { phrase: 'cultural nuances', translation: 'nuances culturelles' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: 'Elle a remarqué des nuances subtiles dans son ton.' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: 'Comprendre les nuances culturelles aide à éviter les malentendus.',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: 'subtilités' },
      { term: 'fine distinctions', translation: 'distinctions fines' },
    ],
  },
};

function buildDemoCardFixture(replyLanguage: DemoReplyLanguage): Record<string, unknown> {
  const copy = DEMO_CARD_LOCALIZED_COPY[replyLanguage];
  return {
    normalizedTargetWord: DEMO_CARD_TARGET_WORD,
    meaningInContext: copy.definition,
    isLikelyTypo: false,
    isPartOfPhrase: false,
    definition: copy.definition,
    partOfSpeech: 'noun',
    sentenceTranslation: `${DEMO_CARD_SENTENCE}\n${copy.sentenceTranslation}`,
    sentenceNotes: '',
    culturalBackground: copy.contextualExplanation,
    example: copy.examples,
    frequentCollocations: copy.collocations,
    semanticRelations: {
      synonyms: copy.synonyms,
      antonyms: [],
    },
    phoneticTranscription: '/ˈnuː.ɑːn.sɪz/',
    tags: ['communication', 'details', 'meaning'],
  };
}

type StarterClaim = {
  result: 'claimed' | 'reused' | 'exhausted' | 'unavailable';
  remaining: number;
};

async function claimFreeStarterCard(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  generationId: string;
}): Promise<StarterClaim> {
  const { data, error } = await params.supabase.rpc(
    'claim_free_starter_card_generation',
    {
      p_user_id: params.userId,
      p_generation_id: params.generationId,
      p_limit: FREE_STARTER_CARD_LIMIT,
    }
  );
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    console.error('[ai-proxy] starter allowance claim failed', {
      user: userLogSuffix(params.userId),
      error: error?.message ?? 'missing row',
    });
    return { result: 'unavailable', remaining: 0 };
  }
  return {
    result: row.result as StarterClaim['result'],
    remaining: Number(row.remaining ?? 0),
  };
}

async function finishFreeStarterCard(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  generationId: string;
  succeeded: boolean;
}): Promise<void> {
  const { error } = await params.supabase.rpc(
    'finish_free_starter_card_generation',
    {
      p_user_id: params.userId,
      p_generation_id: params.generationId,
      p_succeeded: params.succeeded,
    }
  );
  if (error) {
    console.error('[ai-proxy] starter allowance finish failed', {
      user: userLogSuffix(params.userId),
      error: error.message,
    });
  }
}

async function hasFreeStarterAccess(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
}): Promise<boolean | null> {
  const { data, error } = await params.supabase.rpc(
    'get_free_starter_card_allowance',
    { p_user_id: params.userId, p_limit: FREE_STARTER_CARD_LIMIT }
  );
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;
  return row.exhausted !== true;
}

async function claimDemoPronunciationAssessment(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  payload: PronunciationAssessPayload;
}): Promise<'claimed' | 'consumed' | 'unavailable' | 'ineligible'> {
  const { supabase, userId, payload } = params;
  const normalizedReference = sanitizeText(payload.referenceText, MAX_WORD_CHARS)
    .toLocaleLowerCase('en-US');
  if (payload.demoExperience !== true || normalizedReference !== DEMO_CARD_TARGET_WORD) {
    return 'ineligible';
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const { error: insertError } = await supabase
    .from('demo_pronunciation_consumptions')
    .insert({
      user_id: userId,
      fixture_version: DEMO_CARD_FIXTURE_VERSION,
      status: 'processing',
      claimed_at: nowIso,
      updated_at: nowIso,
    });

  if (!insertError) return 'claimed';
  if (insertError.code !== '23505') {
    console.error('[ai-proxy] demo pronunciation claim failed', {
      user: userLogSuffix(userId),
      error: insertError.message,
    });
    return 'unavailable';
  }

  const { data: existing, error: readError } = await supabase
    .from('demo_pronunciation_consumptions')
    .select('status, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError || !existing) {
    console.error('[ai-proxy] demo pronunciation state read failed', {
      user: userLogSuffix(userId),
      error: readError?.message ?? 'missing row',
    });
    return 'unavailable';
  }
  if (existing.status === 'success') return 'consumed';

  const updatedAtMs = Date.parse(existing.updated_at);
  const canRetry = existing.status === 'failed' ||
    !Number.isFinite(updatedAtMs) ||
    now.getTime() - updatedAtMs >= DEMO_PRONUNCIATION_CLAIM_TIMEOUT_MS;
  if (!canRetry) return 'consumed';

  const retryQuery = supabase
    .from('demo_pronunciation_consumptions')
    .update({
      status: 'processing',
      claimed_at: nowIso,
      updated_at: nowIso,
      completed_at: null,
    })
    .eq('user_id', userId)
    .eq('status', existing.status)
    .eq('updated_at', existing.updated_at)
    .select('user_id')
    .maybeSingle();
  const { data: retried, error: retryError } = await retryQuery;
  if (retryError) {
    console.error('[ai-proxy] demo pronunciation retry claim failed', {
      user: userLogSuffix(userId),
      error: retryError.message,
    });
    return 'unavailable';
  }
  return retried ? 'claimed' : 'consumed';
}

async function finishDemoPronunciationAssessment(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  succeeded: boolean;
}): Promise<void> {
  const { supabase, userId, succeeded } = params;
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('demo_pronunciation_consumptions')
    .update({
      status: succeeded ? 'success' : 'failed',
      updated_at: nowIso,
      completed_at: succeeded ? nowIso : null,
    })
    .eq('user_id', userId)
    .eq('status', 'processing');
  if (error) {
    console.error('[ai-proxy] demo pronunciation completion failed', {
      user: userLogSuffix(userId),
      succeeded,
      error: error.message,
    });
  }
}

async function handleGetOrCreateDemoCard(
  payload: DemoCardPayload,
  userId: string
): Promise<Response> {
  const supabase = createServiceRoleClient();
  const replyLanguage = resolveReplyLanguageMeta(payload?.replyLanguage);
  const fixtureKey = `${DEMO_CARD_FIXTURE_VERSION}:${replyLanguage.code}`;
  const { data: existingConsumption, error: consumptionReadError } = await supabase
    .from('demo_card_consumptions')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (consumptionReadError) {
    console.error('[ai-proxy] demo consumption read failed', {
      userId,
      error: consumptionReadError.message,
    });
    return jsonResponse({ error: 'Demo card state is unavailable' }, 503);
  }
  if (existingConsumption) {
    return jsonResponse({
      error: 'Demo card has already been used',
      reason: 'demo_already_consumed',
    }, 409);
  }

  const { data: existingDemoCard, error: cardReadError } = await supabase
    .from('cards')
    .select('id')
    .eq('user_id', userId)
    .eq('target_word', DEMO_CARD_TARGET_WORD)
    .eq('original_sentence', DEMO_CARD_SENTENCE)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (cardReadError) {
    console.error('[ai-proxy] existing demo card check failed', {
      userId,
      error: cardReadError.message,
    });
    return jsonResponse({ error: 'Demo card state is unavailable' }, 503);
  }
  if (existingDemoCard) {
    await supabase.from('demo_card_consumptions').upsert({
      user_id: userId,
      fixture_version: DEMO_CARD_FIXTURE_VERSION,
      consumed_at: new Date().toISOString(),
    });
    return jsonResponse({
      error: 'Demo card has already been used',
      reason: 'demo_already_consumed',
    }, 409);
  }
  const { error: claimError } = await supabase
    .from('demo_card_consumptions')
    .insert({
      user_id: userId,
      fixture_version: DEMO_CARD_FIXTURE_VERSION,
      consumed_at: new Date().toISOString(),
    });
  if (claimError) {
    if (claimError.code === '23505') {
      return jsonResponse({
        error: 'Demo card has already been used',
        reason: 'demo_already_consumed',
      }, 409);
    }
    console.error('[ai-proxy] demo consumption claim failed', {
      userId,
      error: claimError.message,
    });
    return jsonResponse({ error: 'Demo card state could not be stored' }, 503);
  }

  return jsonResponse({
    result: buildDemoCardFixture(replyLanguage.code),
    meta: { source: 'static_fixture', fixtureKey },
  });
}

async function handleGenerateCard(payload: GenerateCardPayload): Promise<Response> {
  const requestId = createRequestId('generate_card');
  const targetWord = sanitizeText(payload.targetWord, MAX_WORD_CHARS);
  const originalSentence = sanitizeText(payload.originalSentence, MAX_SENTENCE_CHARS);
  const requestedCardSubject = sanitizeText(payload.cardSubject || '', MAX_WORD_CHARS);
  const canonicalCardSubject =
    requestedCardSubject && requestedCardSubject.toLowerCase() !== targetWord.toLowerCase()
      ? requestedCardSubject
      : targetWord;
  const replyLanguage = resolveReplyLanguageMeta(payload.replyLanguage);
  const sourceLanguage = resolveSourceLanguageMeta(
    payload.sourceLanguage,
    `${targetWord} ${originalSentence}`
  );
  const naturalReplyLanguageInstruction = getNaturalReplyLanguageInstruction(replyLanguage);
  const lexicalDefinitionScopeInstruction = getLexicalDefinitionScopeInstruction(replyLanguage);
  const domainRegisterSenseInstruction = getDomainRegisterSenseInstruction();
  const aiBreakdownMode = resolveAIBreakdownMode(payload.aiBreakdownMode);
  const sectionBudget = CARD_SECTION_BUDGETS[aiBreakdownMode];
  const modeInstruction = getAIBreakdownModeInstruction(aiBreakdownMode, replyLanguage.label);
  const isLowContextSource = isLowContextSourceInput(targetWord, originalSentence);
  const lowContextInstruction = isLowContextSource
    ? [
      'Low-context input detected: the source sentence is only the target word/phrase.',
      'Use the most common neutral literal meaning. Do NOT infer slang, meme, metaphor, innuendo, or cultural meaning.',
      'Set partOfSpeech to the ordinary grammatical category when clear. Do not label it slang unless the word itself is only slang.',
      'Keep culturalBackground empty or write one very short neutral note that there is no extra sentence context.',
      'Even when the input is a single word, still provide real multi-word collocations and a full example sentence from common lexical knowledge.',
      'Do not return the bare target word as a collocation or example. Expand it into a natural phrase or sentence.',
    ].join(' ')
    : [
      'For normal sentence input, resolve the subject’s local meaning from how it functions in this sentence before choosing the translation.',
      'If the literal/default meaning would make the sentence awkward, irrelevant, or less natural, reject it and translate the local meaning directly.',
      'If multiple readings remain genuinely possible after reading the sentence, choose the most locally natural one and mention uncertainty only in culturalBackground.',
    ].join(' ');

  if (!targetWord || !originalSentence) {
    return jsonResponse({ error: 'targetWord and originalSentence are required', requestId }, 400);
  }

const prompt = `
Analyze the target token "${targetWord}" as it appears in this source sentence:
"${originalSentence}"

Canonical card subject:
"${canonicalCardSubject}"

	First understand the sentence naturally, then format the answer into JSON:
	1. Translate the full source sentence into natural ${replyLanguage.label}.
	2. Say what the target subject means here and what part of speech it is.
	3. Give ${sectionBudget.collocationCount} useful ${sourceLanguage.label} usage pattern(s) for this meaning, each with a complete example sentence, unless fewer genuinely exist.

	Rules for the canonical card subject:
	- Correct likely OCR/spelling typos, but never replace the target with a synonym.
	- ${CARD_SUBJECT_SELECTION_INSTRUCTION}
	- Otherwise respect the requested subject "${canonicalCardSubject}".
	- Proper nouns are allowed: translate/transliterate them naturally and explain only the visible sentence usage.
	- Use one final subject consistently across every field.
	- Each frequentCollocations.phrase must be a reusable pattern containing the final subject or its normal inflection.
	- Each example must be a complete sentence that naturally uses the matching pattern.
	- ${lexicalDefinitionScopeInstruction}

Return strict JSON with these exact keys:
{
  "sentenceTranslation": "full source sentence with quoted target\\nfull ${replyLanguage.label} translation with the natural target meaning",
  "meaningResolution": {
    "sentenceTranslation": "natural ${replyLanguage.label} translation of the full source sentence",
	  "targetTranslation": "word or short phrase in the translated sentence that corresponds to the target subject",
    "meaningHere": "what the target subject means in this exact sentence",
    "whyGoodFit": "why this word/phrase fits this sentence and tone",
    "literalMeaningNote": "state briefly if the literal/default dictionary meaning would be misleading; otherwise say it fits",
    "confidence": 0.0
  },
  "definition": "same idea as meaningResolution.targetTranslation; one line, normally 1-6 words, max ${sectionBudget.definitionChars} chars",
  "normalizedTargetWord": "final word or phrase",
  "lemma": "single-word lemma for the target's in-context part of speech",
  "lemmaMeaningPreserved": true,
  "partOfSpeech": "noun | verb | adjective | adverb | phrasal verb | idiom | fixed expression | phrase | slang | proper noun | other",
  "culturalBackground": "why this word fits this sentence, including nuance/tone; not general knowledge, max ${sectionBudget.contextChars} chars",
  "frequentCollocations": [{ "phrase": "${sourceLanguage.label} collocation", "translation": "direct ${replyLanguage.label} translation" }],
  "example": [{ "sentence": "complete ${sourceLanguage.label} example", "translation": "complete ${replyLanguage.label} translation" }],
  "semanticRelations": {
    "synonyms": [{ "term": "sense-specific source-language synonym", "translation": "short ${replyLanguage.label} translation" }],
    "antonyms": [{ "term": "true source-language antonym", "translation": "short ${replyLanguage.label} translation" }]
  },
  "isPartOfPhrase": false,
  "detectedPhrase": "",
  "phraseType": "none | phrasal_verb | idiom | fixed_expression",
  "isEstablishedExpression": false,
  "phraseConfidence": 0,
  "phraseMinimalityConfidence": 0,
  "phraseMeaningDiffers": false,
  "isLikelyTypo": false,
  "correctedTargetWord": "",
  "typoReason": "",
  "tags": ["max 3 short tags"]
}

Selected AI mode rules:
${modeInstruction}

Context strictness:
${lowContextInstruction}

Do not add introductions, markdown, bullet explanations, or extra keys.
`;

  const generateCardSystemInstruction = [
    'You create compact flashcards for English learners.',
    'Return strict JSON only; no markdown, prose, extra keys, or extra arrays.',
    'Understand the full sentence first. Then answer what the target means here and format it for the UI.',
    'Use the local in-sentence meaning unless the input has no context.',
    CARD_SUBJECT_SELECTION_INSTRUCTION,
    'Do not invent background facts for proper nouns; explain only visible sentence usage.',
    lowContextInstruction,
    `Effective subject: use "${canonicalCardSubject}" if explicit; otherwise use verified detectedPhrase; otherwise "${targetWord}". Use it consistently in all fields.`,
    `Use ${replyLanguage.label} for sentenceTranslation, definition, and culturalBackground; examples stay in the source language.`,
    getSourceLanguageInstruction(sourceLanguage),
    naturalReplyLanguageInstruction,
    domainRegisterSenseInstruction,
    lexicalDefinitionScopeInstruction,
    'sentenceTranslation has exactly two lines: full source sentence with quoted target, then clean translation with quoted translated target.',
    'Keep definition compact. In culturalBackground, explain why this word fits this sentence and what nuance/tone it adds; do not give general knowledge about the subject.',
    `semanticRelations must match the effective subject's meaning, part of speech, and register. Return up to ${sectionBudget.synonymCount} synonym(s) and up to ${sectionBudget.antonymCount} true antonym(s); either array may be empty when no natural sense-specific relation exists. Phrase cards require related phrases. Never repeat collocations.`,
    'Return reusable usage patterns containing the effective subject or its normal inflection. Each example must be a complete sentence using the matching pattern.',
    modeInstruction,
    `Hard card layout limits: definition <= ${sectionBudget.definitionChars} chars, sentenceTranslation <= ${sectionBudget.sentenceTranslationChars} chars total, culturalBackground <= ${sectionBudget.contextChars} chars, example <= ${sectionBudget.exampleChars} chars total, each collocation <= ${sectionBudget.collocationChars} chars.`,
    `Return ${sectionBudget.collocationCount} collocation object(s), each paired with one matching example object, unless fewer genuinely exist.`
  ].join(' ');

  const modelCandidates = getGenerateCardModelCandidates(aiBreakdownMode);
  const runtimeOptions = getGenerateCardRuntimeOptions(aiBreakdownMode);
  const responseSchema = buildGenerateCardResponseSchema(sectionBudget);
  const generationStartedAt = Date.now();
  let parsed: any = null;
  let aiResponse: any = null;
  let lastErrorMsg = '';
  let lastFailureWasTransient = false;
  let exhaustedTimeBudget = false;
  let usedModel = modelCandidates[0]?.model || OPENAI_GENERATE_CARD_MODEL;
  let usedProvider: 'openai' | 'gemini' = modelCandidates[0]?.provider || 'openai';
  let shouldRunJsonFallback = false;

  const parseAndValidateGenerateCardResponse = (response: any) => {
    const rawContent = String(response?.content || '').trim();
    const jsonString = extractFirstJsonObject(rawContent);
    if (!jsonString) {
      const finishReason = sanitizeText(response?.finishReason || '', 80);
      const suffix = finishReason ? `finishReason=${finishReason}` : '';
      throw new Error(`No JSON object found in response${suffix ? ` (${suffix})` : ''}`);
    }
    const candidate = JSON.parse(jsonString);
    const candidateDetectedPhrase = sanitizeText(candidate?.detectedPhrase || '', 160);
    const candidatePhraseConfidence = Math.max(0, Math.min(1, Number(candidate?.phraseConfidence || 0)));
    const candidatePhraseMinimalityConfidence = Math.max(
      0,
      Math.min(1, Number(candidate?.phraseMinimalityConfidence || 0))
    );
    const candidatePhraseMeaningDiffers = parseBooleanLike(candidate?.phraseMeaningDiffers);
    const candidatePromotesPhrase =
      parseBooleanLike(candidate?.isPartOfPhrase) ||
      normalizeLexicalSequence(candidate?.normalizedTargetWord || '').split(/\s+/).filter(Boolean).length > 1;
    const proposedUnverifiedPhrase =
      candidatePromotesPhrase &&
      (
        !isConfirmedDetectedPhrase(originalSentence, targetWord, candidateDetectedPhrase, {
          phraseType: candidate?.phraseType,
          isEstablishedExpression: candidate?.isEstablishedExpression,
          phraseConfidence: candidatePhraseConfidence,
          phraseMinimalityConfidence: candidatePhraseMinimalityConfidence,
          phraseMeaningDiffers: candidatePhraseMeaningDiffers,
        })
      );
    if (proposedUnverifiedPhrase) {
      logAIDiagnostic('generate_card_unverified_phrase_downgraded', {
        requestId,
        phraseConfidence: candidatePhraseConfidence,
        phraseMinimalityConfidence: candidatePhraseMinimalityConfidence,
        phraseMeaningDiffers: candidatePhraseMeaningDiffers,
      }, 'warn');
      candidate.normalizedTargetWord = targetWord;
      candidate.isPartOfPhrase = false;
      candidate.detectedPhrase = '';
      candidate.phraseType = 'none';
      candidate.isEstablishedExpression = false;
      candidate.phraseConfidence = 0;
      candidate.phraseMinimalityConfidence = 0;
      candidate.phraseMeaningDiffers = false;
    }
    return candidate;
  };

  for (let attempt = 1; attempt <= modelCandidates.length; attempt++) {
    const candidate = modelCandidates[attempt - 1] || {
      provider: 'openai' as const,
      model: OPENAI_GENERATE_CARD_MODEL,
    };
    const modelName = candidate.model;
    const elapsedBeforeAttemptMs = Date.now() - generationStartedAt;
    const remainingBudgetMs = GENERATE_CARD_TOTAL_BUDGET_MS - elapsedBeforeAttemptMs;
    if (remainingBudgetMs < 1000) {
      exhaustedTimeBudget = true;
      lastErrorMsg = `Generation time budget exhausted after ${elapsedBeforeAttemptMs}ms`;
      break;
    }
    try {
      const timeoutMs = Math.min(
        GENERATE_CARD_ATTEMPT_TIMEOUTS_MS[Math.min(attempt - 1, GENERATE_CARD_ATTEMPT_TIMEOUTS_MS.length - 1)],
        remainingBudgetMs
      );
      const messages = [
        {
          role: 'system',
          content: generateCardSystemInstruction,
        },
        { role: 'user', content: prompt },
      ];
      aiResponse = candidate.provider === 'openai'
        ? await callOpenAIChat({
            model: modelName,
            messages,
            maxTokens: runtimeOptions.maxTokens,
            temperature: runtimeOptions.temperature,
            jsonMode: true,
          })
        : await callGeminiLegacy({
            model: modelName,
            messages,
            maxTokens: runtimeOptions.maxTokens,
            temperature: runtimeOptions.temperature,
            jsonMode: true,
            responseSchema,
            timeoutMs,
          });
      usedModel = modelName;
      usedProvider = candidate.provider;
      parsed = parseAndValidateGenerateCardResponse(aiResponse);
      if (parsed) break;
    } catch (error) {
      lastErrorMsg = error instanceof Error ? error.message : String(error);
      lastFailureWasTransient = isTransientGeminiFailure(error);
      if (isNoJsonGeminiFailure(error) || lastErrorMsg.toLowerCase().includes('max_tokens')) {
        shouldRunJsonFallback = true;
      }
      logAIDiagnostic('generate_card_attempt_failed', {
        requestId,
        attempt,
        provider: candidate.provider,
        model: modelName,
        transient: lastFailureWasTransient,
        error: lastErrorMsg.slice(0, 240),
        finishReason: aiResponse?.finishReason,
        rawContentLength: typeof aiResponse?.rawContent === 'string' ? aiResponse.rawContent.length : undefined,
      }, 'warn');

      const hasNextModel = attempt < modelCandidates.length;
      if (!hasNextModel || !lastFailureWasTransient) continue;

      const retryDelayMs = getGenerateCardRetryDelayMs(error, attempt);
      const elapsedAfterAttemptMs = Date.now() - generationStartedAt;
      const retryBudgetMs = GENERATE_CARD_TOTAL_BUDGET_MS - elapsedAfterAttemptMs;
      if (retryBudgetMs <= retryDelayMs + 1000) {
        exhaustedTimeBudget = true;
        lastErrorMsg = `Generation time budget exhausted after ${elapsedAfterAttemptMs}ms`;
        break;
      }
      await sleep(retryDelayMs);
    }
  }

  if (!parsed && shouldRunJsonFallback) {
    const elapsedBeforeFallbackMs = Date.now() - generationStartedAt;
    const remainingBudgetMs = GENERATE_CARD_TOTAL_BUDGET_MS - elapsedBeforeFallbackMs;
    if (remainingBudgetMs >= 1800) {
      const fallbackCandidate =
        modelCandidates.find((candidate) => candidate.provider === 'gemini') ||
        modelCandidates.find((candidate) => candidate.provider === 'openai') ||
        {
          provider: 'openai' as const,
          model: OPENAI_GENERATE_CARD_MODEL,
        };
      try {
        const fallbackMessages = [
          {
            role: 'system',
            content: [
              generateCardSystemInstruction,
              'Emergency format repair mode: output exactly one valid raw JSON object. No markdown, no prose, no preface, no code fence. The first character must be { and the last character must be }.',
            ].join(' '),
          },
          { role: 'user', content: prompt },
        ];
        aiResponse = fallbackCandidate.provider === 'openai'
          ? await callOpenAIChat({
              model: fallbackCandidate.model,
              messages: fallbackMessages,
              maxTokens: runtimeOptions.maxTokens,
              temperature: 0.15,
              jsonMode: true,
            })
          : await callGeminiLegacy({
              model: fallbackCandidate.model,
              messages: fallbackMessages,
              maxTokens: runtimeOptions.maxTokens,
              temperature: 0.15,
              jsonMode: true,
              timeoutMs: 15000,
            });
        usedModel = fallbackCandidate.model;
        usedProvider = fallbackCandidate.provider;
        parsed = parseAndValidateGenerateCardResponse(aiResponse);
      } catch (fallbackError) {
        lastErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        lastFailureWasTransient = isTransientGeminiFailure(fallbackError) || isNoJsonGeminiFailure(fallbackError);
        logAIDiagnostic('generate_card_schema_less_json_fallback_failed', {
          requestId,
          provider: fallbackCandidate.provider,
          model: fallbackCandidate.model,
          transient: lastFailureWasTransient,
          error: lastErrorMsg.slice(0, 240),
          finishReason: aiResponse?.finishReason,
          rawContentLength: typeof aiResponse?.rawContent === 'string' ? aiResponse.rawContent.length : undefined,
        }, 'warn');
      }
    }
  }

  if (!parsed) {
    const loweredError = lastErrorMsg.toLowerCase();
    const isOutOfQuota = loweredError.includes('quota') || 
                         lastErrorMsg.includes('429') || 
                         lastErrorMsg.includes('limit');
    const isHighDemand = loweredError.includes('high demand');
    const reason = isOutOfQuota
      ? 'ai_quota_exceeded'
      : isHighDemand
        ? 'ai_high_demand'
        : exhaustedTimeBudget || lastFailureWasTransient
          ? 'ai_temporarily_unavailable'
        : 'ai_generation_failed';

    return jsonResponse(
      {
        error: 'AI card generation failed',
        reason,
        requestId,
        targetWord,
        modelCandidates,
        retryAfterMs: isHighDemand || lastFailureWasTransient ? 3000 : undefined,
        elapsedMs: Date.now() - generationStartedAt,
        details: lastErrorMsg.slice(0, 500),
      },
      isOutOfQuota ? 429 : isHighDemand || lastFailureWasTransient || exhaustedTimeBudget ? 503 : 502
    );
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
  const inferredSurfaceCorrection = inferCorrectedSurfaceFromLemma(
    targetWord,
    normalizedTargetWord
  );
  const normalizedTargetIsSupportedByCorrection =
    Boolean(inferredSurfaceCorrection) &&
    isPlausibleEnglishLemma(inferredSurfaceCorrection, normalizedTargetWord);
  const baseSafeNormalizedTargetWord = (
    shouldTrustModelNormalizedWord(
      originalSentence,
      targetWord,
      normalizedTargetWord
    ) ||
    normalizedTargetIsSupportedByCorrection
  )
    ? normalizedTargetWord
    : normalizeHeadword(targetWord, targetWord);
  const explicitTypoCorrection = normalizeHeadword(
    parsed.correctedTargetWord || parsed.correctedWord || '',
    ''
  );
  const spacingCorrection = firstOCRSpacingRestoration(
    targetWord,
    explicitTypoCorrection,
    normalizedTargetWord
  );
  const typoCorrection =
    spacingCorrection ||
    (
      explicitTypoCorrection &&
      isPlausibleTypoSuggestion(targetWord, explicitTypoCorrection)
    )
      ? explicitTypoCorrection
      : inferredSurfaceCorrection || explicitTypoCorrection;
  const isLikelyTypo =
    parseBooleanLike(
      parsed.isLikelyTypo ?? parsed.hasTypo ?? parsed.typo
    ) ||
    Boolean(spacingCorrection) ||
    Boolean(
      explicitTypoCorrection &&
      typoCorrection &&
      isPlausibleTypoSuggestion(targetWord, typoCorrection)
    );
  const isPartOfPhrase = parseBooleanLike(
    parsed.isPartOfPhrase ?? parsed.partOfPhrase ?? parsed.inPhrase
  );
  const detectedPhraseRaw = sanitizeText(
    parsed.detectedPhrase || parsed.phrase || parsed.mwe || '',
    160
  );
  const detectedPhrase = normalizeWhitespace(detectedPhraseRaw).toLowerCase();
  const phraseType = sanitizeText(parsed.phraseType, 32);
  const isEstablishedExpression = parseBooleanLike(parsed.isEstablishedExpression);
  const phraseConfidence = Math.max(
    0,
    Math.min(1, Number(parsed.phraseConfidence || 0))
  );
  const phraseMinimalityConfidence = Math.max(
    0,
    Math.min(1, Number(parsed.phraseMinimalityConfidence || 0))
  );
  const phraseMeaningDiffers = parseBooleanLike(parsed.phraseMeaningDiffers);
  const proposedLemma = normalizeSingleTokenWord(parsed.lemma, '');
  const lemmaMeaningPreserved = parseBooleanLike(parsed.lemmaMeaningPreserved);
  const hasLemmaMeaningVerdict =
    typeof parsed.lemmaMeaningPreserved === 'boolean' ||
    (
      typeof parsed.lemmaMeaningPreserved === 'string' &&
      /^(?:true|false|yes|no|1|0)$/i.test(parsed.lemmaMeaningPreserved.trim())
    );
  const meaningResolution =
    parsed.meaningResolution && typeof parsed.meaningResolution === 'object' && !Array.isArray(parsed.meaningResolution)
      ? parsed.meaningResolution as Record<string, unknown>
      : {};
  const confidence = Math.max(
    0,
    Math.min(
      1,
      typeof parsed.confidence === 'number'
        ? parsed.confidence
        : Number(parsed.confidence || meaningResolution.confidence || 0)
    )
  );
  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives
      .filter((item: unknown) => typeof item === 'string')
      .map((item: string) => sanitizeText(item, 120))
      .filter(Boolean)
      .slice(0, 3)
    : [];
  const confirmedDetectedPhrase =
    isPartOfPhrase &&
    hasLemmaMeaningVerdict &&
    !lemmaMeaningPreserved &&
    isConfirmedDetectedPhrase(originalSentence, targetWord, detectedPhrase, {
      phraseType,
      isEstablishedExpression,
      phraseConfidence,
      phraseMinimalityConfidence,
      phraseMeaningDiffers,
    });
  const normalizedTarget = normalizeSingleTokenWord(targetWord, targetWord);
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
  if (
    !requestedCardSubject &&
    normalizeLexicalSequence(baseSafeNormalizedTargetWord).split(/\s+/).filter(Boolean).length > 1 &&
    !confirmedDetectedPhrase
  ) {
    safeNormalizedTargetWord = normalizeHeadword(targetWord, targetWord);
  }
  const parsedPartOfSpeech =
    parsed.partOfSpeech || parsed['part of speech'] || parsed['pos'] || '';
  if (
    isLikelyTypo &&
    typoCorrection &&
    !spacingCorrection &&
    shouldApplyTypoCorrection(originalSentence, targetWord, typoCorrection)
  ) {
    safeNormalizedTargetWord =
      normalizedTargetIsSupportedByCorrection &&
      !isAdjectivalPartOfSpeech(parsedPartOfSpeech)
        ? normalizedTargetWord
        : typoCorrection;
  }
  const appliedTypoCorrection =
    isLikelyTypo &&
    typoCorrection &&
    safeNormalizedTargetWord.toLowerCase() === typoCorrection.toLowerCase();
  if (!appliedTypoCorrection) {
    const safeLemma =
      !isAdjectivalPartOfSpeech(parsedPartOfSpeech) &&
      proposedLemma &&
      isPlausibleEnglishLemma(targetWord, proposedLemma)
        ? proposedLemma
        : normalizeHeadword(targetWord, targetWord);
    safeNormalizedTargetWord = chooseLearningTerm({
      originalTarget: targetWord,
      lemma: safeLemma,
      lemmaMeaningPreserved: hasLemmaMeaningVerdict
        ? lemmaMeaningPreserved
        : true,
      canonicalPhrase: normalizedTargetWord,
      phraseConfirmed: confirmedDetectedPhrase,
    }).learningTerm;
  }
  if (
    requestedCardSubject &&
    requestedCardSubject.toLowerCase() !== targetWord.toLowerCase() &&
    safeNormalizedTargetWord.toLowerCase() === targetWord.toLowerCase()
  ) {
    safeNormalizedTargetWord = requestedCardSubject;
  }
  const ambiguousHint = alternatives.length
    ? `可能義項：${alternatives.join(' / ')}`
    : '需要更多上下文才能判定唯一意思';
  const safeDefinition = sanitizeDirectTargetTranslation(
    firstText(
      sectionBudget.definitionChars,
      meaningResolution.targetTranslation,
      meaningResolution.shortNaturalTranslation,
      meaningResolution.targetChinese,
      parsed.definition
    ),
    safeNormalizedTargetWord || targetWord,
    sectionBudget.definitionChars
  );
  const safeContextualExplanation = shouldForceAmbiguousOutput
    ? sanitizeText(
      JSON.stringify({
        sentenceTranslation: originalSentence,
        sentenceNotes: '',
        culturalBackground: `語境不足，建議提供前後句以判定「${targetWord}」精確語意。${ambiguousHint}`,
      }),
      600
    )
    : buildStructuredContextExplanation({
      parsed,
      targetWord: safeNormalizedTargetWord || targetWord,
      definition: safeDefinition,
      originalSentence,
      culturalBackgroundMaxChars: sectionBudget.contextChars,
      sentenceTranslationMaxChars: sectionBudget.sentenceTranslationChars,
      sentenceNotesMaxChars: sectionBudget.sentenceNotesChars,
      exampleMaxChars: sectionBudget.exampleChars,
      exampleCount: sectionBudget.exampleCount,
    });
  const rawFrequentCollocations =
    parsed.frequentCollocations ||
    parsed['frequent_collocations'] ||
    parsed['collocations'] ||
    parsed['Frequent collocations'] || '';
  const rawExamples = parsed.example || parsed.exampleSentence || parsed.naturalExample || '';
  const safeUsagePairs = filterUsagePairs(
    rawFrequentCollocations,
    rawExamples,
    safeNormalizedTargetWord || targetWord
  );
  const safeFrequentCollocations = normalizeCollocations(
    safeUsagePairs.collocations,
    sectionBudget.collocationCount,
    sectionBudget.collocationChars,
    safeNormalizedTargetWord || targetWord
  );
  const safeExample = normalizeExamples(
    safeUsagePairs.examples,
    sectionBudget.exampleCount,
    sectionBudget.exampleChars
  );
  const safeSemanticRelations = normalizeSemanticRelations(
    parsed.semanticRelations || parsed.semantic_relations,
    sectionBudget.synonymCount,
    sectionBudget.antonymCount,
    sectionBudget.semanticRelationChars
  );
  logAIOutcome('generate_card_completed', {
    requestId,
    action: 'generate_card',
    status: 'success',
    providerUsed: usedProvider,
    modelUsed: usedModel,
    latencyMs: Date.now() - generationStartedAt,
    inputTokens: aiResponse?.metrics?.inputTokens,
    outputTokens: aiResponse?.metrics?.outputTokens,
  });

  return jsonResponse({
    result: {
      normalizedTargetWord: safeNormalizedTargetWord,
      meaningInContext: sanitizeText(
        firstText(
          400,
          meaningResolution.meaningHere,
          parsed.meaningInContext,
          parsed.contextMeaning
        ),
        400
      ),
      isLikelyTypo,
      correctedTargetWord: spacingCorrection || typoCorrection || '',
      typoReason: spacingCorrection
        ? 'Possible OCR spacing correction'
        : sanitizeText(parsed.typoReason || parsed.correctionReason || '', 200),
      isPartOfPhrase: confirmedDetectedPhrase,
      detectedPhrase: confirmedDetectedPhrase ? detectedPhrase : '',
      confidence: phraseConfidence || confidence,
      alternatives,
      partOfSpeech: sanitizeText(parsedPartOfSpeech, 80),
      definition: safeDefinition,
      contextualExplanation: safeContextualExplanation,
      example: safeExample,
      frequentCollocations: safeFrequentCollocations,
      semanticRelations: safeSemanticRelations,
      phoneticTranscription: typeof (parsed.phoneticTranscription || parsed.pronunciation || parsed.ipa) === 'string' 
        ? sanitizeText(parsed.phoneticTranscription || parsed.pronunciation || parsed.ipa, 120) 
        : null,
      tags: Array.from(new Set([
        ...(Array.isArray(parsed.tags) ? parsed.tags : ['Vocabulary']),
        `ai_mode:${aiBreakdownMode}`,
      ].filter((tag) => typeof tag === 'string' && tag.trim()))),
    },
    meta: { requestId, providerUsed: usedProvider, modelUsed: usedModel, metrics: aiResponse?.metrics },
  });
}

async function handleGenerateCardStream(payload: GenerateCardPayload): Promise<Response> {
  const requestId = createRequestId('generate_card_stream');
  const targetWord = sanitizeText(payload.targetWord, MAX_WORD_CHARS);
  const originalSentence = sanitizeText(payload.originalSentence, MAX_SENTENCE_CHARS);
  const requestedCardSubject = sanitizeText(payload.cardSubject || '', MAX_WORD_CHARS);
  const canonicalCardSubject =
    requestedCardSubject && requestedCardSubject.toLowerCase() !== targetWord.toLowerCase()
      ? requestedCardSubject
      : targetWord;
  const replyLanguage = resolveReplyLanguageMeta(payload.replyLanguage);
  const sourceLanguage = resolveSourceLanguageMeta(
    payload.sourceLanguage,
    `${targetWord} ${originalSentence}`
  );
  const aiBreakdownMode = resolveAIBreakdownMode(payload.aiBreakdownMode);
  const sectionBudget = CARD_SECTION_BUDGETS[aiBreakdownMode];
  const modeInstruction = getAIBreakdownModeInstruction(aiBreakdownMode, replyLanguage.label);
  const responseSchema = buildGenerateCardResponseSchema(sectionBudget);

  if (!targetWord || !originalSentence) {
    return jsonResponse({ error: 'targetWord and originalSentence are required', requestId }, 400);
  }

  const systemInstruction = [
    'You create compact flashcards for English learners.',
    'Return one strict JSON object only; no markdown, prose, code fence, extra keys, or extra arrays.',
    `Use ${replyLanguage.label} for the sentenceTranslation translation line, definition, and culturalBackground.`,
    getSourceLanguageInstruction(sourceLanguage),
    getDomainRegisterSenseInstruction(),
    'Understand the full sentence first. Then answer what the target means here and format it for the UI.',
    getLexicalDefinitionScopeInstruction(replyLanguage),
    'Correct likely OCR/spelling typos, but never replace the target with a synonym.',
    CARD_SUBJECT_SELECTION_INSTRUCTION,
    'Do not invent background facts for proper nouns; explain only visible sentence usage.',
    'sentenceTranslation has exactly two lines: full source sentence with quoted target, then clean translation with quoted target.',
    'For English/Latin source text use English curly quotes “...”, never Chinese quotes.',
    'For low-context input use the neutral common meaning. Otherwise use the local in-sentence meaning by default.',
    `semanticRelations must match the effective subject's meaning, part of speech, and register. Return up to ${sectionBudget.synonymCount} synonym(s) and up to ${sectionBudget.antonymCount} true antonym(s); either array may be empty when no natural sense-specific relation exists. Phrase cards require related phrases. Never repeat collocations.`,
    'Return reusable usage patterns containing the final subject or its normal inflection. Each example must be a complete sentence using the matching pattern.',
    `Hard limits: definition <= ${sectionBudget.definitionChars} chars, sentenceTranslation <= ${sectionBudget.sentenceTranslationChars} chars, culturalBackground <= ${sectionBudget.contextChars} chars.`,
    `Return ${sectionBudget.collocationCount} collocation object(s), each paired with one matching example object, unless fewer genuinely exist.`,
    modeInstruction,
  ].join(' ');

  const prompt = `
Target: "${targetWord}"
Source sentence: "${originalSentence}"
Requested card subject: "${canonicalCardSubject}"

Instructions:
- First understand and translate the full sentence naturally.
- Then identify what the target subject means here and its part of speech.
- Correct likely typos/OCR errors, but never replace the target with a synonym.
- ${CARD_SUBJECT_SELECTION_INSTRUCTION}
- Proper nouns are allowed: translate/transliterate them naturally and explain only visible sentence usage.
- sentenceTranslation line 1 must be complete and quote the effective subject; English/Latin uses “...”.
- Return ${sectionBudget.collocationCount} reusable usage pattern(s) containing the effective subject or its normal inflection, unless fewer genuinely exist.
- Each example must be a complete sentence using the matching usage pattern.
- ${getLexicalDefinitionScopeInstruction(replyLanguage)}

Return JSON with exactly these keys:
{
  "sentenceTranslation": "original line\\ntranslated line",
  "meaningResolution": {
    "sentenceTranslation": "natural ${replyLanguage.label} translation of the full source sentence",
    "targetTranslation": "word or short phrase in the translated sentence that corresponds to the target subject",
    "meaningHere": "what the target subject means in this exact sentence",
    "whyGoodFit": "why this word/phrase fits this sentence and tone",
    "literalMeaningNote": "state briefly if the literal/default dictionary meaning would be misleading; otherwise say it fits",
    "confidence": 0.0
  },
  "definition": "same idea as meaningResolution.targetTranslation; one line, normally 1-6 words",
  "normalizedTargetWord": "base form or verified phrase",
  "partOfSpeech": "noun | verb | adjective | adverb | phrasal verb | idiom | fixed expression | phrase | slang | proper noun | other",
	  "culturalBackground": "why this word fits this sentence, including nuance/tone; not general knowledge",
  "frequentCollocations": [{ "phrase": "${sourceLanguage.label} collocation", "translation": "${replyLanguage.label} translation" }],
  "example": [{ "sentence": "${sourceLanguage.label} example sentence", "translation": "${replyLanguage.label} translation" }],
  "semanticRelations": {
    "synonyms": [{ "term": "sense-specific synonym", "translation": "translation" }],
    "antonyms": []
  },
  "isPartOfPhrase": false,
  "detectedPhrase": "",
  "phraseType": "none | phrasal_verb | idiom | fixed_expression",
  "isEstablishedExpression": false,
  "phraseConfidence": 0,
  "phraseMinimalityConfidence": 0,
  "phraseMeaningDiffers": false,
  "isLikelyTypo": false,
  "correctedTargetWord": "",
  "typoReason": "",
  "tags": ["max 3 tags"]
}
`;

  const primaryModel = OPENAI_GENERATE_CARD_MODEL;
  const fallbackModel = GEMINI_GENERATE_CARD_FALLBACK_MODEL;
  const streamMessages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: prompt },
  ];
  const startedAt = Date.now();

  try {
    const response = await buildOpenAIStreamResponse({
      model: primaryModel,
      messages: streamMessages,
      temperature: 0.1,
      maxTokens: sectionBudget.runtimeTokens,
      jsonMode: true,
    });
    logAIOutcome('generate_card_stream_ready', {
      requestId,
      action: 'generate_card_stream',
      status: 'success',
      provider: 'openai',
      model: primaryModel,
      latencyMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logAIDiagnostic('generate_card_stream_openai_failed', {
      requestId,
      provider: 'openai',
      model: primaryModel,
      error: error instanceof Error ? error.message : String(error),
    }, 'warn');
    const response = await buildGeminiStreamResponse({
      model: fallbackModel,
      messages: streamMessages,
      temperature: 0.1,
      maxTokens: sectionBudget.runtimeTokens,
      jsonMode: true,
      responseSchema,
      connectTimeoutMs: 15000,
    });
    logAIOutcome('generate_card_stream_ready', {
      requestId,
      action: 'generate_card_stream',
      status: 'success',
      provider: 'gemini',
      model: fallbackModel,
      latencyMs: Date.now() - startedAt,
    });
    return response;
  }
}

type CoreSubjectResolution = {
  originalTarget: string;
  canonicalSubject: string;
  normalizationKind: 'unchanged' | 'lemma' | 'typo' | 'phrase';
  isPartOfPhrase: boolean;
  detectedPhrase?: string;
  phraseConfidence?: number;
  phraseMeaningDiffers?: boolean;
  isLikelyTypo: boolean;
  correctedTargetWord?: string;
  typoReason?: string;
};

const CORE_RESOLUTION_HEADER = '==RESOLUTION==';

function readCoreSection(raw: string, header: string, nextHeader?: string): string {
  const headerPattern = new RegExp(`==\\s*${header}\\s*==`, 'i');
  const start = headerPattern.exec(raw);
  if (!start || start.index === undefined) return '';
  const contentStart = start.index + start[0].length;
  let content = raw.slice(contentStart);
  if (nextHeader) {
    const next = new RegExp(`==\\s*${nextHeader}\\s*==`, 'i').exec(content);
    if (next?.index !== undefined) content = content.slice(0, next.index);
  }
  return content.trim();
}

function clampConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function resolveCoreSubject(
  raw: string,
  originalSentence: string,
  targetWord: string
): { visibleRaw: string; resolution: CoreSubjectResolution } {
  const resolutionHeaderMatch = /==\s*RESOLUTION\s*==/i.exec(raw);
  const resolutionIndex = resolutionHeaderMatch?.index ?? -1;
  const visibleRaw = (resolutionIndex >= 0 ? raw.slice(0, resolutionIndex) : raw).trimEnd();
  const metadataRaw = resolutionIndex >= 0
    ? extractFirstJsonObject(
        raw.slice(resolutionIndex + (resolutionHeaderMatch?.[0].length || CORE_RESOLUTION_HEADER.length))
      )
    : null;
  let metadata: Record<string, unknown> = {};
  if (metadataRaw) {
    try {
      metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  }

  const originalTarget = normalizeHeadword(targetWord, targetWord);
  const visibleWord = normalizeHeadword(readCoreSection(visibleRaw, 'WORD', 'POS'), '');
  const proposedCanonical = normalizeHeadword(
    metadata.canonicalSubject || visibleWord,
    originalTarget
  );
  const proposedLemma = normalizeSingleTokenWord(metadata.lemma, '');
  const lemmaMeaningPreserved = parseBooleanLike(metadata.lemmaMeaningPreserved);
  const hasLemmaMeaningVerdict =
    typeof metadata.lemmaMeaningPreserved === 'boolean' ||
    (
      typeof metadata.lemmaMeaningPreserved === 'string' &&
      /^(?:true|false|yes|no|1|0)$/i.test(metadata.lemmaMeaningPreserved.trim())
    );
  const proposedKind = sanitizeText(metadata.normalizationKind, 24).toLowerCase();
  const visiblePartOfSpeech = readCoreSection(visibleRaw, 'POS', 'RESOLUTION');
  const detectedPhrase = sanitizeText(metadata.detectedPhrase, MAX_WORD_CHARS);
  const phraseType = sanitizeText(metadata.phraseType, 32);
  const isEstablishedExpression = parseBooleanLike(metadata.isEstablishedExpression);
  const phraseConfidence = clampConfidence(metadata.phraseConfidence);
  const phraseMinimalityConfidence = clampConfidence(metadata.phraseMinimalityConfidence);
  const phraseMeaningDiffers = parseBooleanLike(metadata.phraseMeaningDiffers);
  const correctedTargetWordRaw = normalizeHeadword(metadata.correctedTargetWord, '');
  const correctedTargetWord = normalizeSingleTokenWord(metadata.correctedTargetWord, '');
  const typoConfidence = clampConfidence(metadata.typoConfidence);
  const typoReason = sanitizeText(metadata.typoReason, 240);
  const visibleWordTokens = visibleWord.split(/\s+/).filter(Boolean);
  const proposedCanonicalTokens = proposedCanonical.split(/\s+/).filter(Boolean);
  const directTypoSuggestionCandidate =
    correctedTargetWord ||
    (visibleWordTokens.length === 1 && visibleWord !== originalTarget ? visibleWord : '') ||
    (
      proposedCanonicalTokens.length === 1 && proposedCanonical !== originalTarget
        ? proposedCanonical
        : ''
    );
  const inferredSurfaceCorrection = inferCorrectedSurfaceFromLemma(
    originalTarget,
    proposedCanonical || correctedTargetWord
  );
  const spacingCorrectionCandidate = firstOCRSpacingRestoration(
    originalTarget,
    correctedTargetWordRaw,
    detectedPhrase,
    proposedCanonical,
    visibleWord
  );
  const typoSuggestionCandidate = spacingCorrectionCandidate
    ? spacingCorrectionCandidate
    : (
        directTypoSuggestionCandidate &&
        isPlausibleTypoSuggestion(originalTarget, directTypoSuggestionCandidate)
      )
      ? directTypoSuggestionCandidate
      : inferredSurfaceCorrection || directTypoSuggestionCandidate;
  const hasPlausibleTypoSuggestion =
    Boolean(spacingCorrectionCandidate) ||
    (
      proposedKind === 'typo' &&
      Boolean(typoSuggestionCandidate) &&
      isPlausibleTypoSuggestion(originalTarget, typoSuggestionCandidate)
    );

  let canonicalSubject = originalTarget;
  let normalizationKind: CoreSubjectResolution['normalizationKind'] = 'unchanged';
  let confirmedPhrase = false;
  let confirmedTypo = false;

  const phraseConfirmed =
    proposedKind === 'phrase' &&
    hasLemmaMeaningVerdict &&
    !lemmaMeaningPreserved &&
    isConfirmedDetectedPhrase(originalSentence, targetWord, detectedPhrase, {
      phraseType,
      isEstablishedExpression,
      phraseConfidence,
      phraseMinimalityConfidence,
      phraseMeaningDiffers,
    });

  if (
    proposedKind === 'typo' &&
    typoConfidence >= 0.9 &&
    correctedTargetWord &&
    shouldApplyTypoCorrection(originalSentence, targetWord, correctedTargetWord)
  ) {
    canonicalSubject = correctedTargetWord;
    normalizationKind = 'typo';
    confirmedTypo = true;
  } else {
    const safeLemma =
      !isAdjectivalPartOfSpeech(visiblePartOfSpeech) &&
      proposedLemma &&
      isPlausibleEnglishLemma(originalTarget, proposedLemma)
        ? proposedLemma
        : originalTarget;
    const decision = chooseLearningTerm({
      originalTarget,
      lemma: safeLemma,
      lemmaMeaningPreserved: hasLemmaMeaningVerdict
        ? lemmaMeaningPreserved
        : true,
      canonicalPhrase: proposedCanonical,
      phraseConfirmed,
    });
    canonicalSubject = decision.learningTerm;
    normalizationKind = decision.kind;
    confirmedPhrase = decision.kind === 'phrase';
  }
  const wordHeader = /==\s*WORD\s*==/i.exec(visibleRaw);
  const posHeader = /==\s*POS\s*==/i.exec(visibleRaw);
  let safeVisibleRaw = visibleRaw;
  if (
    wordHeader?.index !== undefined &&
    posHeader?.index !== undefined &&
    posHeader.index > wordHeader.index
  ) {
    const wordContentStart = wordHeader.index + wordHeader[0].length;
    safeVisibleRaw =
      `${visibleRaw.slice(0, wordContentStart)}\n${canonicalSubject}\n` +
      visibleRaw.slice(posHeader.index);
  }

  return {
    visibleRaw: safeVisibleRaw,
    resolution: {
      originalTarget,
      canonicalSubject,
      normalizationKind,
      isPartOfPhrase: confirmedPhrase,
      detectedPhrase: confirmedPhrase ? detectedPhrase : undefined,
      phraseConfidence: confirmedPhrase ? phraseConfidence : undefined,
      phraseMeaningDiffers: confirmedPhrase ? true : undefined,
      isLikelyTypo: confirmedTypo || hasPlausibleTypoSuggestion,
      correctedTargetWord:
        confirmedTypo || hasPlausibleTypoSuggestion
          ? (spacingCorrectionCandidate || (confirmedTypo ? correctedTargetWord : typoSuggestionCandidate))
          : undefined,
      typoReason:
        confirmedTypo || hasPlausibleTypoSuggestion
          ? typoReason || (spacingCorrectionCandidate ? 'Possible OCR spacing correction' : 'Possible OCR or spelling correction')
          : undefined,
    },
  };
}

async function wrapCoreStreamWithResolution(
  upstream: Response,
  originalSentence: string,
  targetWord: string
): Promise<Response> {
  if (!upstream.body) return upstream;
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let eventBuffer = '';
  let rawContent = '';
  let emittedContent = '';
  let upstreamDonePayload: Record<string, unknown> = {};
  let holdingCanonicalTail = false;
  let pendingVisible = '';
  const wordHeader = '==WORD==';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitToken = (delta: string) => {
        if (!delta) return;
        emittedContent += delta;
        controller.enqueue(
          encoder.encode(`event: token\ndata: ${JSON.stringify({ delta })}\n\n`)
        );
      };

      const consumeEvent = (eventChunk: string) => {
        const data = eventChunk
          .split(/\r\n|\n|\r/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
          .trim();
        if (!data) return;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data) as Record<string, unknown>;
        } catch {
          return;
        }
        if (typeof parsed.delta === 'string') {
          rawContent += parsed.delta;
          if (holdingCanonicalTail) return;
          pendingVisible += parsed.delta;
          const markerIndex = pendingVisible.toUpperCase().indexOf(wordHeader);
          if (markerIndex >= 0) {
            emitToken(pendingVisible.slice(0, markerIndex));
            pendingVisible = pendingVisible.slice(markerIndex);
            holdingCanonicalTail = true;
            return;
          }
          const safeLength = Math.max(0, pendingVisible.length - (wordHeader.length - 1));
          emitToken(pendingVisible.slice(0, safeLength));
          pendingVisible = pendingVisible.slice(safeLength);
          return;
        }
        if (
          parsed.ttfbMs !== undefined ||
          parsed.totalMs !== undefined ||
          parsed.model !== undefined
        ) {
          upstreamDonePayload = parsed;
        }
      };

      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) eventBuffer += decoder.decode(result.value, { stream: !done });
        if (done) eventBuffer += decoder.decode();

        const delimiter = /\r\n\r\n|\n\n|\r\r/g;
        let consumedThrough = 0;
        let match: RegExpExecArray | null;
        while ((match = delimiter.exec(eventBuffer)) !== null) {
          consumeEvent(eventBuffer.slice(consumedThrough, match.index));
          consumedThrough = match.index + match[0].length;
        }
        eventBuffer = eventBuffer.slice(consumedThrough);
      }
      if (eventBuffer.trim()) consumeEvent(eventBuffer);

      if (!holdingCanonicalTail) emitToken(pendingVisible);
      const resolved = resolveCoreSubject(rawContent, originalSentence, targetWord);
      const remainingVisible = resolved.visibleRaw.startsWith(emittedContent)
        ? resolved.visibleRaw.slice(emittedContent.length)
        : resolved.visibleRaw;
      emitToken(remainingVisible);

      controller.enqueue(
        encoder.encode(
          `event: done\ndata: ${JSON.stringify({
            ...upstreamDonePayload,
            rawContent: resolved.visibleRaw,
            resolution: resolved.resolution,
          })}\n\n`
        )
      );
      controller.close();
    },
    cancel() {
      reader.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

async function handleGenerateCardCoreStream(payload: GenerateCardPayload): Promise<Response> {
  const requestId = createRequestId('generate_card_core_stream');
  const targetWord = sanitizeText(payload.targetWord, MAX_WORD_CHARS);
  const originalSentence = sanitizeText(payload.originalSentence, MAX_SENTENCE_CHARS);
  const replyLanguage = resolveReplyLanguageMeta(payload.replyLanguage);

  if (!targetWord || !originalSentence) {
    return jsonResponse({ error: 'targetWord and originalSentence are required', requestId }, 400);
  }

  const systemInstruction =
    `You are an expert in contemporary English usage and internet slang. ${CARD_SUBJECT_SELECTION_INSTRUCTION}`;

  const prompt = `
  Source sentence: "${originalSentence}"

  Card subject rule:
  ${CARD_SUBJECT_SELECTION_INSTRUCTION}

  Return only these 5 sections, exactly in this order:

  ==TRANS==
  <complete source sentence>
  <what a native ${replyLanguage.label} speaker would naturally say to convey the complete intended meaning of the source text, including non-literal or slang usage>
  ==DEF==
  <what "${targetWord}" means in this source text in ${replyLanguage.label}, as the shortest natural word or phrase>
  ==WORD==
  <the final learning term chosen by the ordered card subject rule>
  ==POS==
  <part of speech of ==WORD== here>
  ==RESOLUTION==
  {"targetMeaning":"the target word's corresponding meaning in the localized sentence","lemma":"single-word lemma for the in-context part of speech","lemmaMeaningPreserved":true,"canonicalSubject":"same value as ==WORD==","normalizationKind":"unchanged|lemma|typo|phrase","detectedPhrase":"","phraseType":"none|phrasal_verb|idiom|fixed_expression","isEstablishedExpression":false,"phraseConfidence":0,"phraseMinimalityConfidence":0,"phraseMeaningDiffers":false,"correctedTargetWord":"","typoConfidence":0,"typoReason":""}
  `;
  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: prompt },
  ];
  const startedAt = Date.now();

  try {
    const response = await buildGeminiStreamResponse({
      model: GEMINI_GENERATE_CARD_FALLBACK_MODEL,
      messages,
      temperature: 0.2,
      maxTokens: 520,
      jsonMode: false,
    });
    logAIOutcome('generate_card_core_stream_ready', {
      requestId,
      action: 'generate_card_core_stream',
      status: 'success',
      provider: 'gemini',
      model: GEMINI_GENERATE_CARD_FALLBACK_MODEL,
      latencyMs: Date.now() - startedAt,
    });
    return await wrapCoreStreamWithResolution(response, originalSentence, targetWord);
  } catch (error) {
    logAIDiagnostic('generate_card_core_stream_gemini_failed', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }, 'warn');
    const response = await buildOpenAIStreamResponse({
      model: OPENAI_GENERATE_CARD_MODEL,
      messages,
      temperature: 0.2,
      maxTokens: 520,
      jsonMode: false,
    });
    logAIOutcome('generate_card_core_stream_ready', {
      requestId,
      action: 'generate_card_core_stream',
      status: 'success',
      provider: 'openai',
      model: OPENAI_GENERATE_CARD_MODEL,
      latencyMs: Date.now() - startedAt,
    });
    return await wrapCoreStreamWithResolution(response, originalSentence, targetWord);
  }
}

async function handleGenerateCardEnrichmentStream(payload: GenerateCardPayload): Promise<Response> {
  const requestId = createRequestId('generate_card_enrichment_stream');
  const targetWord = sanitizeText(payload.targetWord, MAX_WORD_CHARS);
  const canonicalSubject = sanitizeText(payload.canonicalSubject || targetWord, MAX_WORD_CHARS);
  const originalSentence = sanitizeText(payload.originalSentence, MAX_SENTENCE_CHARS);
  const partOfSpeech = sanitizeText(payload.partOfSpeech || '', 80);
  const definition = sanitizeText(payload.definition || '', 160);
  const coreSentenceTranslation = sanitizeText(
    payload.coreSentenceTranslation || '',
    MAX_SENTENCE_CHARS * 2
  );
  const replyLanguage = resolveReplyLanguageMeta(payload.replyLanguage);
  const sourceLanguage = resolveSourceLanguageMeta(
    payload.sourceLanguage,
    `${targetWord} ${originalSentence}`
  );
  const aiBreakdownMode = resolveAIBreakdownMode(payload.aiBreakdownMode);
  const sectionBudget = CARD_SECTION_BUDGETS[aiBreakdownMode];
  const isLowContextSource = isLowContextSourceInput(targetWord, originalSentence);

  if (!targetWord || !canonicalSubject || !originalSentence) {
    return jsonResponse({ error: 'targetWord, canonicalSubject, and originalSentence are required', requestId }, 400);
  }
  const resolvedCoreMeaning =
    coreSentenceTranslation || `${originalSentence}\n${definition}`;

  const systemInstruction =
    'You are an expert in contemporary English usage and internet slang.';

  const prompt = `
Source text: "${originalSentence}"
Resolved source-and-translation block from core:
"""
${resolvedCoreMeaning}
"""

Create every field below from that resolved meaning.

Card subject: "${canonicalSubject}"
Part of speech: "${partOfSpeech}"
Meaning here in ${replyLanguage.label}: "${definition}"

1. Briefly explain in ${replyLanguage.label} why the card subject has this meaning and nuance in the source text.
2. First choose ${sectionBudget.collocationCount} genuine, common ${sourceLanguage.label} collocation(s) for this meaning, unless fewer genuinely exist, and give the natural ${replyLanguage.label} meaning of each whole collocation.
3. Then write one complete ${sourceLanguage.label} example sentence for each collocation. Build each example from its collocation and use that exact collocation, then give the natural ${replyLanguage.label} translation of the complete example.
4. Give up to ${sectionBudget.synonymCount} sense-specific synonym(s) and ${sectionBudget.antonymCount} true antonym(s), only when they naturally exist.
${isLowContextSource ? 'For a standalone lookup, use common usage for the resolved meaning.' : ''}

Return JSON in exactly this order:
{
  "culturalBackground": "why this word fits this sentence, including nuance/tone; not a general explanation of the subject",
  "usagePairs": [{ "phrase": "real ${sourceLanguage.label} collocation", "translation": "${replyLanguage.label} translation", "exampleSentence": "complete ${sourceLanguage.label} example using this exact collocation", "exampleTranslation": "complete ${replyLanguage.label} translation" }],
  "synonyms": [{ "term": "sense-specific synonym", "translation": "short translation" }],
  "antonyms": [{ "term": "true antonym", "translation": "short translation" }],
  "tags": ["max 3 short tags"]
}
`;
  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: prompt },
  ];
  const maxTokens = Math.max(520, sectionBudget.runtimeTokens - 300);
  const startedAt = Date.now();

  try {
    const response = await buildOpenAIStreamResponse({
      model: OPENAI_GENERATE_CARD_MODEL,
      messages,
      temperature: 0.1,
      maxTokens,
      jsonMode: true,
    });
    logAIOutcome('generate_card_enrichment_stream_ready', {
      requestId,
      action: 'generate_card_enrichment_stream',
      status: 'success',
      provider: 'openai',
      model: OPENAI_GENERATE_CARD_MODEL,
      latencyMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logAIDiagnostic('generate_card_enrichment_stream_openai_failed', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }, 'warn');
    const response = await buildGeminiStreamResponse({
      model: GEMINI_GENERATE_CARD_FALLBACK_MODEL,
      messages,
      temperature: 0.1,
      maxTokens,
      jsonMode: true,
      connectTimeoutMs: 15000,
    });
    logAIOutcome('generate_card_enrichment_stream_ready', {
      requestId,
      action: 'generate_card_enrichment_stream',
      status: 'success',
      provider: 'gemini',
      model: GEMINI_GENERATE_CARD_FALLBACK_MODEL,
      latencyMs: Date.now() - startedAt,
    });
    return response;
  }
}
// ==========================================

async function executeAction(
  action: Action,
  payload: unknown,
  userId: string,
  costContext?: {
    supabase: ReturnType<typeof createServiceRoleClient>;
    requestId: string;
  }
): Promise<Response> {
  if (action === 'get_or_create_demo_card') {
    return await handleGetOrCreateDemoCard(payload as DemoCardPayload, userId);
  }
  if (action === 'generate_card') {
    return await handleGenerateCard(payload as GenerateCardPayload);
  }
  if (action === 'generate_card_stream') {
    return await handleGenerateCardStream(payload as GenerateCardPayload);
  }
  if (action === 'generate_card_core_stream') {
    return await handleGenerateCardCoreStream(payload as GenerateCardPayload);
  }
  if (action === 'generate_card_enrichment_stream') {
    return await handleGenerateCardEnrichmentStream(payload as GenerateCardPayload);
  }
  if (action === 'pronunciation_assess') {
    const startedAt = Date.now();
    const pronunciationPayload = payload as PronunciationAssessPayload;
    const recordPronunciationCost = (status: 'success' | 'error') => {
      if (!costContext) return;
      recordAICostEventInBackground(costContext.supabase, {
        requestId: costContext.requestId,
        userId,
        capability: 'pronunciation_assessment',
        stage: 'assessment',
        provider: 'azure',
        modelCode: 'azure-speech-pronunciation-standard',
        status,
        billingUnit: 'audio_seconds',
        billableQuantity: estimateWavDurationSecondsFromBase64(
          pronunciationPayload.audioBase64
        ),
        latencyMs: Date.now() - startedAt,
        metadata: {
          locale:
            typeof pronunciationPayload.locale === 'string'
              ? pronunciationPayload.locale.slice(0, 20)
              : 'en-US',
        },
      });
    };
    try {
      const response = await handlePronunciationAssess(pronunciationPayload);
      recordPronunciationCost(response.ok ? 'success' : 'error');
      logAIOutcome('pronunciation_assess_completed', {
        action: 'pronunciation_assess',
        status: response.ok ? 'success' : 'error',
        statusCode: response.status,
        latencyMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      recordPronunciationCost('error');
      throw error;
    }
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
    const response = await executeAction(task.action, payload, task.userId, {
      supabase: createServiceRoleClient(),
      requestId: createRequestId(`cost_${task.action}`),
    });
    const json = await response.clone().json();
    const doneTask: AsyncTaskRecord = {
      ...runningTask,
      status: 'done',
      result: json,
      updatedAt: new Date().toISOString(),
    };
    await saveTask(doneTask);
  } catch (error) {
    console.error('[ai-proxy] async task failed', error);
    const failedTask: AsyncTaskRecord = {
      ...runningTask,
      status: 'error',
      error: 'ai_task_failed',
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
      canUseDevEntitlementBypass() && devPlan === 'premium'
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

      let claimedDemoPronunciation = false;
      if (planType === 'free' && body.action === 'pronunciation_assess') {
        const claimResult = await claimDemoPronunciationAssessment({
          supabase,
          userId,
          payload: body.payload as PronunciationAssessPayload,
        });
        claimedDemoPronunciation = claimResult === 'claimed';
        if (claimResult === 'unavailable') {
          return jsonResponse(
            {
              error: 'Demo pronunciation state is unavailable',
              reason: 'demo_pronunciation_unavailable',
            },
            503
          );
        }
      }

      let starterGenerationId: string | null = null;
      let claimedStarterCard = false;
      if (
        planType === 'free' &&
        STARTER_CARD_ACTIONS.has(body.action)
      ) {
        const payload = body.payload as GenerateCardPayload;
        starterGenerationId = sanitizeText(payload.generationId, 64);
        if (!starterGenerationId) {
          return jsonResponse(
            {
              error: 'Update required to use free starter cards',
              reason: 'starter_generation_id_required',
            },
            409
          );
        }
        const claim = await claimFreeStarterCard({
          supabase,
          userId,
          generationId: starterGenerationId,
        });
        if (claim.result === 'unavailable') {
          return jsonResponse(
            {
              error: 'Starter allowance is temporarily unavailable',
              reason: 'starter_allowance_unavailable',
            },
            503
          );
        }
        if (claim.result === 'exhausted') {
          return jsonResponse(
            {
              error: 'Free starter cards used',
              reason: 'premium_required',
              planType,
              paywallType: 'ai_generate',
              starterCardLimit: FREE_STARTER_CARD_LIMIT,
              starterCardsRemaining: 0,
            },
            403
          );
        }
        claimedStarterCard = true;
      }

      let hasStarterAccess = true;
      if (
        planType === 'free' &&
        body.action === 'pronunciation_assess' &&
        !claimedDemoPronunciation
      ) {
        const access = await hasFreeStarterAccess({ supabase, userId });
        if (access === null) {
          return jsonResponse(
            {
              error: 'Starter allowance is temporarily unavailable',
              reason: 'starter_allowance_unavailable',
            },
            503
          );
        }
        hasStarterAccess = access;
      }

      if (
        planType === 'free' &&
        BILLABLE_ACTIONS.has(body.action) &&
        !claimedDemoPronunciation &&
        !claimedStarterCard &&
        !hasStarterAccess
      ) {
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

      if (BILLABLE_ACTIONS.has(body.action)) {
        const limitsError = await enforceBillableActionLimits({
          userId,
          action: body.action,
          productId: (entitlement as { productId?: unknown }).productId,
        });
        if (limitsError) {
          if (claimedDemoPronunciation) {
            await finishDemoPronunciationAssessment({
              supabase,
              userId,
              succeeded: false,
            });
          }
          await trackUsage({
            userId,
            action: body.action,
            status: 'rate_limited',
          });
          return limitsError;
        }
      }

      if (body.action === 'pronunciation_assess' && !claimedDemoPronunciation) {
        const pronunciationQuotaError = await consumePronunciationDailyQuota({
          supabase,
          userId,
          planType,
        });
        if (pronunciationQuotaError) {
          await trackUsage({
            userId,
            action: body.action,
            status: 'rate_limited',
            meta: { reason: 'pronunciation_daily_quota_exceeded', planType },
          });
          return pronunciationQuotaError;
        }
      }

      if (
        body.async === true &&
        BILLABLE_ACTIONS.has(body.action) &&
        !claimedDemoPronunciation
      ) {
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

      // 1. 執行 Action (取得回應)
      let response: Response;
      try {
        response = await executeAction(body.action, body.payload, userId, {
          supabase,
          requestId: createRequestId(`cost_${body.action}`),
        });
      } catch (error) {
        if (claimedStarterCard && starterGenerationId) {
          await finishFreeStarterCard({
            supabase,
            userId,
            generationId: starterGenerationId,
            succeeded: false,
          });
        }
        if (claimedDemoPronunciation) {
          await finishDemoPronunciationAssessment({
            supabase,
            userId,
            succeeded: false,
          });
        }
        throw error;
      }
      if (claimedDemoPronunciation) {
        await finishDemoPronunciationAssessment({
          supabase,
          userId,
          succeeded: response.ok,
        });
      }
      if (
        claimedStarterCard &&
        starterGenerationId &&
        (body.action === 'generate_card' || !response.ok)
      ) {
        await finishFreeStarterCard({
          supabase,
          userId,
          generationId: starterGenerationId,
          succeeded: response.ok,
        });
      }

      // 🟢 2. 為 Stream 開啟絕對綠色通道！
      // 如果是串流，絕對不要用 .json() 去卡住它，立刻回傳並在背景記錄
      if (
        body.action === 'generate_card_stream' ||
        body.action === 'generate_card_core_stream' ||
        body.action === 'generate_card_enrichment_stream'
      ) {
        await trackUsage({
          userId,
          action: body.action,
          status: 'success',
        });
        const stage = body.action === 'generate_card_core_stream'
          ? 'core'
          : body.action === 'generate_card_enrichment_stream'
            ? 'enrichment'
            : 'full';
        return wrapAICostTrackedSSE({
          response,
          supabase,
          requestId: createRequestId(`cost_${body.action}`),
          userId,
          capability: 'generate_card',
          stage,
          onComplete: claimedStarterCard && starterGenerationId
            ? async (succeeded) => {
              if (
                body.action === 'generate_card_enrichment_stream' ||
                body.action === 'generate_card_stream' ||
                !succeeded
              ) {
                await finishFreeStarterCard({
                  supabase,
                  userId,
                  generationId: starterGenerationId!,
                  succeeded,
                });
              }
            }
            : undefined,
        });
      }

      // 🔴 3. 只有非串流的請求，才可以安心等待並解析 JSON
      let debugMeta: Record<string, unknown> | undefined;
      try {
        const parsed = await response.clone().json() as {
          meta?: {
            requestId?: string;
            providerUsed?: 'openai' | 'gemini';
            modelUsed?: string;
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
          const metrics = parsed.meta.metrics;
          const provider = parsed.meta.providerUsed ?? metrics?.provider;
          const modelCode = parsed.meta.modelUsed ?? metrics?.model;
          if (
            body.action === 'generate_card' &&
            response.ok &&
            (provider === 'openai' || provider === 'gemini') &&
            typeof modelCode === 'string'
          ) {
            recordAICostEventInBackground(supabase, {
              requestId: parsed.meta.requestId ?? createRequestId('cost_generate_card'),
              userId,
              capability: 'generate_card',
              stage: 'full',
              provider,
              modelCode,
              status: 'success',
              inputTokens: metrics?.inputTokens,
              outputTokens: metrics?.outputTokens,
              latencyMs: metrics?.latencyMs,
              ttfbMs: metrics?.ttfbMs,
              metadata: { transport: 'json' },
            });
          }
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

    if (isLegacyRequest(body)) {
      await trackUsage({
        userId,
        action: `legacy_${body.provider ?? 'unknown'}`,
        status: 'invalid_request',
        meta: { reason: 'legacy_mode_disabled' },
      });
      return jsonResponse(
        {
          error: 'Legacy provider/messages mode is disabled',
          reason: 'legacy_mode_disabled',
        },
        410
      );
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
    console.error('[ai-proxy] request failed', error);
    if (error instanceof DependencyUnavailableError) {
      return new Response(
        JSON.stringify({
          error: 'AI dependency temporarily unavailable',
          reason: error.reason,
          retryAfterMs: error.retryAfterMs,
        }),
        {
          status: 503,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))),
          },
        }
      );
    }
    return jsonResponse(
      {
        error: 'Unexpected error',
        reason: 'ai_proxy_request_failed',
      },
      500
    );
  }
});
