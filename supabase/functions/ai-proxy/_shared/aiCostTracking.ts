import { corsHeaders } from './httpResponse.ts';

type ServiceRoleClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>
  ) => Promise<{
    data?: Record<string, unknown> | null;
    error?: { message?: string } | null;
  }>;
};

export type AICostEvent = {
  requestId: string;
  userId: string;
  capability: string;
  stage: string;
  provider: 'openai' | 'gemini' | 'azure';
  modelCode: string;
  status?: 'success' | 'error' | 'cancelled';
  attemptIndex?: number;
  providerAttempts?: number;
  schemaRetries?: number;
  inputTokens?: number;
  outputTokens?: number;
  billingUnit?: 'tokens' | 'characters' | 'audio_seconds' | 'requests';
  billableQuantity?: number;
  latencyMs?: number;
  ttfbMs?: number;
  metadata?: Record<string, unknown>;
};

function safeNonNegativeInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
}

function safeFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function captureCostInPostHog(
  event: AICostEvent,
  snapshot: Record<string, unknown>
): Promise<void> {
  const apiKey = (
    Deno.env.get('POSTHOG_PROJECT_KEY') ??
    Deno.env.get('EXPO_PUBLIC_POSTHOG_API_KEY') ??
    ''
  ).trim();
  if (!apiKey) return;

  const host = (
    Deno.env.get('POSTHOG_HOST') ??
    Deno.env.get('EXPO_PUBLIC_POSTHOG_HOST') ??
    'https://us.i.posthog.com'
  ).trim().replace(/\/+$/, '');

  const response = await fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      event: 'api_cost_recorded',
      properties: {
        distinct_id: event.userId,
        $insert_id: snapshot.id,
        capability: snapshot.capability,
        stage: snapshot.stage,
        provider: snapshot.provider,
        model_code: snapshot.model_code,
        status: snapshot.status,
        billing_unit: snapshot.billing_unit,
        billable_quantity: safeFiniteNumber(snapshot.billable_quantity),
        input_tokens: safeFiniteNumber(snapshot.input_tokens),
        output_tokens: safeFiniteNumber(snapshot.output_tokens),
        total_tokens: safeFiniteNumber(snapshot.total_tokens),
        estimated_cost_usd: safeFiniteNumber(snapshot.estimated_cost_usd),
        estimated_cost_twd: safeFiniteNumber(snapshot.estimated_cost_twd),
        pricing_missing: snapshot.pricing_missing === true,
        latency_ms: snapshot.latency_ms,
      },
      timestamp: snapshot.occurred_at,
    }),
  });

  if (!response.ok) {
    console.warn('[ai-cost] Failed to mirror cost event to PostHog', {
      requestId: event.requestId,
      stage: event.stage,
      status: response.status,
    });
  }
}

export async function recordAICostEvent(
  supabase: ServiceRoleClient,
  event: AICostEvent
): Promise<void> {
  const { data, error } = await supabase.rpc('record_ai_cost_event', {
    p_request_id: event.requestId,
    p_user_id: event.userId,
    p_capability: event.capability,
    p_stage: event.stage,
    p_provider: event.provider,
    p_model_code: event.modelCode,
    p_status: event.status ?? 'success',
    p_attempt_index: event.attemptIndex ?? 1,
    p_provider_attempts: event.providerAttempts ?? 1,
    p_schema_retries: event.schemaRetries ?? 0,
    p_input_tokens: safeNonNegativeInteger(event.inputTokens) ?? 0,
    p_output_tokens: safeNonNegativeInteger(event.outputTokens) ?? 0,
    p_billing_unit: event.billingUnit ?? 'tokens',
    p_billable_quantity: Math.max(0, Number(event.billableQuantity) || 0),
    p_latency_ms: safeNonNegativeInteger(event.latencyMs),
    p_ttfb_ms: safeNonNegativeInteger(event.ttfbMs),
    p_metadata: event.metadata ?? {},
  });
  if (error) {
    console.warn('[ai-cost] Failed to record cost event', {
      requestId: event.requestId,
      stage: event.stage,
      message: error.message,
    });
    return;
  }
  if (data && typeof data === 'object') {
    await captureCostInPostHog(event, data);
  }
}

export function recordAICostEventInBackground(
  supabase: ServiceRoleClient,
  event: AICostEvent
): void {
  const task = recordAICostEvent(supabase, event).catch((error) => {
    console.warn('[ai-cost] Background recording failed', {
      requestId: event.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime && typeof edgeRuntime.waitUntil === 'function') {
    edgeRuntime.waitUntil(task);
  }
}

function parseSSEData(eventChunk: string): Record<string, unknown> | null {
  const data = eventChunk
    .split(/\r\n|\n|\r/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();
  if (!data) return null;
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function wrapAICostTrackedSSE(params: {
  response: Response;
  supabase: ServiceRoleClient;
  requestId: string;
  userId: string;
  capability: string;
  stage: string;
  onComplete?: (succeeded: boolean) => void | Promise<void>;
}): Response {
  const { response } = params;
  if (!response.body || !response.ok) return response;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let donePayload: Record<string, unknown> = {};
  let recorded = false;

  const record = (status: 'success' | 'cancelled') => {
    if (recorded) return;
    recorded = true;
    const provider = donePayload.provider === 'gemini' ? 'gemini' : 'openai';
    const modelCode = typeof donePayload.model === 'string'
      ? donePayload.model
      : 'unknown';
    recordAICostEventInBackground(params.supabase, {
      requestId: params.requestId,
      userId: params.userId,
      capability: params.capability,
      stage: params.stage,
      provider,
      modelCode,
      status,
      inputTokens: safeNonNegativeInteger(donePayload.inputTokens),
      outputTokens: safeNonNegativeInteger(donePayload.outputTokens),
      latencyMs: safeNonNegativeInteger(donePayload.totalMs),
      ttfbMs: safeNonNegativeInteger(donePayload.ttfbMs),
      metadata: { transport: 'sse' },
    });
  };

  const inspect = (text: string, flush = false) => {
    buffer += text;
    const delimiter = /\r\n\r\n|\n\n|\r\r/g;
    let consumedThrough = 0;
    let match: RegExpExecArray | null;
    while ((match = delimiter.exec(buffer)) !== null) {
      const parsed = parseSSEData(buffer.slice(consumedThrough, match.index));
      if (parsed && (
        parsed.totalMs !== undefined ||
        parsed.inputTokens !== undefined ||
        parsed.outputTokens !== undefined
      )) {
        donePayload = parsed;
      }
      consumedThrough = match.index + match[0].length;
    }
    buffer = buffer.slice(consumedThrough);
    if (flush && buffer.trim()) {
      const parsed = parseSSEData(buffer);
      if (parsed) donePayload = parsed;
      buffer = '';
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (value) {
            inspect(decoder.decode(value, { stream: !done }));
            controller.enqueue(value);
          }
          if (done) {
            inspect(decoder.decode(), true);
            record('success');
            await params.onComplete?.(true);
            controller.close();
            break;
          }
        }
      } catch (error) {
        await params.onComplete?.(false);
        controller.error(error);
      }
    },
    cancel() {
      record('cancelled');
      Promise.resolve(params.onComplete?.(false)).catch(() => undefined);
      reader.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      ...corsHeaders,
    },
  });
}
