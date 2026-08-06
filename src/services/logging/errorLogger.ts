import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { logDiagnosticEvent, type DiagnosticCategory } from './diagnosticsLog';

/**
 * MODULE 2: Enriched diagnostic logging without PII.
 *
 * 提供 Global Logger 的 `error()` 方法，在 API / Azure 發音例外時靜默附加診斷上下文：
 *   - user_context:    { tier, monthly_pronunciation_used }
 *   - device_context:  { app_version, os_version, device_model, network_type, is_low_power_mode }
 *   - request_context: { trace_id, endpoint, duration_ms }
 *   - audio_context:   { audio_route }
 *
 * 安全原則：只收集匿名 UUID（distinct_id / user_id），絕不記錄姓名、email、GPS、
 * 未加密音訊緩衝區或明文卡片內容。所有 context 都會再經過 diagnosticsLog 的
 * sanitizeValue / redactString 二次淨化。
 */

export type ErrorUserContext = {
  /** 訂閱層級：free | lite | pro（premium 對應 pro）。 */
  tier?: 'free' | 'lite' | 'pro';
  /** 本月已使用的發音額度次數。 */
  monthly_pronunciation_used?: number;
};

export type ErrorRequestContext = {
  /** 追蹤 ID（edge function 的 request id）。 */
  trace_id?: string;
  /** 觸發錯誤的 API endpoint 名稱。 */
  endpoint?: string;
  /** 請求耗時（毫秒）。 */
  duration_ms?: number;
};

export type ErrorAudioContext = {
  /** 音訊路由（例如 'speaker' | 'earpiece' | 'bluetooth' | 'unknown'）。 */
  audio_route?: string;
};

export type ErrorDiagnosticContext = {
  user_context?: ErrorUserContext;
  request_context?: ErrorRequestContext;
  audio_context?: ErrorAudioContext;
};

type ErrorLoggerOptions = {
  category?: DiagnosticCategory;
  event: string;
  message?: unknown;
  context?: ErrorDiagnosticContext;
  requestId?: string;
  userId?: string | null;
};

let cachedNetworkType: 'wifi' | 'cellular' | 'offline' | 'unknown' | null = null;
let networkTypeResolved = false;

async function resolveNetworkType(): Promise<'wifi' | 'cellular' | 'offline' | 'unknown'> {
  if (networkTypeResolved && cachedNetworkType) return cachedNetworkType;
  try {
    const state = await NetInfo.fetch();
    let next: 'wifi' | 'cellular' | 'offline' | 'unknown';
    if (!state.isConnected) {
      next = 'offline';
    } else if (state.type === 'wifi') {
      next = 'wifi';
    } else if (state.type === 'cellular') {
      next = 'cellular';
    } else {
      next = 'unknown';
    }
    cachedNetworkType = next;
    networkTypeResolved = true;
    return next;
  } catch {
    return 'unknown';
  }
}

async function resolveLowPowerMode(): Promise<boolean | undefined> {
  try {
    return await Battery.isLowPowerModeEnabledAsync();
  } catch {
    return undefined;
  }
}

function resolveDeviceModel(): string | undefined {
  const model = Device.modelName?.trim();
  if (model) return model;
  // Fallback：某些平台（web / 模擬器）可能沒有 modelName。
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : undefined;
}

/**
 * 記錄一個帶完整診斷上下文的錯誤事件（無 PII）。
 * 這是 Global Logger 的 `error()` 方法，供 API / Azure 發音例外呼叫。
 */
export async function logErrorWithDiagnostics(options: ErrorLoggerOptions): Promise<void> {
  const { category = 'unknown', event, message, context, requestId, userId } = options;

  const [networkType, lowPowerMode] = await Promise.all([
    resolveNetworkType(),
    resolveLowPowerMode(),
  ]);

  const deviceContext = {
    app_version: `${Platform.OS}-${Platform.Version ?? 'unknown'}`,
    os_version: Platform.Version == null ? undefined : String(Platform.Version),
    device_model: resolveDeviceModel(),
    network_type: networkType,
    is_low_power_mode: lowPowerMode,
  };

  const enrichedContext = {
    ...(context?.user_context ? { user_context: context.user_context } : {}),
    device_context: deviceContext,
    ...(context?.request_context ? { request_context: context.request_context } : {}),
    ...(context?.audio_context ? { audio_context: context.audio_context } : {}),
  };

  await logDiagnosticEvent({
    severity: 'error',
    category,
    event,
    message,
    context: enrichedContext,
    requestId,
    userId,
  });
}

/**
 * 同步版：不等待 device/network 解析，立即記錄（用快取或 unknown）。
 * 適用於不阻塞呼叫路徑的場景。
 */
export function logErrorWithDiagnosticsSync(options: ErrorLoggerOptions): void {
  const { category = 'unknown', event, message, context, requestId, userId } = options;

  const deviceContext = {
    app_version: `${Platform.OS}-${Platform.Version ?? 'unknown'}`,
    os_version: Platform.Version == null ? undefined : String(Platform.Version),
    device_model: resolveDeviceModel(),
    network_type: cachedNetworkType ?? 'unknown',
    is_low_power_mode: undefined,
  };

  const enrichedContext = {
    ...(context?.user_context ? { user_context: context.user_context } : {}),
    device_context: deviceContext,
    ...(context?.request_context ? { request_context: context.request_context } : {}),
    ...(context?.audio_context ? { audio_context: context.audio_context } : {}),
  };

  void logDiagnosticEvent({
    severity: 'error',
    category,
    event,
    message,
    context: enrichedContext,
    requestId,
    userId,
  });
}
