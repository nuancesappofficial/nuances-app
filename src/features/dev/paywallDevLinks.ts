// paywall-21 連結的 pron 參數：示範卡的發音紀錄情境。
export type DevSamplePronunciation = 'improved' | 'flat' | 'none';

export type PaywallDevLink =
  | {
      kind: 'paywall-21';
      word: string;
      sourceLabel: string;
      cardKind: 'word' | 'shot';
      pronunciation: DevSamplePronunciation;
    }
  | {
      kind: 'settings';
      cardsUsed: number;
      pronunciationUsed: number;
    }
  | { kind: 'reset' };

const DEV_PAYWALL_ROUTE =
  /:\/\/dev\/(paywall-reset|paywall-21|paywall)\/?(?=$|[?#])/;

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
  if (route === 'paywall-reset') return { kind: 'reset' };
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

// 只給 __DEV__ 的 paywall-21 連結用：帳號沒有任何卡時，成果動畫改用這 20 張示範卡。
// 正式流程只用使用者真實的卡片。
const DEV_SAMPLE_INTRO_CARDS: Array<[word: string, sourceLabel: string]> = [
  ['ghosting', 'Netflix'],
  ['delulu', 'TikTok'],
  ['gaslight', 'Podcast'],
  ['vibe check', 'YouTube'],
  ['lowkey', 'Netflix'],
  ['no cap', 'TikTok'],
  ['main character', 'YouTube'],
  ['touch grass', 'Reddit'],
  ['salty', 'Netflix'],
  ['the ick', 'Podcast'],
  ['beige flag', 'TikTok'],
  ['gatekeep', 'YouTube'],
  ['soft launch', 'Instagram'],
  ['doomscroll', 'Podcast'],
  ['quiet quitting', 'Share Sheet'],
  ['rent-free', 'Netflix'],
  ['understood the assignment', 'YouTube'],
  ['hard pass', 'Netflix'],
  ['red flag', 'TikTok'],
  ['slay', 'Instagram'],
];

export function buildDevSampleIntroCards(
  now: number
): Array<{ id: string; word: string; sourceLabel: string; createdAt: number }> {
  const dayMs = 24 * 60 * 60 * 1000;
  return DEV_SAMPLE_INTRO_CARDS.map(([word, sourceLabel], index) => ({
    id: `dev-sample-${index}`,
    word,
    sourceLabel,
    createdAt: now - (DEV_SAMPLE_INTRO_CARDS.length - index) * dayMs,
  }));
}

// 只給 __DEV__ 的 paywall-21 連結用：示範卡的發音紀錄（pron=improved|flat|none）。
// improved／flat 都是 8 張練過 ≥2 次的卡，分數來自 v13 原型；另外 2 張只練過 1 次。
const DEV_SAMPLE_PRONUNCIATION: Record<
  'improved' | 'flat',
  { first: number[]; best: number[] }
> = {
  improved: {
    first: [58, 62, 55, 66, 60, 70, 64, 52],
    best: [84, 80, 79, 88, 81, 90, 85, 77],
  },
  flat: {
    first: [80, 78, 81, 77, 80, 79, 79, 78],
    best: [83, 79, 84, 78, 82, 80, 81, 81],
  },
};

export function buildDevSamplePronunciationRecords(
  mode: DevSamplePronunciation,
  cards: readonly { id: string; createdAt: number }[]
): Record<
  string,
  {
    firstScore: number | null;
    latestScore: number;
    bestScore: number;
    attempts: number;
    updatedAt: string;
  }
> {
  if (mode === 'none') return {};
  const { first, best } = DEV_SAMPLE_PRONUNCIATION[mode];
  const records: ReturnType<typeof buildDevSamplePronunciationRecords> = {};
  cards.slice(0, first.length + 2).forEach((card, index) => {
    const updatedAt = new Date(card.createdAt).toISOString();
    if (index < first.length) {
      records[card.id] = {
        firstScore: first[index],
        latestScore: best[index],
        bestScore: best[index],
        attempts: 2 + (index % 3),
        updatedAt,
      };
      return;
    }
    records[card.id] = {
      firstScore: 74,
      latestScore: 74,
      bestScore: 74,
      attempts: 1,
      updatedAt,
    };
  });
  return records;
}
