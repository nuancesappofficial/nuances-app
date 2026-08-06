/**
 * 人性化 API 錯誤轉譯對應表 (Error Translation Mapping)
 *
 * 嚴禁在 UI Layer 展示原始 HTTP Status Code (403/429/500/503) 或英文 JSON 報錯。
 * 所有對外錯誤都必須透過此模組轉譯成使用者可讀的標題、說明與 CTA。
 *
 * 本模組為純函式、無副作用，方便單元測試與在各呼叫點（ReviewFlow / CardDetailFlow /
 * Global Error Boundary）共用。
 */

export type ErrorCtaKind =
  | 'open_paywall_lite'
  | 'open_paywall_pro'
  | 'dismiss'
  | 'retry'
  | 'continue_offline';

export type TranslatedError = {
  /** 唯一錯誤分類鍵，供 analytics / 除錯使用。 */
  code: ErrorCode;
  /** 人性化標題（繁體中文）。 */
  title: string;
  /** 人性化說明（繁體中文）。 */
  message: string;
  /** CTA 按鈕文字。 */
  ctaLabel: string;
  /** CTA 行為種類，由呼叫端決定如何執行。 */
  ctaKind: ErrorCtaKind;
  /** 是否為可重試的暫時性錯誤。 */
  retryable: boolean;
};

export type ErrorCode =
  | 'free_starter_exhausted'
  | 'pronunciation_monthly_quota_exceeded'
  | 'ai_monthly_quota_exceeded'
  | 'rate_limit_exceeded'
  | 'service_unavailable'
  | 'azure_tts_error'
  | 'network_offline'
  | 'unknown';

const TRANSLATIONS: Record<ErrorCode, TranslatedError> = {
  free_starter_exhausted: {
    code: 'free_starter_exhausted',
    title: '試用發音額度已完成！',
    message:
      '你已完成 20 次終身發音評分體驗！訂閱 Nuances LITE 即可每月享有 300 次發音評分與智慧建卡。',
    ctaLabel: '訂閱 LITE 繼續練習 >',
    ctaKind: 'open_paywall_lite',
    retryable: false,
  },
  pronunciation_monthly_quota_exceeded: {
    code: 'pronunciation_monthly_quota_exceeded',
    title: '本月發音額度已達上限',
    message:
      '你的 LITE 每月 300 次發音額度已用完。升級至 PRO 方案，立即解鎖每月 1,200 次衝刺用量！',
    ctaLabel: '升級 PRO 衝刺上限 >',
    ctaKind: 'open_paywall_pro',
    retryable: false,
  },
  ai_monthly_quota_exceeded: {
    code: 'ai_monthly_quota_exceeded',
    title: '本月建卡額度已達上限',
    message:
      '你的本月 AI 建卡額度已用完。升級方案即可立即解鎖更多建卡用量！',
    ctaLabel: '查看升級方案 >',
    ctaKind: 'open_paywall_pro',
    retryable: false,
  },
  rate_limit_exceeded: {
    code: 'rate_limit_exceeded',
    title: '動作稍微太快囉！',
    message: 'AI 老師正在仔細聆聽你的發音，請稍候幾秒鐘再試一次。',
    ctaLabel: '我知道了',
    ctaKind: 'dismiss',
    retryable: true,
  },
  service_unavailable: {
    code: 'service_unavailable',
    title: '連線品質暫時不佳',
    message:
      '語音與 AI 服務目前正進行同步或網路波動，請檢查連線狀態後重試。',
    ctaLabel: '重新嘗試',
    ctaKind: 'retry',
    retryable: true,
  },
  azure_tts_error: {
    code: 'azure_tts_error',
    title: '連線品質暫時不佳',
    message:
      '語音與 AI 服務目前正進行同步或網路波動，請檢查連線狀態後重試。',
    ctaLabel: '重新嘗試',
    ctaKind: 'retry',
    retryable: true,
  },
  network_offline: {
    code: 'network_offline',
    title: '目前處於離線狀態',
    message:
      '沒關係！現有的卡片仍可持續進行記憶複習，連線恢復後即可使用 AI 功能。',
    ctaLabel: '繼續離線複習',
    ctaKind: 'continue_offline',
    retryable: false,
  },
  unknown: {
    code: 'unknown',
    title: '發生了一點問題',
    message: '請稍後再試一次。',
    ctaLabel: '我知道了',
    ctaKind: 'dismiss',
    retryable: true,
  },
};

/** 錯誤碼關鍵字 → 對應錯誤分類。 */
const CODE_KEYWORDS: Array<{ code: ErrorCode; keywords: string[] }> = [
  {
    code: 'free_starter_exhausted',
    keywords: [
      'free_starter_exhausted',
      'free starter exhausted',
      'starter_pronunciation_exhausted',
      'starter allowance exhausted',
    ],
  },
  {
    code: 'pronunciation_monthly_quota_exceeded',
    keywords: [
      'pronunciation_monthly_quota_exceeded',
      'pronunciation_month_quota_exceeded',
      'pronunciation_monthly quota exceeded',
      'pronunciation fair-use limit',
    ],
  },
  {
    code: 'ai_monthly_quota_exceeded',
    keywords: [
      'ai_monthly_quota_exceeded',
      'ai_generation_month_quota_exceeded',
      'ai_generation_monthly_quota_exceeded',
      'ai card generation fair-use limit',
      'ai card generation limit',
    ],
  },
  {
    code: 'rate_limit_exceeded',
    keywords: [
      'rate_limit_exceeded',
      'rate limit exceeded',
      'too quickly',
      'too fast',
    ],
  },
  {
    code: 'service_unavailable',
    keywords: [
      'service_unavailable',
      'service unavailable',
      '503',
      '500',
      '502',
      '504',
    ],
  },
  {
    code: 'azure_tts_error',
    keywords: [
      'azure_tts_error',
      'azure tts',
      'tts_proxy',
      'tts-proxy',
      'voice generation failed',
    ],
  },
];

/**
 * 從錯誤物件 / 訊息 / HTTP status 中偵測錯誤分類。
 * 優先比對結構化錯誤碼（reason / code / paywallType），再比對訊息字串。
 */
export function classifyError(
  error: unknown,
  options: { status?: number | null; isOffline?: boolean } = {}
): ErrorCode {
  if (options.isOffline) return 'network_offline';

  const status = options.status ?? extractStatus(error);
  const detail = extractDetail(error).toLowerCase();

  // 結構化錯誤碼優先。
  const structured = extractStructuredCode(error);
  if (structured) {
    const match = CODE_KEYWORDS.find((entry) =>
      entry.keywords.some((keyword) => structured.includes(keyword))
    );
    if (match) return match.code;
  }

  // 依 HTTP status 分類。
  if (status === 429) return 'rate_limit_exceeded';
  if (status === 403) {
    if (detail.includes('free_starter') || detail.includes('starter')) {
      return 'free_starter_exhausted';
    }
    if (
      detail.includes('pronunciation') &&
      (detail.includes('quota') || detail.includes('limit'))
    ) {
      return 'pronunciation_monthly_quota_exceeded';
    }
    if (detail.includes('quota') || detail.includes('limit')) {
      return 'ai_monthly_quota_exceeded';
    }
  }
  if (status === 503 || status === 500 || status === 502 || status === 504) {
    return 'service_unavailable';
  }

  // 依訊息關鍵字分類。
  for (const entry of CODE_KEYWORDS) {
    if (entry.keywords.some((keyword) => detail.includes(keyword))) {
      return entry.code;
    }
  }

  // 逾時 / 網路錯誤。
  if (
    detail.includes('timeout') ||
    detail.includes('timed out') ||
    detail.includes('network request failed') ||
    detail.includes('network error') ||
    detail.includes('failed to fetch')
  ) {
    return 'service_unavailable';
  }

  return 'unknown';
}

export function translateError(
  error: unknown,
  options: { status?: number | null; isOffline?: boolean } = {}
): TranslatedError {
  const code = classifyError(error, options);
  return TRANSLATIONS[code];
}

export function getErrorTranslation(code: ErrorCode): TranslatedError {
  return TRANSLATIONS[code];
}

/**
 * 依發音錯誤碼解析 paywall 的 trigger_source。
 * 供 ReviewFlow / CardDetailFlow 共用，避免重複的三元判斷。
 */
export function resolvePronunciationTriggerSource(
  code: ErrorCode
): 'free_pronunciation_cap' | 'lite_pronunciation_cap' | 'user_initiated' {
  if (code === 'free_starter_exhausted') return 'free_pronunciation_cap';
  if (code === 'pronunciation_monthly_quota_exceeded') return 'lite_pronunciation_cap';
  return 'user_initiated';
}

function extractStatus(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const candidate = error as { status?: unknown; statusCode?: unknown };
    const status = candidate.status ?? candidate.statusCode;
    if (typeof status === 'number') return status;
  }
  const message = extractDetail(error);
  const match = message.match(/\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1]) : null;
}

function extractStructuredCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const candidate = error as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ['code', 'reason', 'errorCode', 'paywallType']) {
    const value = candidate[key];
    if (typeof value === 'string' && value.trim()) parts.push(value.trim());
  }
  return parts.join(' ').toLowerCase();
}

function extractDetail(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    const message = candidate.message;
    if (typeof message === 'string') return message;
    const detail = candidate.detail;
    if (typeof detail === 'string') return detail;
  }
  return String(error ?? '');
}
