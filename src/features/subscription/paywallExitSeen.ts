import AsyncStorage from '@react-native-async-storage/async-storage';

// 退出畫面每個帳號只出現一次；記在本機，重裝 App 會再出現一次。
const PAYWALL_EXIT_SEEN_STORAGE_PREFIX = 'nuances:paywall_exit_seen:';

function buildPaywallExitSeenKey(userId: string): string {
  return `${PAYWALL_EXIT_SEEN_STORAGE_PREFIX}${userId}`;
}

export async function hasSeenPaywallExitLocally(
  userId: string | null | undefined
): Promise<boolean> {
  if (!userId) return false;
  const value = await AsyncStorage.getItem(buildPaywallExitSeenKey(userId));
  return value === 'true';
}

export async function markPaywallExitSeenLocally(
  userId: string | null | undefined
): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(buildPaywallExitSeenKey(userId), 'true');
}

export async function clearPaywallExitSeenLocally(
  userId: string | null | undefined
): Promise<void> {
  if (!userId) return;
  await AsyncStorage.removeItem(buildPaywallExitSeenKey(userId));
}
