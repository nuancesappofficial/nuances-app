// 免費發音評分：終身 20 次（同 paywallHero 的 FREE_STARTER_LIMIT；node 測試不能跨檔 import）。
const FREE_PRONUNCIATION_LIMIT = 20;

// 退出畫面「免費還能做的事」，都是純文字，不能點。
export type PaywallExitRow =
  | { key: 'review'; count: number }
  | { key: 'cache' }
  | { key: 'pronunciation'; remaining: number | null };

// 卡片數未知就不放複習列；發音用完就不放發音列。
export function buildPaywallExitRows(params: {
  savedCardCount: number | null;
  pronunciationUsed: number | null;
}): PaywallExitRow[] {
  const rows: PaywallExitRow[] = [];
  if (params.savedCardCount != null && params.savedCardCount > 0) {
    rows.push({ key: 'review', count: params.savedCardCount });
  }
  rows.push({ key: 'cache' });
  if (params.pronunciationUsed == null) {
    rows.push({ key: 'pronunciation', remaining: null });
  } else {
    const remaining = Math.max(
      0,
      FREE_PRONUNCIATION_LIMIT - params.pronunciationUsed
    );
    if (remaining > 0) {
      rows.push({ key: 'pronunciation', remaining });
    }
  }
  return rows;
}

// 退出畫面：只在第 21 張卡的 paywall 被拒絕時出現，每個帳號只出現第一次。
export function shouldShowPaywallExit(params: {
  heroKind: 'plan' | 'next' | 'covered' | null;
  alreadySeen: boolean;
}): boolean {
  return params.heroKind === 'next' && !params.alreadySeen;
}
