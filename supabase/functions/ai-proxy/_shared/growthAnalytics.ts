type FreemiumQuotaEvent = {
  event: 'freemium_quota_updated';
  distinctId: string;
  insertId: string;
  properties: {
    quota_limit: number;
    quota_used: number;
    quota_used_percent: number;
  };
};

function safeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function buildFreemiumQuotaEvent(params: {
  userId: string;
  generationId: string;
  limit: number;
  remaining: number;
}): FreemiumQuotaEvent {
  const limit = safeInteger(params.limit);
  const remaining = Math.min(limit, safeInteger(params.remaining));
  const used = limit - remaining;
  return {
    event: 'freemium_quota_updated',
    distinctId: params.userId,
    insertId: `starter-generation-${params.generationId}`,
    properties: {
      quota_limit: limit,
      quota_used: used,
      quota_used_percent: limit === 0 ? 0 : Math.round((used / limit) * 100),
    },
  };
}

async function captureFreemiumQuotaEvent(event: FreemiumQuotaEvent): Promise<void> {
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
      event: event.event,
      properties: {
        distinct_id: event.distinctId,
        $insert_id: event.insertId,
        ...event.properties,
      },
    }),
  });
  if (!response.ok) {
    console.warn('[growth-analytics] PostHog quota capture failed', {
      status: response.status,
    });
  }
}

export function recordFreemiumQuotaEventInBackground(
  event: FreemiumQuotaEvent
): void {
  const task = captureFreemiumQuotaEvent(event).catch((error) => {
    console.warn('[growth-analytics] Quota capture failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (task: Promise<void>) => void } })
    .EdgeRuntime;
  if (typeof edgeRuntime?.waitUntil === 'function') edgeRuntime.waitUntil(task);
}
