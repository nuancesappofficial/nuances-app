import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { supabase } from '@services/supabase/client';

export type DiagnosticSeverity = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type DiagnosticCategory =
  | 'app_lifecycle'
  | 'auth'
  | 'subscription'
  | 'sync'
  | 'ai'
  | 'ocr'
  | 'tts'
  | 'pronunciation'
  | 'share_extension'
  | 'storage'
  | 'network'
  | 'ui'
  | 'system'
  | 'unknown';

export type DiagnosticLogEntry = {
  id: string;
  timestamp: string;
  requestId: string;
  sessionId: string;
  userId?: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  event: string;
  message?: string;
  context?: Record<string, unknown>;
  runtime: {
    platform: string;
    osVersion?: string | null;
    appVersion?: string | null;
    buildVersion?: string | null;
    expoRuntimeVersion?: string | null;
    isDevice?: boolean;
  };
};

const DIAGNOSTIC_LOG_KEY = 'nuances_diagnostic_log_v1';
const MAX_LOG_ENTRIES = 300;
const MAX_STRING_LENGTH = 600;
const MAX_CONTEXT_KEYS = 24;
const MAX_ARRAY_ITEMS = 12;
const REDACTED = '[redacted]';
const CONTENT_REDACTED = '[content-redacted]';
const GUEST_LOG_SCOPE = 'guest';
const SENSITIVE_KEY_PATTERN =
  /(authorization|token|secret|password|apikey|api_key|access[_-]?token|refresh[_-]?token|id[_-]?token|jwt|cookie|session|credential|private[_-]?key)/i;
const USER_CONTENT_KEY_PATTERN =
  /(prompt|raw|ocr|transcript|recognized|speech|audio|image|base64|content|fulltext|full_text|document|sourceText|source_text)/i;

let installed = false;
let originalConsoleWarn: typeof console.warn | null = null;
let originalConsoleError: typeof console.error | null = null;
const diagnosticsSessionId = createLogId();
let remoteWriteInFlight = 0;
let localWriteQueue: Promise<void> = Promise.resolve();

function createLogId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getRuntimeInfo(): DiagnosticLogEntry['runtime'] {
  return {
    platform: Platform.OS,
    osVersion: Platform.Version == null ? null : String(Platform.Version),
    appVersion: Application.nativeApplicationVersion ?? null,
    buildVersion: Application.nativeBuildVersion ?? null,
    expoRuntimeVersion: Constants.expoConfig?.runtimeVersion
      ? String(Constants.expoConfig.runtimeVersion)
      : null,
    isDevice: Constants.isDevice,
  };
}

function redactString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[jwt-redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email-redacted]')
    .replace(/(access_token|refresh_token|id_token|api[_-]?key|secret|password)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, MAX_STRING_LENGTH);
}

function sanitizeValue(value: unknown, keyHint = '', depth = 0): unknown {
  if (SENSITIVE_KEY_PATTERN.test(keyHint)) return REDACTED;
  if (USER_CONTENT_KEY_PATTERN.test(keyHint)) return CONTENT_REDACTED;
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) {
    if (depth >= 2) return `[array:${value.length}]`;
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, keyHint, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 2) return '[object]';
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value).slice(0, MAX_CONTEXT_KEYS)) {
      output[key] = sanitizeValue(nestedValue, key, depth + 1);
    }
    return output;
  }
  return redactString(String(value));
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return redactString(`${error.name}: ${error.message}`);
  return redactString(String(error));
}

function getLogStorageKey(userId?: string | null): string {
  return `${DIAGNOSTIC_LOG_KEY}:${userId ?? GUEST_LOG_SCOPE}`;
}

async function readEntries(userId?: string | null): Promise<DiagnosticLogEntry[]> {
  const raw = await AsyncStorage.getItem(getLogStorageKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as DiagnosticLogEntry[] : [];
  } catch {
    return [];
  }
}

async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function writeRemoteEntry(entry: DiagnosticLogEntry): Promise<void> {
  if (!entry.userId) return;
  if (remoteWriteInFlight > 4) return;
  remoteWriteInFlight += 1;
  try {
    const { error } = await supabase.from('app_diagnostic_logs').insert({
      occurred_at: entry.timestamp,
      user_id: entry.userId,
      request_id: entry.requestId,
      session_id: entry.sessionId,
      level: entry.severity,
      category: entry.category,
      event: entry.event,
      message: entry.message ?? null,
      context: entry.context ?? {},
      runtime: entry.runtime,
      platform: entry.runtime.platform,
      os_version: entry.runtime.osVersion ?? null,
      app_version: entry.runtime.appVersion ?? null,
      build_version: entry.runtime.buildVersion ?? null,
    });
    if (error) {
      originalConsoleWarn?.('[DiagnosticsLog] remote insert failed:', error.message);
    }
  } catch (error) {
    originalConsoleWarn?.('[DiagnosticsLog] remote insert crashed:', error);
  } finally {
    remoteWriteInFlight -= 1;
  }
}

export async function logDiagnosticEvent(params: {
  severity: DiagnosticSeverity;
  category?: DiagnosticCategory;
  event: string;
  message?: unknown;
  context?: Record<string, unknown>;
  requestId?: string;
  userId?: string | null;
}): Promise<DiagnosticLogEntry> {
  const userId = params.userId === undefined ? await getAuthenticatedUserId() : params.userId;
  const entry: DiagnosticLogEntry = {
    id: createLogId(),
    timestamp: new Date().toISOString(),
    requestId: params.requestId ?? createLogId(),
    sessionId: diagnosticsSessionId,
    userId: userId ?? undefined,
    severity: params.severity,
    category: params.category ?? 'unknown',
    event: redactString(params.event).slice(0, 120),
    message: params.message == null ? undefined : redactString(String(params.message)),
    context: params.context ? sanitizeValue(params.context) as Record<string, unknown> : undefined,
    runtime: getRuntimeInfo(),
  };

  const localWrite = localWriteQueue.then(async () => {
    const existing = await readEntries(userId);
    const next = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);
    await AsyncStorage.setItem(getLogStorageKey(userId), JSON.stringify(next));
  });
  localWriteQueue = localWrite.catch((error) => {
    originalConsoleWarn?.('[DiagnosticsLog] local write failed:', error);
  });
  await localWrite;

  void writeRemoteEntry(entry);

  return entry;
}

export async function getDiagnosticLogs(): Promise<DiagnosticLogEntry[]> {
  return readEntries(await getAuthenticatedUserId());
}

export async function clearDiagnosticLogs(): Promise<void> {
  await AsyncStorage.removeItem(getLogStorageKey(await getAuthenticatedUserId()));
}

function describeConsoleArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    return {
      type: 'Error',
      name: arg.name,
      message: redactString(arg.message),
    };
  }
  if (arg == null) return { type: String(arg) };
  if (Array.isArray(arg)) return { type: 'array', length: arg.length };
  if (typeof arg === 'object') return { type: 'object', keys: Object.keys(arg).slice(0, 12) };
  return { type: typeof arg, value: typeof arg === 'string' ? redactString(arg).slice(0, 120) : arg };
}

function logConsoleEvent(severity: 'warn' | 'error', args: unknown[]): void {
  void logDiagnosticEvent({
    severity,
    category: 'system',
    event: `console.${severity}`,
    message: `console.${severity} captured with ${args.length} argument(s)`,
    context: { args: args.map(describeConsoleArg) },
  }).catch((error) => {
    originalConsoleWarn?.('[DiagnosticsLog] failed to persist console event:', error);
  });
}

function installConsoleCapture(): void {
  originalConsoleWarn = console.warn;
  originalConsoleError = console.error;

  console.warn = ((...args: unknown[]) => {
    logConsoleEvent('warn', args);
    originalConsoleWarn?.(...args);
  }) as typeof console.warn;

  console.error = ((...args: unknown[]) => {
    logConsoleEvent('error', args);
    originalConsoleError?.(...args);
  }) as typeof console.error;
}

function installGlobalErrorCapture(): void {
  const runtimeGlobal = globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
    addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  };
  const previousHandler = runtimeGlobal.ErrorUtils?.getGlobalHandler?.();

  runtimeGlobal.ErrorUtils?.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
    void logDiagnosticEvent({
      severity: isFatal ? 'fatal' : 'error',
      category: 'system',
      event: 'global_js_error',
      message: normalizeErrorMessage(error),
      context: {
        isFatal: Boolean(isFatal),
        error,
      },
    }).catch((loggingError) => {
      originalConsoleWarn?.('[DiagnosticsLog] failed to persist global error:', loggingError);
    });
    // Never delay React Native's fatal handler on storage, auth, or network I/O.
    previousHandler?.(error, isFatal);
  });

  runtimeGlobal.addEventListener?.('unhandledrejection', (event: unknown) => {
    const reason = (event as { reason?: unknown })?.reason;
    void logDiagnosticEvent({
      severity: 'error',
      category: 'system',
      event: 'unhandled_promise_rejection',
      message: normalizeErrorMessage(reason ?? event),
      context: { reason: reason ?? event },
    });
  });
}

export function installDiagnosticsLogger(): void {
  if (installed) return;
  installed = true;
  installConsoleCapture();
  installGlobalErrorCapture();

  (globalThis as typeof globalThis & {
    NuancesDiagnosticsLog?: {
      get: typeof getDiagnosticLogs;
      clear: typeof clearDiagnosticLogs;
      log: typeof logDiagnosticEvent;
    };
  }).NuancesDiagnosticsLog = {
    get: getDiagnosticLogs,
    clear: clearDiagnosticLogs,
    log: logDiagnosticEvent,
  };

  void logDiagnosticEvent({
    severity: 'info',
    category: 'app_lifecycle',
    event: 'diagnostics_logger_installed',
  });
}
