declare const Deno: any;

export const RATE_LIMIT_PER_MINUTE = Number(
  Deno.env.get('AI_RATE_LIMIT_PER_MINUTE') ?? '20'
);
export const DAILY_QUOTA = Number(Deno.env.get('AI_DAILY_QUOTA') ?? '200');

export const MAX_TEXT_CHARS = Number(Deno.env.get('AI_MAX_TEXT_CHARS') ?? '2000');
export const MAX_SENTENCE_CHARS = Number(
  Deno.env.get('AI_MAX_SENTENCE_CHARS') ?? '600'
);
export const MAX_WORD_CHARS = Number(Deno.env.get('AI_MAX_WORD_CHARS') ?? '64');
export const MAX_KEYWORDS_CHARS = Number(
  Deno.env.get('AI_MAX_KEYWORDS_CHARS') ?? '200'
);

export const MAX_TOKENS_ANALYZE = Number(
  Deno.env.get('AI_MAX_TOKENS_ANALYZE') ?? '180'
);
export const MAX_TOKENS_GENERATE = Number(
  Deno.env.get('AI_MAX_TOKENS_GENERATE') ?? '1000'
);
export const MAX_TOKENS_CONTEXT = Number(
  Deno.env.get('AI_MAX_TOKENS_CONTEXT') ?? '300'
);
export const MAX_TOKENS_LEGACY = Number(Deno.env.get('AI_MAX_TOKENS_LEGACY') ?? '500');
export const AI_OUTPUT_TOKEN_CAP = Number(Deno.env.get('AI_OUTPUT_TOKEN_CAP') ?? '500');
export const AI_MAX_CONTEXT_MESSAGES = Number(Deno.env.get('AI_MAX_CONTEXT_MESSAGES') ?? '8');
export const AI_MAX_MESSAGE_CHARS = Number(Deno.env.get('AI_MAX_MESSAGE_CHARS') ?? '500');
export const AI_MAX_CONTEXT_CHARS = Number(Deno.env.get('AI_MAX_CONTEXT_CHARS') ?? '3200');
export const MAX_AUDIO_BASE64_CHARS = Number(
  Deno.env.get('AI_MAX_AUDIO_BASE64_CHARS') ?? '12000000'
);
export const USAGE_RETENTION_DAYS = Number(Deno.env.get('AI_USAGE_RETENTION_DAYS') ?? '14');
export const USAGE_RECENT_LIMIT_MAX = Number(
  Deno.env.get('AI_USAGE_RECENT_LIMIT_MAX') ?? '50'
);
export const AI_TASK_TTL_HOURS = Number(Deno.env.get('AI_TASK_TTL_HOURS') ?? '24');

// Default to fail-closed so billable endpoints are not unbounded if Deno KV
// is unavailable in production. Set this explicitly in local/dev if needed.
export const ALLOW_BILLABLE_WITHOUT_KV = String(
  Deno.env.get('AI_ALLOW_BILLABLE_WITHOUT_KV') ?? 'false'
).toLowerCase() === 'true';

export const OPENAI_ALLOWED_MODELS = (Deno.env.get('OPENAI_ALLOWED_MODELS')
  ?? 'gpt-4o-mini')
  .split(',')
  .map((item: string) => item.trim())
  .filter(Boolean);

export const GEMINI_ALLOWED_MODELS = (Deno.env.get('GEMINI_ALLOWED_MODELS')
  ?? 'gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.5-pro')
  .split(',')
  .map((item: string) => item.trim())
  .filter(Boolean);

export const AZURE_SPEECH_KEY = Deno.env.get('AZURE_SPEECH_KEY') ?? '';
const AZURE_SPEECH_REGION_RAW = Deno.env.get('AZURE_SPEECH_REGION') ?? '';

export const AZURE_REQUEST_TIMEOUT_MS = Number(
  Deno.env.get('AZURE_REQUEST_TIMEOUT_MS') ?? '12000'
);
export const AZURE_TOKEN_TIMEOUT_MS = Number(
  Deno.env.get('AZURE_TOKEN_TIMEOUT_MS') ?? '4000'
);
export const AZURE_MIN_WAV_BYTES = Number(Deno.env.get('AZURE_MIN_WAV_BYTES') ?? '6000');

function normalizeAzureRegion(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const AZURE_SPEECH_REGION = normalizeAzureRegion(AZURE_SPEECH_REGION_RAW);
