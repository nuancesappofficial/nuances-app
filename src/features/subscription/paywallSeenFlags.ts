import AsyncStorage from '@react-native-async-storage/async-storage';

// 第 21 張卡 paywall 的一次性畫面（成果動畫、退出畫面）：每個帳號只出現一次。
// 記在本機，重裝 App 會再出現一次。
const PAYWALL_EXIT_SEEN_STORAGE_PREFIX = 'nuances:paywall_exit_seen:';
const RESULTS_INTRO_SEEN_STORAGE_PREFIX = 'nuances:paywall_results_intro_seen:';

async function hasFlag(prefix: string, userId: string | null | undefined) {
  if (!userId) return false;
  return (await AsyncStorage.getItem(`${prefix}${userId}`)) === 'true';
}

async function setFlag(prefix: string, userId: string | null | undefined) {
  if (!userId) return;
  await AsyncStorage.setItem(`${prefix}${userId}`, 'true');
}

export function hasSeenPaywallExitLocally(
  userId: string | null | undefined
): Promise<boolean> {
  return hasFlag(PAYWALL_EXIT_SEEN_STORAGE_PREFIX, userId);
}

export function markPaywallExitSeenLocally(
  userId: string | null | undefined
): Promise<void> {
  return setFlag(PAYWALL_EXIT_SEEN_STORAGE_PREFIX, userId);
}

export function hasSeenResultsIntroLocally(
  userId: string | null | undefined
): Promise<boolean> {
  return hasFlag(RESULTS_INTRO_SEEN_STORAGE_PREFIX, userId);
}

export function markResultsIntroSeenLocally(
  userId: string | null | undefined
): Promise<void> {
  return setFlag(RESULTS_INTRO_SEEN_STORAGE_PREFIX, userId);
}

// 只給 __DEV__ 重置連結用：讓成果動畫和退出畫面都能再出現一次。
export async function clearPaywallSeenFlagsLocally(
  userId: string | null | undefined
): Promise<void> {
  if (!userId) return;
  await AsyncStorage.multiRemove([
    `${PAYWALL_EXIT_SEEN_STORAGE_PREFIX}${userId}`,
    `${RESULTS_INTRO_SEEN_STORAGE_PREFIX}${userId}`,
  ]);
}
