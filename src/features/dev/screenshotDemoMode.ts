import AsyncStorage from '@react-native-async-storage/async-storage';

const SCREENSHOT_DEMO_MODE_KEY = 'nuances:dev:screenshot_demo_mode';

let screenshotDemoModeEnabled = false;

export function isScreenshotDemoModeEnabled(): boolean {
  return __DEV__ && screenshotDemoModeEnabled;
}

export async function hydrateScreenshotDemoMode(): Promise<boolean> {
  if (!__DEV__) return false;
  const value = await AsyncStorage.getItem(SCREENSHOT_DEMO_MODE_KEY);
  screenshotDemoModeEnabled = value === 'true';
  return screenshotDemoModeEnabled;
}

export async function enableScreenshotDemoMode(): Promise<void> {
  if (!__DEV__) return;
  screenshotDemoModeEnabled = true;
  await AsyncStorage.setItem(SCREENSHOT_DEMO_MODE_KEY, 'true');
}

export async function disableScreenshotDemoMode(): Promise<void> {
  if (!__DEV__) return;
  screenshotDemoModeEnabled = false;
  await AsyncStorage.removeItem(SCREENSHOT_DEMO_MODE_KEY);
}
