import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';

export const CARD_STICKY_NOTES_KEY = 'card_detail_sticky_notes_v1';

async function getCardStickyNotesKey(): Promise<string> {
  const userId = await getCurrentAuthUserId();
  return `${CARD_STICKY_NOTES_KEY}:${userId ?? 'guest'}`;
}

export async function loadCardStickyNotes(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(await getCardStickyNotesKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch (error) {
    console.warn('[CardStickyNotes] load failed:', error);
    return {};
  }
}

export async function saveCardStickyNotes(nextMap: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(await getCardStickyNotesKey(), JSON.stringify(nextMap));
}

export async function upsertCardStickyNote(cardId: string, text: string): Promise<Record<string, string>> {
  const nextText = text.trim();
  const current = await loadCardStickyNotes();
  const nextMap = { ...current };
  if (nextText) {
    nextMap[cardId] = nextText;
  } else {
    delete nextMap[cardId];
  }
  await saveCardStickyNotes(nextMap);
  return nextMap;
}
