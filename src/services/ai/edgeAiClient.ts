import { supabase } from '@services/supabase/client';

type AIProvider = 'openai' | 'gemini';
type AIFeatureAction =
  | 'analyze_text'
  | 'generate_card'
  | 'analyze_context'
  | 'analyze_and_generate_card'
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
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export class AIAuthError extends Error {
  constructor(message = 'Authentication required: please sign in first') {
    super(message);
    this.name = 'AIAuthError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  if (!accessToken) {
    throw new AIAuthError('Authentication required: please sign in first');
  }
  const normalizedToken = accessToken.trim().replace(/^"(.+)"$/, '$1');
  if (!normalizedToken) {
    throw new AIAuthError('Authentication required: please sign in first');
  }

  return {
    Authorization: `Bearer ${normalizedToken}`,
  };
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
    (is401 && (lower.includes('missing valid jwt') || lower.includes('invalid jwt')))
  );
}

function normalizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof value === 'string') {
      const normalized = value.replace(/\s+/g, ' ').trim();
      result[key] = normalized.length > 2000 ? normalized.slice(0, 2000) : normalized;
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
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: authHeaders.Authorization,
      },
      body: JSON.stringify(body),
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
      const bodyText = typeof parsedBody === 'string'
        ? parsedBody
        : JSON.stringify(parsedBody);
      return {
        data: null,
        error: `Edge Function returned a non-2xx status code (status: ${response.status}, body: ${bodyText || '<empty>'})`,
      };
    }

    return { data: parsedBody, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error || 'network error'),
    };
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
    throw new Error(`AI proxy error: ${detail}`);
  }

  throw new AIAuthError('Authentication required: please sign in again');
}

export async function callAIAction<TPayload, TResult>(
  action: AIFeatureAction,
  payload: TPayload,
  options: AsyncActionOptions = {}
): Promise<TResult> {
  let authHeaders = await getAuthHeader();
  const normalizedPayload = normalizePayload(payload);
  const asyncThresholdChars = options.asyncThresholdChars ?? 700;
  const shouldAsync =
    options.preferAsync &&
    typeof normalizedPayload === 'object' &&
    normalizedPayload !== null &&
    'text' in (normalizedPayload as Record<string, unknown>) &&
    typeof (normalizedPayload as Record<string, unknown>).text === 'string' &&
    ((normalizedPayload as Record<string, unknown>).text as string).length >= asyncThresholdChars;

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
          throw new Error(`AI action did not return taskId for async action: ${action}`);
        }
        const maxPollAttempts = options.maxPollAttempts ?? 30;
        const pollIntervalMs = options.pollIntervalMs ?? 1000;
        for (let pollAttempt = 0; pollAttempt < maxPollAttempts; pollAttempt += 1) {
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
        throw new Error(`AI action returned empty result for action: ${action}`);
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
    throw new Error(`AI action error: ${detail}`);
  }

  throw new AIAuthError('Authentication required: please sign in again');
}

export async function streamOpenAIProxy(
  request: Omit<AIRequest, 'provider'>,
  onToken: (delta: string) => void
): Promise<{ ttfbMs?: number; totalMs?: number; inputTokens?: number; outputTokens?: number }> {
  const authHeaders = await getAuthHeader();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration missing for Edge Function');
  }
  const endpoint = `${SUPABASE_URL}/functions/v1/${AI_EDGE_FUNCTION_NAME}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: authHeaders.Authorization,
    },
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
  let donePayload: { ttfbMs?: number; totalMs?: number; inputTokens?: number; outputTokens?: number } = {};

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
      const eventType = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
      const dataLine = lines.find((line) => line.startsWith('data:'))?.slice(5).trim();
      if (!eventType || !dataLine) continue;
      try {
        const payload = JSON.parse(dataLine) as Record<string, unknown>;
        if (eventType === 'token' && typeof payload.delta === 'string') {
          onToken(payload.delta);
        }
        if (eventType === 'done') {
          donePayload = {
            ttfbMs: typeof payload.ttfbMs === 'number' ? payload.ttfbMs : undefined,
            totalMs: typeof payload.totalMs === 'number' ? payload.totalMs : undefined,
            inputTokens: typeof payload.inputTokens === 'number' ? payload.inputTokens : undefined,
            outputTokens: typeof payload.outputTokens === 'number' ? payload.outputTokens : undefined,
          };
        }
      } catch {
        // ignore malformed stream chunk
      }
    }
  }

  return donePayload;
}
