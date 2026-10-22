// 免費入門額度：建卡、發音評分各 20 次（終身，不重置）。
// 與 supabase/functions/ai-proxy/_shared/freeStarterAllowance.ts 保持一致。
export const FREE_STARTER_LIMIT = 20;

export type StarterUsage = {
  cardsUsed: number;
  pronunciationUsed: number;
};

// 入門額度用完時，使用者正要建的那張卡（第 21 張）。
export type PendingPaywallCard = {
  word: string;
  sourceLabel: string;
};

export type PaywallHero =
  | { kind: 'plan'; tier: 'lite' | 'pro' }
  | { kind: 'next'; word: string; sourceLabel: string }
  | {
      kind: 'covered';
      usage: {
        cardsUsed: number;
        pronunciationUsed: number;
        limit: number;
        cardsLeft: number;
        progress: number;
      } | null;
    };

const clampToAllowance = (value: number) =>
  Math.min(FREE_STARTER_LIMIT, Math.max(0, Math.floor(value)));

// __DEV__ deep link 帶的已用次數逐欄覆蓋後端讀到的值；缺任一欄就當作沒有資料。
export function mergeDevStarterUsage(
  fetched: StarterUsage | null,
  devOverride: Partial<StarterUsage> | undefined
): StarterUsage | null {
  const cardsUsed = devOverride?.cardsUsed ?? fetched?.cardsUsed;
  const pronunciationUsed =
    devOverride?.pronunciationUsed ?? fetched?.pronunciationUsed;
  if (cardsUsed === undefined || pronunciationUsed === undefined) return null;
  return { cardsUsed, pronunciationUsed };
}

// 把「下一個：{word}」這類模板拆成字前、字後，讓畫面可以單獨幫字上色。
export function splitTemplateAroundToken(
  template: string,
  token: string
): { before: string; after: string } {
  const index = template.indexOf(token);
  if (index < 0) return { before: template, after: '' };
  return {
    before: template.slice(0, index),
    after: template.slice(index + token.length),
  };
}

// paywall_viewed 的 entry：使用者自己打開 → settings；任何額度用完 → limit。
export function resolvePaywallEntry(
  triggerSource: string
): 'settings' | 'limit' {
  return triggerSource === 'user_initiated' ? 'settings' : 'limit';
}

export function resolvePaywallHero(params: {
  planType: 'free' | 'trial' | 'lite' | 'premium';
  starterUsage: StarterUsage | null;
  pendingCard?: PendingPaywallCard;
}): PaywallHero {
  if (params.planType !== 'free') {
    return { kind: 'plan', tier: params.planType === 'lite' ? 'lite' : 'pro' };
  }
  if (params.pendingCard) {
    return { kind: 'next', ...params.pendingCard };
  }
  if (!params.starterUsage) return { kind: 'covered', usage: null };
  const cardsUsed = clampToAllowance(params.starterUsage.cardsUsed);
  const pronunciationUsed = clampToAllowance(
    params.starterUsage.pronunciationUsed
  );
  return {
    kind: 'covered',
    usage: {
      cardsUsed,
      pronunciationUsed,
      limit: FREE_STARTER_LIMIT,
      cardsLeft: FREE_STARTER_LIMIT - cardsUsed,
      progress: cardsUsed / FREE_STARTER_LIMIT,
    },
  };
}
