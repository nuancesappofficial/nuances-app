import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from '@services/supabase/client';

const VERSION_CHECK_TIMEOUT_MS = 5000;
const DEFAULT_APP_STORE_URL = (
  process.env.EXPO_PUBLIC_APP_STORE_URL ||
  'https://apps.apple.com/app/id6772143495'
).trim();

type PlatformKey = 'ios' | 'android';

type RemoteVersionPolicy = {
  platform: PlatformKey;
  latest_version: string | null;
  minimum_supported_version: string | null;
  latest_build_number: number | string | null;
  minimum_supported_build_number: number | string | null;
  update_url: string | null;
  required: boolean | null;
  message_title: string | null;
  message_body: string | null;
};

export type AppVersionUpdateStatus = {
  shouldPrompt: boolean;
  isRequired: boolean;
  currentVersion: string;
  currentBuildNumber: number | null;
  latestVersion: string | null;
  latestBuildNumber: number | null;
  minimumSupportedVersion: string | null;
  minimumSupportedBuildNumber: number | null;
  updateUrl: string | null;
  title: string;
  message: string;
};

function getCurrentAppVersion(): string {
  const legacyManifest = Constants.manifest as { version?: string } | null;
  return (
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    Constants.manifest2?.extra?.expoClient?.version ||
    legacyManifest?.version ||
    '0.0.0'
  );
}

function getCurrentBuildNumber(): number | null {
  return normalizeBuildNumber(
    Application.nativeBuildVersion ||
    Constants.expoConfig?.ios?.buildNumber ||
    null
  );
}

function normalizeVersion(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .split(/[.-]/)
    .map((part) => {
      const parsed = Number.parseInt(part.replace(/\D/g, ''), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function normalizeBuildNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number.parseInt(value.replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSameMarketingVersion(left: string, right: string | null): boolean {
  return Boolean(right && compareVersions(left, right) === 0);
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`App version check timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function getPlatformKey(): PlatformKey | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

function buildStatus(
  policy: RemoteVersionPolicy,
  currentVersion: string,
  currentBuildNumber: number | null
): AppVersionUpdateStatus {
  const latestVersion = policy.latest_version?.trim() || null;
  const minimumSupportedVersion = policy.minimum_supported_version?.trim() || null;
  const latestBuildNumber = normalizeBuildNumber(policy.latest_build_number);
  const minimumSupportedBuildNumber = normalizeBuildNumber(policy.minimum_supported_build_number);
  const updateUrl = policy.update_url?.trim() || DEFAULT_APP_STORE_URL || null;
  const belowMinimum = minimumSupportedVersion
    ? compareVersions(currentVersion, minimumSupportedVersion) < 0
    : false;
  const belowLatest = latestVersion ? compareVersions(currentVersion, latestVersion) < 0 : false;
  const belowMinimumBuild =
    !belowMinimum &&
    currentBuildNumber != null &&
    minimumSupportedBuildNumber != null &&
    isSameMarketingVersion(currentVersion, minimumSupportedVersion) &&
    currentBuildNumber < minimumSupportedBuildNumber;
  const belowLatestBuild =
    !belowLatest &&
    currentBuildNumber != null &&
    latestBuildNumber != null &&
    isSameMarketingVersion(currentVersion, latestVersion) &&
    currentBuildNumber < latestBuildNumber;
  const isRequired = Boolean(policy.required || belowMinimum || belowMinimumBuild || belowLatestBuild);

  return {
    shouldPrompt: belowMinimum || belowLatest || belowMinimumBuild || belowLatestBuild,
    isRequired,
    currentVersion,
    currentBuildNumber,
    latestVersion,
    latestBuildNumber,
    minimumSupportedVersion,
    minimumSupportedBuildNumber,
    updateUrl,
    title: policy.message_title?.trim() || (isRequired ? 'Update required' : 'Update available'),
    message:
      policy.message_body?.trim() ||
      (isRequired
        ? 'Please update Nuances from the App Store to continue using the latest supported version.'
        : 'A newer version of Nuances is available. Update from the App Store for the latest fixes and improvements.'),
  };
}

export async function checkAppVersionUpdateStatus(): Promise<AppVersionUpdateStatus | null> {
  const platform = getPlatformKey();
  if (!platform) return null;

  try {
    const currentVersion = getCurrentAppVersion();
    const currentBuildNumber = getCurrentBuildNumber();
    const query = supabase
      .from('app_version_policy')
      .select('platform, latest_version, minimum_supported_version, latest_build_number, minimum_supported_build_number, update_url, required, message_title, message_body')
      .eq('platform', platform)
      .maybeSingle();

    const { data, error } = await withTimeout(query, VERSION_CHECK_TIMEOUT_MS);
    if (error) {
      console.warn('[AppVersion] version policy lookup failed:', error.message);
      return null;
    }
    if (!data) return null;

    const status = buildStatus(data as RemoteVersionPolicy, currentVersion, currentBuildNumber);
    return status.shouldPrompt ? status : null;
  } catch (error) {
    console.warn('[AppVersion] version check skipped:', error);
    return null;
  }
}

export function compareAppVersionsForTest(left: string, right: string): number {
  return compareVersions(left, right);
}
