export type PaywallDevLink =
  | {
      kind: 'paywall-21';
      word: string;
      sourceLabel: string;
      cardKind: 'word' | 'shot';
      pronunciation: 'improved' | 'flat' | 'none';
    }
  | {
      kind: 'settings';
      cardsUsed: number;
      pronunciationUsed: number;
    };

const DEV_PAYWALL_ROUTE = /:\/\/dev\/(paywall-21|paywall)\/?(?=$|[?#])/;

function parseQuery(url: string): Map<string, string> {
  const query = new Map<string, string>();
  const queryStart = url.indexOf('?');
  if (queryStart < 0) return query;
  const fragmentStart = url.indexOf('#', queryStart);
  const rawQuery = url.slice(
    queryStart + 1,
    fragmentStart < 0 ? url.length : fragmentStart
  );
  const decode = (value: string) => {
    const spaced = value.replace(/\+/g, ' ');
    try {
      return decodeURIComponent(spaced);
    } catch {
      return spaced;
    }
  };
  for (const pair of rawQuery.split('&')) {
    if (!pair) continue;
    const separator = pair.indexOf('=');
    const rawKey = separator < 0 ? pair : pair.slice(0, separator);
    const rawValue = separator < 0 ? '' : pair.slice(separator + 1);
    query.set(decode(rawKey), decode(rawValue));
  }
  return query;
}

// 免費入門額度：建卡、發音評分各 20 次（同 subscription/paywallHero 的 FREE_STARTER_LIMIT；
// node 測試不能跨檔 import，所以各自保留）。
const FREE_STARTER_LIMIT = 20;

function parseUsedCount(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed)) return fallback;
  return Math.min(FREE_STARTER_LIMIT, Math.max(0, Math.trunc(parsed)));
}

export function parsePaywallDevLink(url: string): PaywallDevLink | null {
  const route = DEV_PAYWALL_ROUTE.exec(url)?.[1];
  if (!route) return null;
  const query = parseQuery(url);
  if (route === 'paywall') {
    return {
      kind: 'settings',
      cardsUsed: parseUsedCount(query.get('cards'), 12),
      pronunciationUsed: parseUsedCount(query.get('pron'), 8),
    };
  }
  const kind = query.get('kind');
  const pron = query.get('pron');
  return {
    kind: 'paywall-21',
    word: query.get('word')?.trim() || 'situationship',
    sourceLabel: query.get('source')?.trim() || 'Netflix',
    cardKind: kind === 'shot' ? 'shot' : 'word',
    pronunciation: pron === 'flat' || pron === 'none' ? pron : 'improved',
  };
}
