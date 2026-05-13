import AsyncStorage from '@react-native-async-storage/async-storage';

export const CARD_STICKY_NOTES_KEY = 'card_detail_sticky_notes_v1';

export async function loadCardStickyNotes(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(CARD_STICKY_NOTES_KEY);
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
  await AsyncStorage.setItem(CARD_STICKY_NOTES_KEY, JSON.stringify(nextMap));
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
