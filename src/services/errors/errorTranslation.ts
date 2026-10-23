/**
 * 人性化 API 錯誤轉譯對應表 (Error Translation Mapping)
 *
 * 嚴禁在 UI Layer 展示原始 HTTP Status Code (403/429/500/503) 或英文 JSON 報錯。
 * 所有對外錯誤都必須透過此模組轉譯成使用者可讀的標題、說明與 CTA。
 *
 * 誠實原則：訊息必須說出真正的原因。
 * - 伺服器回傳的 `reason` 是第一判斷依據（額度用完 → 直接說額度用完並開 paywall）。
 * - 只有裝置本身連不上（離線 / fetch 失敗 / 用戶端逾時）才可以提「網路」。
 * - 伺服器端失敗（5xx、額度查詢失敗、語音服務出錯）要明說是 Nuances 這邊的問題。
 *
 * 文案目前只有繁體中文（與既有錯誤文案一致，尚未接 i18n）。
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
  | 'free_starter_cards_exhausted'
  | 'premium_required'
  | 'starter_allowance_unavailable'
  | 'pronunciation_quota_unavailable'
  | 'pronunciation_monthly_quota_exceeded'
  | 'pronunciation_quota_reached_top'
  | 'ai_monthly_quota_exceeded'
  | 'rate_limit_exceeded'
  | 'service_unavailable'
  | 'azure_tts_error'
  | 'recording_rejected'
  | 'recording_invalid'
  | 'auth_required'
  | 'network_error'
  | 'request_timeout'
  | 'network_offline'
  | 'unknown';

const SERVER_SIDE_SUFFIX = '這是 Nuances 這邊的問題，不是你的網路。請稍後再試一次。';

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
  free_starter_cards_exhausted: {
    code: 'free_starter_cards_exhausted',
    title: '免費建卡額度已用完',
    message: '你已用完免費的 AI 建卡體驗。訂閱 Nuances LITE 即可每月繼續智慧建卡與發音評分。',
    ctaLabel: '訂閱 LITE 繼續建卡 >',
    ctaKind: 'open_paywall_lite',
    retryable: false,
  },
  premium_required: {
    code: 'premium_required',
    title: '這個功能需要訂閱',
    message: '訂閱 Nuances LITE 或 PRO 方案後即可使用這個功能。',
    ctaLabel: '查看訂閱方案 >',
    ctaKind: 'open_paywall_lite',
    retryable: false,
  },
  starter_allowance_unavailable: {
    code: 'starter_allowance_unavailable',
    title: 'Nuances 暫時出錯',
    message: `我們暫時無法確認你的免費體驗額度。${SERVER_SIDE_SUFFIX}`,
    ctaLabel: '再試一次',
    ctaKind: 'retry',
    retryable: true,
  },
  pronunciation_quota_unavailable: {
    code: 'pronunciation_quota_unavailable',
    title: 'Nuances 暫時出錯',
    message: `我們暫時無法確認你的發音評分額度。${SERVER_SIDE_SUFFIX}`,
    ctaLabel: '再試一次',
    ctaKind: 'retry',
    retryable: true,
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
  pronunciation_quota_reached_top: {
    code: 'pronunciation_quota_reached_top',
    title: '本月發音額度已用完',
    message: '你本月的發音評分額度已用完，下個月會自動重置。這段期間仍可正常建卡與複習。',
    ctaLabel: '我知道了',
    ctaKind: 'dismiss',
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
    title: 'Nuances 暫時出錯',
    message: `我們的服務暫時出了點問題。${SERVER_SIDE_SUFFIX}`,
    ctaLabel: '再試一次',
    ctaKind: 'retry',
    retryable: true,
  },
  azure_tts_error: {
    code: 'azure_tts_error',
    title: 'Nuances 語音服務暫時出錯',
    message: `語音服務暫時出了點問題。${SERVER_SIDE_SUFFIX}`,
    ctaLabel: '再試一次',
    ctaKind: 'retry',
    retryable: true,
  },
  recording_rejected: {
    code: 'recording_rejected',
    title: '這段錄音無法評分',
    message: '語音服務無法辨識這段錄音。請靠近麥克風、清楚唸出內容後再錄一次。',
    ctaLabel: '我知道了',
    ctaKind: 'dismiss',
    retryable: true,
  },
  recording_invalid: {
    code: 'recording_invalid',
    title: '錄音有點問題',
    // 實際訊息由 translateError 帶入原始錯誤（例如「錄音太短…」）。
    message: '請重新錄音後再試一次。',
    ctaLabel: '我知道了',
    ctaKind: 'dismiss',
    retryable: true,
  },
  auth_required: {
    code: 'auth_required',
    title: '請重新登入',
    message: '你的登入狀態已過期，請重新登入後再試一次。',
    ctaLabel: '我知道了',
    ctaKind: 'dismiss',
    retryable: false,
  },
  network_error: {
    code: 'network_error',
    title: '無法連上網路',
    message: '你的裝置目前連不上 Nuances，請檢查 Wi-Fi 或行動網路後再試一次。',
    ctaLabel: '再試一次',
    ctaKind: 'retry',
    retryable: true,
  },
  request_timeout: {
    code: 'request_timeout',
    title: '等太久沒有回應',
    message: '這次等了太久都沒收到結果，可能是網路較慢，也可能是我們的服務正忙。請再試一次。',
    ctaLabel: '再試一次',
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

type ClassifyOptions = { status?: number | null; isOffline?: boolean };

type StructuredInfo = {
  name: string;
  status: number | null;
  reason: string;
  paywallType: string;
  planType: string;
  clientFailure: string;
};

/** 已知的伺服器端失敗 reason（不是使用者的網路，也不是使用者的額度）。 */
const SERVER_SIDE_REASONS = new Set([
  'service_unavailable',
  'rate_limit_store_unavailable',
  'usage_store_unavailable',
  'task_store_unavailable',
  'demo_pronunciation_unavailable',
  'ai_proxy_request_failed',
  'ai_quota_exceeded', // 我們的 AI 供應商額度，不是使用者額度
  'ai_high_demand',
  'ai_temporarily_unavailable',
  'ai_generation_failed',
  'legacy_mode_disabled',
]);

/** 把伺服器的 reason（或錯誤碼）對應到錯誤分類；不認得則回傳 null。 */
function classifyReason(info: StructuredInfo): ErrorCode | null {
  const reason = info.reason;
  if (!reason) return null;

  if (reason === 'premium_required') {
    if (info.paywallType === 'pronunciation') return 'free_starter_exhausted';
    if (info.paywallType === 'ai_generate') return 'free_starter_cards_exhausted';
    return 'premium_required';
  }
  if (
    reason === 'free_starter_exhausted' ||
    reason === 'starter_pronunciation_exhausted'
  ) {
    return 'free_starter_exhausted';
  }
  if (/^pronunciation_(monthly|month|week|daily)_quota_exceeded$/.test(reason)) {
    return info.planType === 'premium'
      ? 'pronunciation_quota_reached_top'
      : 'pronunciation_monthly_quota_exceeded';
  }
  if (
    reason === 'ai_monthly_quota_exceeded' ||
    /^ai_generation_(monthly|month|week|daily)_quota_exceeded$/.test(reason)
  ) {
    return 'ai_monthly_quota_exceeded';
  }
  if (reason === 'rate_limit_exceeded') return 'rate_limit_exceeded';
  if (reason === 'recording_invalid') return 'recording_invalid';
  if (reason === 'starter_allowance_unavailable') return 'starter_allowance_unavailable';
  if (reason === 'pronunciation_quota_unavailable') return 'pronunciation_quota_unavailable';
  if (reason === 'azure_pronunciation_failed') {
    return info.status !== null && info.status < 500 ? 'recording_rejected' : 'azure_tts_error';
  }
  if (reason === 'azure_tts_error' || reason === 'tts_proxy_failed') return 'azure_tts_error';
  if (SERVER_SIDE_REASONS.has(reason)) return 'service_unavailable';
  // 依賴服務斷路器（例如 azure-speech_unavailable）或其他 *_unavailable / *_failed。
  if (/_unavailable$|_failed$/.test(reason)) return 'service_unavailable';
  return null;
}

/** 舊格式訊息中可辨識的 reason 字樣（訊息格式：`... (503): <reason>: requestId=...`）。 */
const MESSAGE_REASON_TOKENS = [
  'starter_allowance_unavailable',
  'pronunciation_quota_unavailable',
  'pronunciation_monthly_quota_exceeded',
  'pronunciation_month_quota_exceeded',
  'pronunciation_week_quota_exceeded',
  'pronunciation_daily_quota_exceeded',
  'ai_generation_month_quota_exceeded',
  'ai_generation_monthly_quota_exceeded',
  'ai_generation_week_quota_exceeded',
  'ai_generation_daily_quota_exceeded',
  'ai_monthly_quota_exceeded',
  'free_starter_exhausted',
  'starter_pronunciation_exhausted',
  'rate_limit_exceeded',
  'azure_pronunciation_failed',
  'azure_tts_error',
  ...SERVER_SIDE_REASONS,
];

/** 舊格式英文訊息（edgeAiClient userFacingQuotaError 等）→ 分類。 */
const MESSAGE_KEYWORDS: Array<{ code: ErrorCode; keywords: string[] }> = [
  {
    code: 'starter_allowance_unavailable',
    keywords: ['starter allowance is temporarily unavailable'],
  },
  {
    code: 'pronunciation_quota_unavailable',
    keywords: ['pronunciation quota check failed'],
  },
  {
    code: 'free_starter_exhausted',
    keywords: [
      'free starter exhausted',
      'starter allowance exhausted',
      'free starter pronunciations used',
    ],
  },
  {
    code: 'free_starter_cards_exhausted',
    keywords: ['free starter cards used'],
  },
  {
    code: 'pronunciation_monthly_quota_exceeded',
    keywords: [
      'pronunciation_monthly quota exceeded',
      'monthly pronunciation quota exceeded',
      'pronunciation fair-use limit',
      'pronunciation scoring fair-use limit',
      'pronunciation check limit',
    ],
  },
  {
    code: 'ai_monthly_quota_exceeded',
    keywords: [
      'ai card generation fair-use limit',
      'ai card generation limit',
    ],
  },
  {
    code: 'rate_limit_exceeded',
    keywords: ['rate limit exceeded', 'too quickly', 'too fast'],
  },
  {
    code: 'service_unavailable',
    keywords: ['service unavailable', 'service temporarily unavailable'],
  },
  {
    code: 'azure_tts_error',
    keywords: ['azure tts', 'tts_proxy', 'tts-proxy', 'voice generation failed'],
  },
];

/**
 * 從錯誤物件 / 訊息 / HTTP status 中偵測錯誤分類。
 * 順序：離線 → 裝置端失敗 → 伺服器 reason → 錯誤類別 → HTTP status → 訊息字樣。
 */
export function classifyError(
  error: unknown,
  options: ClassifyOptions = {}
): ErrorCode {
  if (options.isOffline) return 'network_offline';

  const info = extractStructured(error, options);
  const detail = extractDetail(error).toLowerCase();

  // 1. 裝置端失敗（伺服器根本沒回應）。
  if (info.clientFailure === 'network') return 'network_error';
  if (info.clientFailure === 'timeout') return 'request_timeout';

  // 2. 伺服器明確說明的 reason 優先於 status。
  const fromReason = classifyReason(info);
  if (fromReason) return fromReason;

  // 3. 錯誤類別。
  if (info.name === 'aiautherror') return 'auth_required';
  if (info.name === 'premiumfeatureerror') return 'premium_required';

  // 4. 舊格式訊息內嵌的 reason 字樣。
  const token = MESSAGE_REASON_TOKENS.find((candidate) => detail.includes(candidate));
  if (token) {
    const code = classifyReason({ ...info, reason: token });
    if (code) return code;
  }

  // 5. 依 HTTP status 分類（沒有 reason 時）。
  const status = info.status;
  if (status === 401) return 'auth_required';
  if (status === 429) {
    const keywordCode = classifyByKeywords(detail);
    return keywordCode && keywordCode !== 'service_unavailable'
      ? keywordCode
      : 'rate_limit_exceeded';
  }
  if (status === 403) {
    const keywordCode = classifyByKeywords(detail);
    if (keywordCode) return keywordCode;
    if (detail.includes('premium')) return 'premium_required';
  }
  if (status !== null && status >= 500 && status <= 599) {
    return 'service_unavailable';
  }

  // 6. 訊息字樣。
  const keywordCode = classifyByKeywords(detail);
  if (keywordCode) return keywordCode;

  if (
    detail.includes('network request failed') ||
    detail.includes('network error') ||
    detail.includes('failed to fetch') ||
    detail.includes('the internet connection appears to be offline')
  ) {
    return 'network_error';
  }
  if (
    detail.includes('timeout') ||
    detail.includes('timed out') ||
    detail.includes('逾時')
  ) {
    return 'request_timeout';
  }
  if (detail.includes('authentication required') || detail.includes('請先登入')) {
    return 'auth_required';
  }
  if (detail.includes('錄音')) return 'recording_invalid';

  return 'unknown';
}

export function translateError(
  error: unknown,
  options: ClassifyOptions = {}
): TranslatedError {
  const code = classifyError(error, options);
  const translated = TRANSLATIONS[code];
  if (code === 'recording_invalid') {
    const message = extractMessage(error);
    if (message) return { ...translated, message };
  }
  return translated;
}

/**
 * 錄音本身的問題（太短、遺失、格式錯）。訊息會原樣顯示給使用者，
 * 所以請傳入已在地化的文字。
 */
export function createRecordingError(message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = 'recording_invalid';
  return error;
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

function classifyByKeywords(detail: string): ErrorCode | null {
  for (const entry of MESSAGE_KEYWORDS) {
    if (entry.keywords.some((keyword) => detail.includes(keyword))) {
      return entry.code;
    }
  }
  return null;
}

function readLowerString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function extractStructured(error: unknown, options: ClassifyOptions): StructuredInfo {
  const candidate =
    error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const reason =
    readLowerString(candidate.reason) ||
    readLowerString(candidate.code) ||
    readLowerString(candidate.errorCode);
  return {
    name: readLowerString(candidate.name),
    status: options.status ?? extractStatus(error),
    reason,
    paywallType: readLowerString(candidate.paywallType),
    planType: readLowerString(candidate.planType),
    clientFailure: readLowerString(candidate.clientFailure),
  };
}

/**
 * 只認結構化的 status，或訊息中明確的 `(503)` / `status: 503` 寫法，
 * 避免 requestId、毫秒數等文字裡的數字被誤判成 5xx。
 */
function extractStatus(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const candidate = error as { status?: unknown; statusCode?: unknown };
    const status = candidate.status ?? candidate.statusCode;
    if (typeof status === 'number') return status;
  }
  const message = extractDetail(error);
  const match =
    message.match(/\((4\d\d|5\d\d)\)/) ||
    message.match(/status(?:\s*code)?\s*[:=]\s*(4\d\d|5\d\d)\b/i);
  return match ? Number(match[1]) : null;
}

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) return error.message.trim();
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') return message.trim();
  }
  return '';
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
