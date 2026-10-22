// 免費發音評分：終身 20 次（同 paywallHero 的 FREE_STARTER_LIMIT；node 測試不能跨檔 import）。
const FREE_PRONUNCIATION_LIMIT = 20;

export type PaywallExitRow =
  | { key: 'review'; tappable: true; count: number }
  | { key: 'cache'; tappable: true }
  | { key: 'pronunciation'; tappable: false; remaining: number | null };

// 退出畫面「免費還能做的事」。卡片數未知就不放複習列；發音用完就不放發音列。
export function buildPaywallExitRows(params: {
  savedCardCount: number | null;
  pronunciationUsed: number | null;
}): PaywallExitRow[] {
  const rows: PaywallExitRow[] = [];
  if (params.savedCardCount != null && params.savedCardCount > 0) {
    rows.push({ key: 'review', tappable: true, count: params.savedCardCount });
  }
  rows.push({ key: 'cache', tappable: true });
  if (params.pronunciationUsed == null) {
    rows.push({ key: 'pronunciation', tappable: false, remaining: null });
  } else {
    const remaining = Math.max(
      0,
      FREE_PRONUNCIATION_LIMIT - params.pronunciationUsed
    );
    if (remaining > 0) {
      rows.push({ key: 'pronunciation', tappable: false, remaining });
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
