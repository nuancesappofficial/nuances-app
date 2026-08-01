declare const Deno: any;

import { corsHeaders } from '../_shared/httpResponse.ts';
import { OPENAI_ALLOWED_MODELS } from '../_shared/runtimeConfig.ts';
import { withDependencyGuard } from '../../_shared/dependencyGuard.ts';

export type ProviderModelRoute = {
  model: string;
  tier: 'fast' | 'balanced' | 'quality';
  reason: string;
};

export type ProviderExecutionMetrics = {
  provider: 'openai' | 'gemini';
  model: string;
  latencyMs: number;
  ttfbMs?: number;
  inputTokens?: number;
  outputTokens?: number;
};

type ProviderResponse = {
  content: string;
  metrics: ProviderExecutionMetrics;
};

const OPENAI_REQUEST_TIMEOUT_MS = Math.max(
  5_000,
  Number(Deno.env.get('OPENAI_REQUEST_TIMEOUT_MS') ?? '30000')
);

async function fetchOpenAI(
  init: RequestInit,
  timeoutMs = OPENAI_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await withDependencyGuard(
      'openai',
      () =>
        fetch('https://api.openai.com/v1/chat/completions', {
          ...init,
          signal: controller.signal,
        }),
      {
        isFailure: (response) =>
          response.status === 429 || response.status >= 500,
      }
    );
  } finally {
    clearTimeout(timer);
  }
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

export function routeOpenAIModelForAction(params: {
  action:
    | 'analyze_text'
    | 'generate_card'
    | 'analyze_context'
    | 'analyze_and_generate_card'
    | 'legacy_openai';
  payloadSize: number;
  requested?: unknown;
}): ProviderModelRoute {
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

export async function callOpenAIChat(params: {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<ProviderResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in Edge Function secrets');
  }

  const startedAt = Date.now();
  const model = pickModel(params.model, OPENAI_ALLOWED_MODELS, OPENAI_ALLOWED_MODELS[0]);

  const maxTokens = Math.max(128, Math.min(4096, Math.round(Number(params.maxTokens) || 1024)));
  const response = await fetchOpenAI({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      temperature: params.temperature ?? 0.3,
      max_tokens: maxTokens,
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

export async function buildOpenAIStreamResponse(params: {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<Response> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in Edge Function secrets');
  }
  const startedAt = Date.now();
  const maxTokens = Math.max(128, Math.min(4096, Math.round(Number(params.maxTokens) || 1024)));
  const response = await fetchOpenAI({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: pickModel(params.model, OPENAI_ALLOWED_MODELS, OPENAI_ALLOWED_MODELS[0]),
      messages: params.messages,
      temperature: params.temperature ?? 0.3,
      max_tokens: maxTokens,
      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
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
      const padding = ' '.repeat(4096);
      controller.enqueue(
        encoder.encode(`event: ready\ndata: ${JSON.stringify({ started: true, padding })}\n\n`)
      );
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
        provider: 'openai',
        model: pickModel(params.model, OPENAI_ALLOWED_MODELS, OPENAI_ALLOWED_MODELS[0]),
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
