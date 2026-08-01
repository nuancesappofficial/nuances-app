import { supabase } from '@services/supabase/client';
import SubscriptionService from '@services/subscription/SubscriptionService';

type AIProvider = 'openai' | 'gemini';
type AIFeatureAction =
  | 'analyze_text'
  | 'generate_card'
  | 'generate_card_stream'
  | 'generate_card_core_stream'
  | 'generate_card_enrichment_stream'
  | 'analyze_context'
  | 'analyze_and_generate_card'
  | 'pronunciation_assess'
  | 'usage_summary'
  | 'get_task_result';

type AIMessage = {
  role: string;
  content: unknown;
};

type AIRequest = {
  provider: AIProvider;
  messages: AIMessage[];
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    stream?: boolean;
  };
};

type AsyncActionOptions = {
  preferAsync?: boolean;
  asyncThresholdChars?: number;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
};

const AI_EDGE_FUNCTION_NAME =
  process.env.EXPO_PUBLIC_AI_EDGE_FUNCTION_NAME || 'ai-proxy';
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(
  /\/+$/,
  ''
);
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const AI_EDGE_TIMEOUT_MS = 45000;
const AI_CLIENT_DIAGNOSTICS_ENABLED =
  __DEV__ ||
  String(process.env.EXPO_PUBLIC_AI_CLIENT_DIAGNOSTICS || '').toLowerCase() ===
    'true';

export class AIAuthError extends Error {
  constructor(message = 'Authentication required: please sign in first') {
    super(message);
    this.name = 'AIAuthError';
  }
}

export class PremiumFeatureError extends Error {
  constructor(message = 'Premium or active trial required') {
    super(message);
    this.name = 'PremiumFeatureError';
  }
}

export function isPremiumFeatureError(error: unknown): boolean {
  if (error instanceof PremiumFeatureError) return true;
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  return (
    lower.includes('premium_required') ||
    lower.includes('premium or active trial required') ||
    lower.includes('"paywalltype"') ||
    lower.includes('需要試用版或 premium')
  );
}

function isPronunciationQuotaError(detail: string): boolean {
  const lower = detail.toLowerCase();
  return (
    lower.includes('pronunciation_daily_quota_exceeded') ||
    lower.includes('pronunciation_week_quota_exceeded') ||
    lower.includes('pronunciation_month_quota_exceeded') ||
    lower.includes('pronunciation fair-use limit') ||
    lower.includes('daily pronunciation quota exceeded')
  );
}

function isDailyQuotaError(detail: string): boolean {
  const lower = detail.toLowerCase();
  return (
    lower.includes('ai_generation_daily_quota_exceeded') ||
    lower.includes('ai_generation_week_quota_exceeded') ||
    lower.includes('ai_generation_month_quota_exceeded') ||
    lower.includes('ai card generation limit') ||
    lower.includes('ai card generation fair-use limit') ||
    lower.includes('daily_quota_exceeded') ||
    lower.includes('daily quota exceeded') ||
    lower.includes("you've reached today's")
  );
}

function isRateLimitError(detail: string): boolean {
  const lower = detail.toLowerCase();
  return (
    lower.includes('rate_limit_exceeded') ||
    lower.includes('rate limit exceeded') ||
    lower.includes('too quickly')
  );
}

function userFacingQuotaError(detail: string): string | null {
  if (isPronunciationQuotaError(detail)) {
    if (detail.toLowerCase().includes('subscription period')) {
      return "You've used this subscription period's pronunciation scoring fair-use limit. You can still create cards and study; pronunciation scoring resets next period.";
    }
    return "You've used today's pronunciation check limit. You can still create cards and study; pronunciation scoring resets tomorrow.";
  }
  if (isDailyQuotaError(detail)) {
    if (detail.toLowerCase().includes('subscription period')) {
      return "You've used this subscription period's AI card generation fair-use limit. You can still review existing cards and use features that do not need new AI generation; this resets next period.";
    }
    return "You've used today's AI card generation limit. You can still review existing cards and use features that do not need new AI generation; this resets tomorrow.";
  }
  if (isRateLimitError(detail)) {
    return "You're going a little fast. Please wait a moment and try again.";
  }
  return null;
}

async function ensureCloudAIAccess(featureLabel: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    logAIClientDiagnostic('cloud_access_no_user', { featureLabel });
    throw new AIAuthError('Authentication required: please sign in first');
  }

  const entitlement = await SubscriptionService.getEntitlementSnapshot(user.id);
  logAIClientDiagnostic('cloud_access_snapshot', {
    featureLabel,
    user: user.id.slice(-8),
    planType: entitlement.planType,
    canUseCloudAI: entitlement.canUseCloudAI,
    canUseAutoCardGeneration: entitlement.canUseAutoCardGeneration,
    devBypass: entitlement.devBypass,
  });
  if (!entitlement.canUseCloudAI) {
    throw new PremiumFeatureError(
      `${featureLabel} 需要試用版或 Premium 才能使用。`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildEdgeHeaders(authHeaders: {
  Authorization: string;
}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    apikey: SUPABASE_ANON_KEY,
    Authorization: authHeaders.Authorization,
    ...(SubscriptionService.isPremiumBypassEnabled()
      ? { 'x-nuances-dev-plan': 'premium' }
      : {}),
  };
}

function logAIClientDiagnostic(
  event: string,
  meta: Record<string, unknown> = {}
) {
  if (!AI_CLIENT_DIAGNOSTICS_ENABLED) return;
  console.log('[AIClient][diagnostic]', {
    event,
    ...meta,
  });
}

function formatEdgeFunctionError(status: number, parsedBody: unknown): string {
  if (parsedBody && typeof parsedBody === 'object') {
    const body = parsedBody as Record<string, unknown>;
    const message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : '';
    const error =
      typeof body.error === 'string'
        ? body.error
        : 'Edge Function request failed';
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const details = typeof body.details === 'string' ? body.details : '';
    const requestId =
      typeof body.requestId === 'string' ? `requestId=${body.requestId}` : '';
    const suffix = [reason, details, requestId].filter(Boolean).join(': ');
    const base = message || error;
    return suffix ? `${base} (${status}): ${suffix}` : `${base} (${status})`;
  }
  const bodyText = typeof parsedBody === 'string' ? parsedBody : '';
  return `Edge Function returned a non-2xx status code (status: ${status}, body: ${bodyText || '<empty>'})`;
}

export function isAIProxyConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function getAuthHeader(): Promise<{ Authorization: string }> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new AIAuthError(`Failed to read auth session: ${error.message}`);
  }

  const accessToken = session?.access_token;
  const normalizedToken = accessToken?.trim().replace(/^"(.+)"$/, '$1') || '';
  if (normalizedToken) {
    logAIClientDiagnostic('auth_header_ready', { source: 'session' });
    return {
      Authorization: `Bearer ${normalizedToken}`,
    };
  }

  // 某些情況下 getSession 可能暫時拿不到 access token（例如冷啟後 state 還未恢復），
  // 先嘗試 refresh 再判定為未登入，避免請求在本機端就被攔下且 Supabase 無任何 log。
  const refreshed = await refreshAuthHeader();
  if (refreshed?.Authorization) {
    logAIClientDiagnostic('auth_header_ready', { source: 'refresh' });
    return refreshed;
  }
  logAIClientDiagnostic('auth_header_missing');
  throw new AIAuthError('Authentication required: please sign in first');
}

async function refreshAuthHeader(): Promise<{ Authorization: string } | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    return null;
  }
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return null;
  }
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function isInvalidJwtError(detail: string): boolean {
  const lower = detail.toLowerCase();
  const is401 = lower.includes('status: 401');
  const mentionsAuthTokenProblem =
    lower.includes('invalid jwt') ||
    lower.includes('missing valid jwt') ||
    lower.includes('authentication required') ||
    lower.includes('jwt');

  return (
    mentionsAuthTokenProblem ||
    (is401 &&
      (lower.includes('missing valid jwt') || lower.includes('invalid jwt')))
  );
}

function normalizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    payload as Record<string, unknown>
  )) {
    if (typeof value === 'string') {
      if (key === 'audioBase64') {
        result[key] = value.trim();
        continue;
      }
      const normalized = value.replace(/\s+/g, ' ').trim();
      result[key] =
        normalized.length > 2000 ? normalized.slice(0, 2000) : normalized;
      continue;
    }
    result[key] = value;
  }
  return result;
}

async function invokeAIEndpoint(
  body: unknown,
  authHeaders: { Authorization: string }
): Promise<{ data: unknown; error: null } | { data: null; error: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      data: null,
      error: 'Supabase configuration missing for Edge Function',
    };
  }

  const endpoint = `${SUPABASE_URL}/functions/v1/${AI_EDGE_FUNCTION_NAME}`;
  const startedAt = Date.now();
  logAIClientDiagnostic('edge_request_start', {
    endpoint,
    bodyType:
      body &&
      typeof body === 'object' &&
      'action' in (body as Record<string, unknown>)
        ? `action:${String((body as Record<string, unknown>).action)}`
        : 'legacy',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, AI_EDGE_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildEdgeHeaders(authHeaders),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    logAIClientDiagnostic('edge_response_received', {
      status: response.status,
      ok: response.ok,
      latencyMs: Date.now() - startedAt,
    });

    const responseText = await response.text();
    const parsedBody = (() => {
      if (!responseText) return null;
      try {
        return JSON.parse(responseText) as unknown;
      } catch {
        return responseText;
      }
    })();

    if (!response.ok) {
      return {
        data: null,
        error: formatEdgeFunctionError(response.status, parsedBody),
      };
    }

    return { data: parsedBody, error: null };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logAIClientDiagnostic('edge_request_timeout', {
        timeoutMs: AI_EDGE_TIMEOUT_MS,
        latencyMs: Date.now() - startedAt,
      });
    return {
      data: null,
        error: `AI request timed out after ${Math.round(AI_EDGE_TIMEOUT_MS / 1000)} seconds`,
    };
  }
    logAIClientDiagnostic('edge_request_failed', {
      latencyMs: Date.now() - startedAt,
      error:
        error instanceof Error
          ? error.message
          : String(error || 'network error'),
    });
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : String(error || 'network error'),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';

  const obj = payload as Record<string, unknown>;
  if (typeof obj.content === 'string') return obj.content;
  if (typeof obj.output_text === 'string') return obj.output_text;
  if (
    obj.result &&
    typeof obj.result === 'object' &&
    typeof (obj.result as Record<string, unknown>).content === 'string'
  ) {
    return (obj.result as Record<string, unknown>).content as string;
  }
  if (
    Array.isArray(obj.choices) &&
    obj.choices[0] &&
    typeof obj.choices[0] === 'object'
  ) {
    const message = (obj.choices[0] as Record<string, unknown>).message;
    if (message && typeof message === 'object') {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === 'string') return content;
    }
  }
  if (
    Array.isArray(obj.candidates) &&
    obj.candidates[0] &&
    typeof obj.candidates[0] === 'object'
  ) {
    const content = (obj.candidates[0] as Record<string, unknown>).content;
    if (content && typeof content === 'object') {
      const parts = (content as Record<string, unknown>).parts;
      if (
        Array.isArray(parts) &&
        parts[0] &&
        typeof parts[0] === 'object' &&
        typeof (parts[0] as Record<string, unknown>).text === 'string'
      ) {
        return (parts[0] as Record<string, unknown>).text as string;
      }
    }
  }

  return '';
}

export async function callAIProxy(request: AIRequest): Promise<string> {
  await ensureCloudAIAccess('AI 功能');
  let authHeaders = await getAuthHeader();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await invokeAIEndpoint(request, authHeaders);

    if (!error) {
      const text = extractText(data);
      if (!text) {
        throw new Error('AI proxy returned empty response');
      }
      return text;
    }

    const detail = error;
    if (isInvalidJwtError(detail) && attempt < 2) {
      if (attempt > 0) {
        await sleep(800);
      }
      const refreshedHeaders = await refreshAuthHeader();
      if (refreshedHeaders) {
        authHeaders = refreshedHeaders;
        continue;
      }
      throw new AIAuthError('Authentication required: please sign in again');
    }
    if (isInvalidJwtError(detail)) {
      throw new AIAuthError('Authentication required: please sign in again');
    }
    if (isPremiumFeatureError(detail)) {
      throw new PremiumFeatureError('Premium or active trial required');
    }
    throw new Error(`AI proxy error: ${detail}`);
  }

  throw new AIAuthError('Authentication required: please sign in again');
}

export async function callAIAction<TPayload, TResult>(
  action: AIFeatureAction,
  payload: TPayload,
  options: AsyncActionOptions = {}
): Promise<TResult> {
  // generate_card must reach ai-proxy so server-side entitlement, diagnostics,
  // and request IDs stay authoritative across TestFlight and production.
  if (
    action !== 'usage_summary' &&
    action !== 'get_task_result' &&
    action !== 'pronunciation_assess' &&
    action !== 'generate_card'
  ) {
    await ensureCloudAIAccess('AI 自動生成');
  }
  let authHeaders = await getAuthHeader();
  const normalizedPayload = normalizePayload(payload);
  const asyncThresholdChars = options.asyncThresholdChars ?? 700;
  const shouldAsync =
    options.preferAsync &&
    typeof normalizedPayload === 'object' &&
    normalizedPayload !== null &&
    'text' in (normalizedPayload as Record<string, unknown>) &&
    typeof (normalizedPayload as Record<string, unknown>).text === 'string' &&
    ((normalizedPayload as Record<string, unknown>).text as string).length >=
      asyncThresholdChars;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await invokeAIEndpoint(
      {
        action,
        payload: normalizedPayload,
        async: shouldAsync,
      },
      authHeaders
    );

    if (!error) {
      const obj = (data || {}) as Record<string, unknown>;
      if (shouldAsync) {
        const asyncTask = obj.result as
          | { taskId?: string; status?: string }
          | undefined;
        const taskId = asyncTask?.taskId;
        if (!taskId) {
          throw new Error(
            `AI action did not return taskId for async action: ${action}`
          );
        }
        const maxPollAttempts = options.maxPollAttempts ?? 30;
        const pollIntervalMs = options.pollIntervalMs ?? 1000;
        for (
          let pollAttempt = 0;
          pollAttempt < maxPollAttempts;
          pollAttempt += 1
        ) {
          await sleep(pollIntervalMs);
          const taskResult = await callAIAction<
            { taskId: string },
            {
              taskId: string;
              status: 'queued' | 'running' | 'done' | 'error';
              response?: { result?: TResult };
              error?: string;
            }
          >('get_task_result', { taskId });
          if (taskResult.status === 'done') {
            const finalResult = taskResult.response?.result;
            if (finalResult === undefined) {
              throw new Error(`Async task completed without result: ${taskId}`);
            }
            return finalResult;
          }
          if (taskResult.status === 'error') {
            throw new Error(taskResult.error || `Async task failed: ${taskId}`);
          }
        }
        throw new Error(`Async task timeout for action: ${action}`);
      }
      const result = obj.result as TResult | undefined;
      if (!result) {
        throw new Error(
          `AI action returned empty result for action: ${action}`
        );
      }
      return result;
    }

    const detail = error;
    if (isInvalidJwtError(detail) && attempt < 2) {
      if (attempt > 0) {
        await sleep(800);
      }
      const refreshedHeaders = await refreshAuthHeader();
      if (refreshedHeaders) {
        authHeaders = refreshedHeaders;
        continue;
      }
      throw new AIAuthError('Authentication required: please sign in again');
    }
    if (isInvalidJwtError(detail)) {
      throw new AIAuthError('Authentication required: please sign in again');
    }
    if (isPremiumFeatureError(detail)) {
      throw new PremiumFeatureError('Premium or active trial required');
    }
    const quotaError = userFacingQuotaError(detail);
    if (quotaError) {
      throw new Error(quotaError);
    }
    throw new Error(`AI action error: ${detail}`);
  }

  throw new AIAuthError('Authentication required: please sign in again');
}

export async function streamAIAction<TPayload>(
  action: AIFeatureAction,
  payload: TPayload,
  handlers: {
    onToken?: (delta: string) => void;
    onFirstToken?: () => void;
  } = {}
): Promise<{
  rawContent: string;
  ttfbMs?: number;
  totalMs?: number;
  model?: string;
  resolution?: {
    originalTarget?: string;
    canonicalSubject?: string;
    normalizationKind?: 'unchanged' | 'lemma' | 'typo' | 'phrase';
    isPartOfPhrase?: boolean;
    detectedPhrase?: string;
    phraseConfidence?: number;
    phraseMeaningDiffers?: boolean;
    isLikelyTypo?: boolean;
    correctedTargetWord?: string;
    typoReason?: string;
  };
}> {
  if (
    action !== 'generate_card_stream' &&
    action !== 'generate_card_core_stream' &&
    action !== 'generate_card_enrichment_stream'
  ) {
    await ensureCloudAIAccess('AI 自動生成');
  }
  let authHeaders = await getAuthHeader();
  const normalizedPayload = normalizePayload(payload);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const endpoint = `${SUPABASE_URL}/functions/v1/${AI_EDGE_FUNCTION_NAME}`;
    const startedAt = Date.now();

    try {
      const { status, text, donePayload, finalRawContent } = await new Promise<{
        status: number;
        text: string;
        donePayload: Record<string, unknown>;
        finalRawContent: string;
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', endpoint);
        xhr.timeout = AI_EDGE_TIMEOUT_MS;
        const headers = buildEdgeHeaders(authHeaders);
        for (const [key, val] of Object.entries(headers)) {
          xhr.setRequestHeader(key, val);
        }

        let seenBytes = 0;
        let buffer = '';
        let rawContent = '';
        let sawFirstToken = false;
        let parsedDonePayload: Record<string, unknown> = {};

        const processBufferedEvents = (flush = false) => {
          const events: string[] = [];
          const delimiter = /\r\n\r\n|\n\n|\r\r/g;
          let consumedThrough = 0;
          let match: RegExpExecArray | null;

          while ((match = delimiter.exec(buffer)) !== null) {
            events.push(buffer.slice(consumedThrough, match.index));
            consumedThrough = match.index + match[0].length;
          }

          buffer = buffer.slice(consumedThrough);
          if (flush && buffer.trim()) {
            events.push(buffer);
            buffer = '';
          }

          for (const ev of events) {
            const data = ev
              .split(/\r\n|\n|\r/)
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart())
              .join('\n')
              .trim();
            if (!data) continue;

            try {
              const payloadObj = JSON.parse(data) as Record<string, unknown>;

              if (payloadObj.delta !== undefined) {
                if (!sawFirstToken) {
                  sawFirstToken = true;
                  handlers.onFirstToken?.();
                }
                rawContent += String(payloadObj.delta);
                handlers.onToken?.(String(payloadObj.delta));
              }

              if (
                payloadObj.ttfbMs !== undefined ||
                payloadObj.totalMs !== undefined ||
                payloadObj.model !== undefined
              ) {
                parsedDonePayload = payloadObj;
                if (typeof payloadObj.rawContent === 'string') {
                  rawContent = payloadObj.rawContent;
                }
              }
            } catch {
              // Ignore malformed server events while allowing later events through.
            }
          }
        };

        xhr.onreadystatechange = () => {
          if (xhr.readyState === 3 && xhr.status === 200) {
            const currentText = xhr.responseText || '';
            const chunk = currentText.slice(seenBytes);
            seenBytes = currentText.length;
            buffer += chunk;
            processBufferedEvents(false);
          }

          if (xhr.readyState !== 4) return;

          // A non-200 response is still a completed request. Resolve it so the
          // caller can classify 401/403 responses instead of leaving the ghost
          // card waiting on a Promise that can never settle.
          if (xhr.status === 200) {
            const currentText = xhr.responseText || '';
            const chunk = currentText.slice(seenBytes);
            seenBytes = currentText.length;
            buffer += chunk;
            processBufferedEvents(true);
          }
          resolve({
            status: xhr.status,
            text: xhr.responseText,
            donePayload: parsedDonePayload,
            finalRawContent: rawContent,
          });
        };

        xhr.onerror = () => reject(new Error('Network request failed'));
        xhr.ontimeout = () =>
          reject(
            new Error(
              `AI request timed out after ${Math.round(AI_EDGE_TIMEOUT_MS / 1000)} seconds`
            )
          );
        xhr.send(JSON.stringify({ action, payload: normalizedPayload }));
      });

      if (status !== 200) {
        const detail = formatEdgeFunctionError(
          status,
          (() => {
            try {
              return JSON.parse(text) as unknown;
            } catch {
              return text;
            }
          })()
        );

        if (isInvalidJwtError(detail) && attempt === 0) {
          const refreshedHeaders = await refreshAuthHeader();
          if (refreshedHeaders) {
            authHeaders = refreshedHeaders;
            continue;
          }
          throw new AIAuthError(
            'Authentication required: please sign in again'
          );
        }
        if (isPremiumFeatureError(detail)) {
          throw new PremiumFeatureError('Premium or active trial required');
        }
        const quotaError = userFacingQuotaError(detail);
        if (quotaError) {
          throw new Error(quotaError);
        }
        throw new Error(`AI stream action error: ${detail}`);
      }

      const resultRawContent =
        (typeof donePayload.rawContent === 'string'
          ? donePayload.rawContent
          : undefined) || finalRawContent;

      logAIClientDiagnostic('stream_action_done', {
        action,
        latencyMs: Date.now() - startedAt,
        ttfbMs: donePayload.ttfbMs,
        model: donePayload.model,
        rawContentLength: resultRawContent.length,
      });

      return {
        rawContent: resultRawContent,
        ttfbMs:
          typeof donePayload.ttfbMs === 'number'
            ? donePayload.ttfbMs
            : undefined,
        totalMs:
          typeof donePayload.totalMs === 'number'
            ? donePayload.totalMs
            : undefined,
        model:
          typeof donePayload.model === 'string' ? donePayload.model : undefined,
        resolution:
          donePayload.resolution &&
          typeof donePayload.resolution === 'object' &&
          !Array.isArray(donePayload.resolution)
            ? (donePayload.resolution as {
                originalTarget?: string;
                canonicalSubject?: string;
                normalizationKind?: 'unchanged' | 'lemma' | 'typo' | 'phrase';
                isPartOfPhrase?: boolean;
                detectedPhrase?: string;
                phraseConfidence?: number;
                phraseMeaningDiffers?: boolean;
                isLikelyTypo?: boolean;
                correctedTargetWord?: string;
                typoReason?: string;
              })
            : undefined,
      };
    } catch (error) {
      if (error instanceof PremiumFeatureError || error instanceof AIAuthError) {
        throw error;
      }
      if (attempt === 1) {
        throw error;
      }
      console.warn('Stream attempt 0 failed, retrying...', error);
    }
  }

  throw new Error('AI stream action failed after maximum retries');
}

export async function streamOpenAIProxy(
  request: Omit<AIRequest, 'provider'>,
  onToken: (delta: string) => void
): Promise<{
  ttfbMs?: number;
  totalMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}> {
  const authHeaders = await getAuthHeader();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration missing for Edge Function');
  }
  const endpoint = `${SUPABASE_URL}/functions/v1/${AI_EDGE_FUNCTION_NAME}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildEdgeHeaders(authHeaders),
    body: JSON.stringify({
      provider: 'openai',
      messages: request.messages,
      options: {
        ...(request.options || {}),
        stream: true,
      },
    }),
  });
  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`AI stream error: ${response.status} ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let donePayload: {
    ttfbMs?: number;
    totalMs?: number;
    inputTokens?: number;
    outputTokens?: number;
  } = {};

  let shouldRead = true;
  while (shouldRead) {
    const { done, value } = await reader.read();
    if (done) {
      shouldRead = false;
      continue;
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const eventChunk of events) {
      const lines = eventChunk.split('\n');
      const eventType = lines
        .find((line) => line.startsWith('event:'))
        ?.slice(6)
        .trim();
      const dataLine = lines
        .find((line) => line.startsWith('data:'))
        ?.slice(5)
        .trim();
      if (!eventType || !dataLine) continue;
      try {
        const payload = JSON.parse(dataLine) as Record<string, unknown>;
        if (eventType === 'token' && typeof payload.delta === 'string') {
          onToken(payload.delta);
        }
        if (eventType === 'done') {
          donePayload = {
            ttfbMs:
              typeof payload.ttfbMs === 'number' ? payload.ttfbMs : undefined,
            totalMs:
              typeof payload.totalMs === 'number' ? payload.totalMs : undefined,
            inputTokens:
              typeof payload.inputTokens === 'number'
                ? payload.inputTokens
                : undefined,
            outputTokens:
              typeof payload.outputTokens === 'number'
                ? payload.outputTokens
                : undefined,
          };
        }
      } catch {
        // ignore malformed stream chunk
      }
    }
  }

  return donePayload;
}
