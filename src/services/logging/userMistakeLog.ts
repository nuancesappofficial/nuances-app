import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { logDiagnosticEvent } from './diagnosticsLog';

export type UserMistakeLogCategory =
  | 'auth'
  | 'permission'
  | 'subscription'
  | 'validation'
  | 'capacity'
  | 'network'
  | 'user_action'
  | 'unknown';

export type UserMistakeLogEntry = {
  id: string;
  timestamp: string;
  category: UserMistakeLogCategory;
  title: string;
  message: string;
};

const USER_MISTAKE_LOG_KEY = 'nuances_user_mistake_log_v1';
const MAX_LOG_ENTRIES = 200;
const USER_ERROR_TITLE_PATTERNS = [
  /fail/i,
  /failed/i,
  /invalid/i,
  /missing/i,
  /required/i,
  /unable/i,
  /not signed in/i,
  /permission/i,
  /unauthorized/i,
  /錯誤/,
  /失敗/,
  /無法/,
  /需要/,
  /找不到/,
  /尚未登入/,
  /未登入/,
  /已滿/,
  /權限/,
];

let isAlertLoggerInstalled = false;
let originalAlert: typeof Alert.alert | null = null;

function createLogId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function redactSensitiveText(value: unknown): string {
  const raw = typeof value === 'string' ? value : value == null ? '' : String(value);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[jwt-redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email-redacted]')
    .replace(/(access_token|refresh_token|id_token|api[_-]?key|secret|password)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 500);
}

function inferCategory(title: string, message: string): UserMistakeLogCategory {
  const text = `${title} ${message}`.toLowerCase();
  if (text.includes('login') || text.includes('sign in') || text.includes('登入') || text.includes('jwt')) return 'auth';
  if (text.includes('permission') || text.includes('權限') || text.includes('相簿') || text.includes('相機')) return 'permission';
  if (text.includes('premium') || text.includes('subscription') || text.includes('restore') || text.includes('購買')) return 'subscription';
  if (text.includes('cache full') || text.includes('已滿')) return 'capacity';
  if (text.includes('network') || text.includes('連線')) return 'network';
  if (text.includes('invalid') || text.includes('malformed') || text.includes('無效')) return 'validation';
  return 'user_action';
}

function shouldLogAlert(title: string, message: string): boolean {
  const text = `${title} ${message}`;
  return USER_ERROR_TITLE_PATTERNS.some((pattern) => pattern.test(text));
}

async function getLogStorageKey(): Promise<string> {
  const userId = await getCurrentSessionUserId();
  return `${USER_MISTAKE_LOG_KEY}:${userId ?? 'guest'}`;
}

async function readEntries(storageKey?: string): Promise<UserMistakeLogEntry[]> {
  const raw = await AsyncStorage.getItem(storageKey ?? await getLogStorageKey());
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as UserMistakeLogEntry[] : [];
  } catch {
    return [];
  }
}

export async function logUserMistakeEvent(params: {
  title: unknown;
  message?: unknown;
  category?: UserMistakeLogCategory;
}): Promise<UserMistakeLogEntry> {
  const title = redactSensitiveText(params.title);
  const message = redactSensitiveText(params.message);
  const entry: UserMistakeLogEntry = {
    id: createLogId(),
    timestamp: new Date().toISOString(),
    category: params.category || inferCategory(title, message),
    title,
    message,
  };

  const storageKey = await getLogStorageKey();
  const existing = await readEntries(storageKey);
  const next = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);
  await AsyncStorage.setItem(storageKey, JSON.stringify(next));

  void logDiagnosticEvent({
    severity: 'info',
    category: 'ui',
    event: 'user_visible_error_alert',
    message: title,
    context: {
      category: entry.category,
      message,
    },
  });
  if (__DEV__) console.info('[UserMistakeLog]', entry);

  return entry;
}

export async function getUserMistakeLogs(): Promise<UserMistakeLogEntry[]> {
  return readEntries();
}

export async function clearUserMistakeLogs(): Promise<void> {
  await AsyncStorage.removeItem(await getLogStorageKey());
}

export function installUserMistakeAlertLogger(): void {
  if (isAlertLoggerInstalled) return;
  isAlertLoggerInstalled = true;
  originalAlert = Alert.alert;
  (globalThis as typeof globalThis & {
    NuancesUserMistakeLog?: {
      get: typeof getUserMistakeLogs;
      clear: typeof clearUserMistakeLogs;
    };
  }).NuancesUserMistakeLog = {
    get: getUserMistakeLogs,
    clear: clearUserMistakeLogs,
  };

  Alert.alert = ((title: string, message?: string, buttons?: any, options?: any) => {
    const safeTitle = redactSensitiveText(title);
    const safeMessage = redactSensitiveText(message);
    if (shouldLogAlert(safeTitle, safeMessage)) {
      void logUserMistakeEvent({ title: safeTitle, message: safeMessage }).catch((error) => {
        if (__DEV__) console.warn('[UserMistakeLog] failed to persist alert log:', error);
      });
    }
    return originalAlert?.(title, message, buttons, options);
  }) as typeof Alert.alert;
}
