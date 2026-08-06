/**
 * 人性化錯誤 UI 呈現 helper
 *
 * 統一用 Alert 呈現「錯誤轉譯對應表」的人性化標題/說明/CTA，並處理：
 * - paywall CTA（開啟 LITE / PRO paywall）
 * - rate_limit 的倒數 3 秒防呆（由呼叫端在重試前檢查 cooldown）
 * - retry / dismiss / continue_offline
 *
 * 呼叫端注入 CTA 執行器（例如 openMembershipPaywall、retry callback），
 * 本 helper 不直接依賴 navigation，保持可測試性。
 */
import { Alert } from 'react-native';
import {
  classifyError,
  translateError,
  type ErrorCtaKind,
  type TranslatedError,
} from './errorTranslation';

export type ErrorCtaHandlers = {
  /** 開啟 paywall。tier 為 'lite' | 'pro'。 */
  openPaywall?: (tier: 'lite' | 'pro') => void;
  /** 重新嘗試。 */
  retry?: () => void;
  /** 繼續離線複習。 */
  continueOffline?: () => void;
};

export const RATE_LIMIT_COOLDOWN_SECONDS = 3;

let rateLimitCooldownUntil = 0;

/**
 * 呈現人性化錯誤 Alert。回傳轉譯結果。
 */
export function showTranslatedError(
  error: unknown,
  handlers: ErrorCtaHandlers = {},
  options: { status?: number | null; isOffline?: boolean } = {}
): TranslatedError {
  const translated = translateError(error, options);
  const buttons = buildButtons(translated, handlers);
  Alert.alert(translated.title, translated.message, buttons);
  return translated;
}

/**
 * 取得錯誤分類（不呈現 UI），供呼叫端決定是否要顯示 paywall 等。
 */
export function getErrorCode(
  error: unknown,
  options: { status?: number | null; isOffline?: boolean } = {}
) {
  return classifyError(error, options);
}

/**
 * rate_limit 倒數防呆：在 cooldown 期間內回傳 true，呼叫端應阻止重試。
 */
export function isRateLimitCooldownActive(now = Date.now()): boolean {
  return now < rateLimitCooldownUntil;
}

/**
 * 觸發 rate_limit cooldown（在收到 rate_limit 錯誤時呼叫）。
 */
export function armRateLimitCooldown(now = Date.now()): void {
  rateLimitCooldownUntil = now + RATE_LIMIT_COOLDOWN_SECONDS * 1000;
}

function buildButtons(
  translated: TranslatedError,
  handlers: ErrorCtaHandlers
): Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> {
  switch (translated.ctaKind) {
    case 'open_paywall_lite':
      return [
        { text: '取消', style: 'cancel' },
        {
          text: translated.ctaLabel,
          onPress: () => handlers.openPaywall?.('lite'),
        },
      ];
    case 'open_paywall_pro':
      return [
        { text: '取消', style: 'cancel' },
        {
          text: translated.ctaLabel,
          onPress: () => handlers.openPaywall?.('pro'),
        },
      ];
    case 'retry':
      return [
        { text: '取消', style: 'cancel' },
        {
          text: translated.ctaLabel,
          onPress: () => handlers.retry?.(),
        },
      ];
    case 'continue_offline':
      return [
        {
          text: translated.ctaLabel,
          onPress: () => handlers.continueOffline?.(),
        },
      ];
    case 'dismiss':
    default:
      if (translated.code === 'rate_limit_exceeded') {
        armRateLimitCooldown();
      }
      return [{ text: translated.ctaLabel }];
  }
}

export type { ErrorCtaKind };
