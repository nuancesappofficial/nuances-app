declare const Deno: any;

import { withDependencyGuard } from '../../_shared/dependencyGuard.ts';

import { GEMINI_ALLOWED_MODELS } from '../_shared/runtimeConfig.ts';
import { corsHeaders } from '../_shared/httpResponse.ts';

type ProviderExecutionMetrics = {
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
  rawContent?: string;
  finishReason?: string;
  promptFeedback?: unknown;
};

export class GeminiProviderError extends Error {
  status: number;
  retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'GeminiProviderError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export type ProviderModelRoute = {
  model: string;
  tier: 'fast' | 'balanced' | 'quality';
  reason: string;
};

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

export function routeGeminiModelForAction(params: {
  action:
    | 'analyze_text'
    | 'generate_card'
    | 'analyze_context'
    | 'analyze_and_generate_card'
    | 'legacy_gemini';
  payloadSize: number;
  requested?: unknown;
}): ProviderModelRoute {
  if (
    typeof params.requested === 'string' &&
    GEMINI_ALLOWED_MODELS.includes(params.requested)
  ) {
    return {
      model: params.requested,
      tier: 'quality',
      reason: 'explicit_model_override',
    };
  }

  const fast = GEMINI_ALLOWED_MODELS[0] ?? 'gemini-2.5-flash-lite';
  const balanced =
    GEMINI_ALLOWED_MODELS[Math.min(1, GEMINI_ALLOWED_MODELS.length - 1)] ??
    fast;
  const quality =
    GEMINI_ALLOWED_MODELS[Math.min(2, GEMINI_ALLOWED_MODELS.length - 1)] ??
    balanced;

  if (params.action === 'analyze_text') {
    return { model: fast, tier: 'fast', reason: 'short_keyword_extraction' };
  }
  if (params.payloadSize > 1200 || params.action === 'analyze_context') {
    return { model: quality, tier: 'quality', reason: 'long_or_context_heavy' };
  }
  if (
    params.action === 'generate_card' ||
    params.action === 'analyze_and_generate_card'
  ) {
    return { model: fast, tier: 'fast', reason: 'content_generation' };
  }
  return { model: fast, tier: 'fast', reason: 'default_low_latency' };
}

function toGeminiContents(messages: { role: string; content: unknown }[]) {
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

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  return trimmed
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

const GEMINI_REQUEST_TIMEOUT_MS = Math.max(
  15000,
  Number(Deno.env.get('GEMINI_REQUEST_TIMEOUT_MS') ?? '30000')
);

function resolveGeminiMaxOutputTokens(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1024;
  return Math.max(128, Math.min(8192, Math.round(numeric)));
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.round(seconds * 1000);
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return undefined;
  return Math.max(0, dateMs - Date.now());
}

export async function callGeminiLegacy(params: {
  model: string;
  messages: { role: string; content: unknown }[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  responseSchema?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<ProviderResponse> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY in Edge Function secrets');
  }

  const startedAt = Date.now();
  const maxOutputTokens = resolveGeminiMaxOutputTokens(params.maxTokens);
  const controller = new AbortController();
  const requestTimeoutMs = Math.max(
    15000,
    Math.min(
      params.timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS,
      GEMINI_REQUEST_TIMEOUT_MS
    )
  );
  const timeout = setTimeout(() => {
    controller.abort();
  }, requestTimeoutMs);
  const requestBody = {
        contents: toGeminiContents(params.messages),
        safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
        generationConfig: {
      maxOutputTokens,
          temperature: params.temperature ?? 0.7,
          ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
  };
  let response: Response;
  try {
    response = await withDependencyGuard(
      'gemini',
      () =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(requestBody),
          }
        ),
      {
        isFailure: (result) => result.status === 429 || result.status >= 500,
      }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeminiProviderError(
        `Gemini request timed out after ${Math.round(requestTimeoutMs / 1000)} seconds`,
        504
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new GeminiProviderError(
      (data as { error?: { message?: string } })?.error?.message ||
        `Gemini request failed (${response.status})`,
      response.status,
      parseRetryAfterMs(response.headers.get('retry-after'))
    );
  }

  const candidate = (data as any)?.candidates?.[0];
  
  // 記錄是否被安全機制擋下
  if (candidate?.finishReason === 'SAFETY') {
    console.error('[ai-proxy] Gemini generation blocked by SAFETY filters!');
  }

  const usage = (data as any)?.usageMetadata;
  const rawContent = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
    : '';
  
  // 即使不強制 JSON Mode，我們依然呼叫 stripMarkdownFences 來清理頭尾
  const cleanedContent = params.jsonMode
    ? stripMarkdownFences(rawContent)
    : rawContent;

  return {
    content: cleanedContent,
    rawContent,
    finishReason:
      typeof candidate?.finishReason === 'string'
        ? candidate.finishReason
        : undefined,
    promptFeedback: (data as any)?.promptFeedback,
    metrics: {
      provider: 'gemini',
      model: params.model,
      latencyMs: Date.now() - startedAt,
      inputTokens:
        typeof usage?.promptTokenCount === 'number'
          ? usage.promptTokenCount
          : undefined,
      outputTokens:
        typeof usage?.candidatesTokenCount === 'number'
          ? usage.candidatesTokenCount
          : undefined,
    },
  };
}

export async function buildGeminiStreamResponse(params: {
  model: string;
  messages: { role: string; content: unknown }[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  responseSchema?: Record<string, unknown>;
  connectTimeoutMs?: number;
}): Promise<Response> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY in Edge Function secrets');
  }

  const startedAt = Date.now();
  const maxOutputTokens = resolveGeminiMaxOutputTokens(params.maxTokens);
  const connectTimeoutMs = Math.max(15000, params.connectTimeoutMs ?? 15000);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, connectTimeoutMs);
  const requestBody = {
    contents: toGeminiContents(params.messages),
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
    generationConfig: {
      maxOutputTokens,
      temperature: params.temperature ?? 0.7,
      ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };
  let response: Response;
  try {
    response = await withDependencyGuard(
      'gemini',
      () =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:streamGenerateContent?alt=sse&key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(requestBody),
          }
        ),
      {
        isFailure: (result) => result.status === 429 || result.status >= 500,
      }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeminiProviderError(
        `Gemini stream connection timed out after ${Math.round(connectTimeoutMs / 1000)} seconds`,
        504
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok || !response.body) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {
      errorBody = '';
    }
    throw new GeminiProviderError(
      errorBody || `Gemini stream request failed (${response.status})`,
      response.status,
      parseRetryAfterMs(response.headers.get('retry-after'))
    );
  }

  const reader = response.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawContent = '';
  let firstTokenAt: number | null = null;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let finishReason: string | undefined;
  let promptFeedback: unknown;
  const pendingDeltas: string[] = [];

  const drainBufferedEvents = (flush = false): string[] => {
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
    return events;
  };

  const consumeEvent = (
    eventChunk: string,
    emitDelta?: (delta: string) => void
  ) => {
    const data = eventChunk
      .split(/\r\n|\n|\r/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data) return;

    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    const candidate = parsed?.candidates?.[0];
    const delta = Array.isArray(candidate?.content?.parts)
      ? candidate.content.parts
          .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
          .join('')
      : '';
    if (delta) {
      if (!firstTokenAt) firstTokenAt = Date.now();
      rawContent += delta;
      if (emitDelta) {
        emitDelta(delta);
      } else {
        pendingDeltas.push(delta);
      }
    }

    if (typeof candidate?.finishReason === 'string') {
      finishReason = candidate.finishReason;
    }
    if (parsed?.promptFeedback !== undefined) {
      promptFeedback = parsed.promptFeedback;
    }
    const usage = parsed?.usageMetadata;
    if (usage) {
      inputTokens =
        typeof usage.promptTokenCount === 'number'
          ? usage.promptTokenCount
          : inputTokens;
      outputTokens =
        typeof usage.candidatesTokenCount === 'number'
          ? usage.candidatesTokenCount
          : outputTokens;
    }
  };

  // Read through the first text delta before returning the Response. This lets
  // callers fall back to another provider if Gemini ends with a valid HTTP 200
  // response but no candidate text.
  let upstreamDone = false;
  while (!pendingDeltas.length && !upstreamDone) {
    const { done, value } = await reader.read();
    upstreamDone = done;
    if (value) buffer += decoder.decode(value, { stream: !done });
    if (done) buffer += decoder.decode();
    for (const eventChunk of drainBufferedEvents(done)) {
      consumeEvent(eventChunk);
    }
  }

  if (!pendingDeltas.length) {
    const detail = finishReason
      ? `finishReason=${finishReason}`
      : promptFeedback
        ? `promptFeedback=${JSON.stringify(promptFeedback)}`
        : 'no candidate text or feedback';
    throw new GeminiProviderError(
      `Gemini stream completed without text (${detail})`,
      502
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const padding = ' '.repeat(4096);
      streamController.enqueue(
        encoder.encode(
          `event: open\ndata: ${JSON.stringify({ model: params.model, padding })}\n\n`
        )
      );
      const emitDelta = (delta: string) => {
        streamController.enqueue(
          encoder.encode(`event: token\ndata: ${JSON.stringify({ delta })}\n\n`)
        );
      };
      for (const delta of pendingDeltas) {
        emitDelta(delta);
      }

      while (!upstreamDone) {
        const { done, value } = await reader.read();
        upstreamDone = done;
        if (value) buffer += decoder.decode(value, { stream: !done });
        if (done) buffer += decoder.decode();
        for (const eventChunk of drainBufferedEvents(done)) {
          consumeEvent(eventChunk, emitDelta);
        }
      }

      streamController.enqueue(
        encoder.encode(
          `event: done\ndata: ${JSON.stringify({
            rawContent,
            provider: 'gemini',
            model: params.model,
            ttfbMs: firstTokenAt ? firstTokenAt - startedAt : null,
            totalMs: Date.now() - startedAt,
            inputTokens,
            outputTokens,
          })}\n\n`
        )
      );
      streamController.close();
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
