import { supabase } from '@services/supabase/client';

type AIProvider = 'openai' | 'gemini';
type AIFeatureAction =
  | 'analyze_text'
  | 'generate_card'
  | 'analyze_context'
  | 'usage_summary';

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
  };
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
  payload: TPayload
): Promise<TResult> {
  let authHeaders = await getAuthHeader();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await invokeAIEndpoint(
      {
        action,
        payload,
      },
      authHeaders
    );

    if (!error) {
      const obj = (data || {}) as Record<string, unknown>;
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
