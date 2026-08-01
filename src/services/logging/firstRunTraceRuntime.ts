import {
  createFirstRunTrace,
  sanitizeFirstRunTraceConsoleContext,
  type FirstRunTraceEntry,
  type FirstRunTraceStage,
} from './firstRunTrace';
import { logDiagnosticEvent } from './diagnosticsLog';

const FIRST_RUN_TRACE_ENABLED =
  __DEV__ ||
  String(process.env.EXPO_PUBLIC_FIRST_RUN_TRACE || '').toLowerCase() === 'true';

function persistEntry(entry: FirstRunTraceEntry): void {
  console.log(
    `[FirstRunTrace] #${entry.sequence} +${entry.elapsedMs}ms ${entry.stage}.${entry.event}`,
    sanitizeFirstRunTraceConsoleContext(entry.context)
  );
  void logDiagnosticEvent({
    severity: 'info',
    category: entry.stage === 'auth' ? 'auth' : 'ui',
    event: `first_run.${entry.stage}.${entry.event}`,
    context: {
      traceSequence: entry.sequence,
      traceElapsedMs: entry.elapsedMs,
      ...entry.context,
    },
  });
}

const runtimeTrace = createFirstRunTrace({
  enabled: FIRST_RUN_TRACE_ENABLED,
  sink: persistEntry,
});

export function traceFirstRun(
  stage: FirstRunTraceStage,
  event: string,
  context?: Record<string, unknown>
): void {
  runtimeTrace.record(stage, event, context);
}

export function isFirstRunTraceEnabled(): boolean {
  return FIRST_RUN_TRACE_ENABLED;
}
