export type FirstRunTraceStage =
  | 'app_start'
  | 'auth'
  | 'onboarding'
  | 'video_tour'
  | 'tutorial'
  | 'greeting'
  | 'starter_allowance'
  | 'paywall';

export type FirstRunTraceEntry = Readonly<{
  sequence: number;
  elapsedMs: number;
  stage: FirstRunTraceStage;
  event: string;
  context?: Record<string, unknown>;
}>;

export type FirstRunTrace = Readonly<{
  record: (
    stage: FirstRunTraceStage,
    event: string,
    context?: Record<string, unknown>
  ) => void;
}>;

const SENSITIVE_CONTEXT_KEY = /(email|password|token|secret|authorization|credential)/i;
const EMAIL_LIKE_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const AUTHORIZATION_LIKE_VALUE = /\b(?:bearer|basic)\s+\S+/i;

export function sanitizeFirstRunTraceConsoleContext(
  context?: Record<string, unknown>
): Record<string, unknown> {
  if (!context) return {};

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      if (SENSITIVE_CONTEXT_KEY.test(key)) return [key, '[redacted]'];
      if (value === null || typeof value === 'number' || typeof value === 'boolean') {
        return [key, value];
      }
      if (typeof value === 'string') {
        return [
          key,
          EMAIL_LIKE_VALUE.test(value) || AUTHORIZATION_LIKE_VALUE.test(value)
            ? '[redacted]'
            : value,
        ];
      }
      return [key, Array.isArray(value) ? `[array:${value.length}]` : '[object]'];
    })
  );
}

export function createFirstRunTrace(options: {
  enabled: boolean;
  now?: () => number;
  sink: (entry: FirstRunTraceEntry) => void;
}): FirstRunTrace {
  const now = options.now ?? Date.now;
  const startedAt = now();
  let sequence = 0;

  return {
    record(stage, event, context) {
      if (!options.enabled) return;
      sequence += 1;
      options.sink({
        sequence,
        elapsedMs: Math.max(0, now() - startedAt),
        stage,
        event,
        ...(context ? { context } : {}),
      });
    },
  };
}
