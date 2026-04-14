import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';

const CARD_DETAIL_SEEN_KEY_PREFIX = 'deck_card_detail_seen_v1';

function buildStorageKey(userId: string | null): string {
  return `${CARD_DETAIL_SEEN_KEY_PREFIX}:${userId ?? 'guest'}`;
}

export async function loadSeenCardIds(): Promise<Set<string>> {
  try {
    const userId = await getCurrentAuthUserId();
    const raw = await AsyncStorage.getItem(buildStorageKey(userId));
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(
      parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    );
  } catch (error) {
    console.error('[CardDetailSeen] Failed to load seen cards:', error);
    return new Set<string>();
  }
}

export async function markCardAsSeen(cardId: string): Promise<void> {
  const trimmedId = cardId.trim();
  if (!trimmedId) return;

  try {
    const userId = await getCurrentAuthUserId();
    const storageKey = buildStorageKey(userId);
    const existing = await loadSeenCardIds();
    if (existing.has(trimmedId)) return;
    existing.add(trimmedId);
    await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(existing)));
  } catch (error) {
    console.error('[CardDetailSeen] Failed to mark card as seen:', error);
  }
}
