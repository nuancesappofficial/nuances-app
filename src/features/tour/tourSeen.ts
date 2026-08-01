import AsyncStorage from '@react-native-async-storage/async-storage';

const TOUR_SEEN_STORAGE_PREFIX = 'nuances:tour_seen:';

function buildTourSeenKey(userId: string): string {
  return `${TOUR_SEEN_STORAGE_PREFIX}${userId}`;
}

export async function hasSeenTourLocally(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const value = await AsyncStorage.getItem(buildTourSeenKey(userId));
  return value === 'true';
}

export async function markTourSeenLocally(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(buildTourSeenKey(userId), 'true');
}

export async function clearTourSeenLocally(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  await AsyncStorage.removeItem(buildTourSeenKey(userId));
}
