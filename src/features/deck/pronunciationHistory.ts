import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import {
  readStoredRecord,
  recordAssessment,
  type CoachResult,
  type PronunciationAssessment,
  type PronunciationRecord,
} from './pronunciationRecord';

// 每張卡的 Pronunciation Record，只存在本機、每個帳號分開。舊格式在讀取時轉換，
// 所以鍵名不變。
const PRONUNCIATION_HISTORY_KEY = 'card_pronunciation_history_v1';

async function getPronunciationHistoryKey(): Promise<string> {
  const userId = await getCurrentSessionUserId();
  return `${PRONUNCIATION_HISTORY_KEY}:${userId ?? 'guest'}`;
}

// 讀不到或存檔壞掉時丟出錯誤（不是回傳空的），寫入時才不會把其他卡的紀錄蓋掉。
async function readRecordsOrThrow(): Promise<Record<string, PronunciationRecord>> {
  const raw = await AsyncStorage.getItem(await getPronunciationHistoryKey());
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Pronunciation history is not an object');
  }
  const entries = Object.entries(parsed).flatMap(([cardId, value]) => {
    const record = readStoredRecord(value);
    return record ? ([[cardId, record]] as const) : [];
  });
  return Object.fromEntries(entries);
}

export async function loadPronunciationRecords(): Promise<
  Record<string, PronunciationRecord>
> {
  try {
    return await readRecordsOrThrow();
  } catch (error) {
    console.warn('[PronunciationHistory] load failed:', error);
    return {};
  }
}

// 發音教練重新打開卡片時要重畫的上次結果。
export async function loadCoachResults(): Promise<Record<string, CoachResult>> {
  const records = await loadPronunciationRecords();
  return Object.fromEntries(
    Object.entries(records).flatMap(([cardId, record]) =>
      record.coach ? ([[cardId, record.coach]] as const) : []
    )
  );
}

// 一次只跑一個「讀 → 套用規則 → 寫回」，發音教練和測驗同時寫入時不會互相覆蓋。
let writeQueue: Promise<unknown> = Promise.resolve();

export function recordPronunciationAssessment(
  cardId: string,
  assessment: PronunciationAssessment
): Promise<PronunciationRecord | null> {
  const run = writeQueue.then(async () => {
    const current = await readRecordsOrThrow();
    const next = recordAssessment(current[cardId] ?? null, assessment);
    if (!next || next === current[cardId]) return next;
    await AsyncStorage.setItem(
      await getPronunciationHistoryKey(),
      JSON.stringify({ ...current, [cardId]: next })
    );
    return next;
  });
  writeQueue = run.catch(() => undefined);
  return run;
}
