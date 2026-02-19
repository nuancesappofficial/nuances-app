import { supabase } from '@services/supabase/client';

type AIProvider = 'openai' | 'gemini';
type AIFeatureAction = 'analyze_text' | 'generate_card' | 'analyze_context';

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

export function isAIProxyConfigured(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );
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
  const { data, error } = await supabase.functions.invoke(AI_EDGE_FUNCTION_NAME, {
    body: request,
  });

  if (error) {
    let detail = error.message;
    const maybeError = error as unknown as { context?: Response };
    if (maybeError.context) {
      try {
        const response = maybeError.context;
        const bodyText = await response.text();
        detail = `${detail} (status: ${response.status}, body: ${bodyText})`;
      } catch {
        // Ignore context parse failure and keep base error message.
      }
    }
    throw new Error(`AI proxy error: ${detail}`);
  }

  const text = extractText(data);
  if (!text) {
    throw new Error('AI proxy returned empty response');
  }

  return text;
}

export async function callAIAction<TPayload, TResult>(
  action: AIFeatureAction,
  payload: TPayload
): Promise<TResult> {
  const { data, error } = await supabase.functions.invoke(AI_EDGE_FUNCTION_NAME, {
    body: {
      action,
      payload,
    },
  });

  if (error) {
    let detail = error.message;
    const maybeError = error as unknown as { context?: Response };
    if (maybeError.context) {
      try {
        const response = maybeError.context;
        const bodyText = await response.text();
        detail = `${detail} (status: ${response.status}, body: ${bodyText})`;
      } catch {
        // Ignore context parse failure and keep base error message.
      }
    }
    throw new Error(`AI action error: ${detail}`);
  }

  const obj = (data || {}) as Record<string, unknown>;
  const result = obj.result as TResult | undefined;
  if (!result) {
    throw new Error(`AI action returned empty result for action: ${action}`);
  }
  return result;
}
