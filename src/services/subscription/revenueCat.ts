import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';
import { NativeModules } from 'react-native';

const REVENUECAT_APPLE_API_KEY = (process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || '').trim();
const REVENUECAT_ENTITLEMENT_ID = (process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'premium').trim();
const REVENUECAT_PACKAGE_ID = (process.env.EXPO_PUBLIC_REVENUECAT_PACKAGE_ID || '').trim();
const REVENUECAT_USER_DEFAULTS_SUITE = (
  process.env.EXPO_PUBLIC_REVENUECAT_USER_DEFAULTS_SUITE || 'group.com.jeffenglishlearning.nuances'
).trim();

let configuredAppUserId: string | null = null;
let didWarnMissingNativeModule = false;
let didWarnInvalidApiKey = false;
let didLogRevenueCatPublicConfig = false;

export type RevenueCatOfferingSummary = {
  priceLabel: string | null;
  packageId: string | null;
  offeringIdentifier: string | null;
};

function isRevenueCatNativeModuleUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('Native module (RNPurchases) not found');
}

function isRevenueCatInvalidApiKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('Invalid API Key') ||
    message.includes('credentials issue') ||
    message.includes('There was a credentials issue')
  );
}

function isRevenueCatNativeAvailable(): boolean {
  return Boolean(NativeModules?.RNPurchases);
}

function warnRevenueCatNativeUnavailable(context: string, error?: unknown) {
  if (didWarnMissingNativeModule) return;
  didWarnMissingNativeModule = true;
  console.warn(
    `[RevenueCat] ${context}: native module unavailable. Running in graceful fallback mode until the app is rebuilt with RevenueCat linked.`,
    error || ''
  );
}

function warnRevenueCatInvalidApiKey(context: string, error?: unknown) {
  if (didWarnInvalidApiKey) return;
  didWarnInvalidApiKey = true;
  console.warn(
    `[RevenueCat] ${context}: invalid public API key. Falling back to local free/trial entitlement until EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY is corrected.`,
    error || ''
  );
}

function getActiveEntitlement(info: CustomerInfo | null | undefined) {
  if (!info) return null;
  const active = info.entitlements?.active || {};
  return active[REVENUECAT_ENTITLEMENT_ID] || null;
}

function normalizeExpiration(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function ensureConfigured(appUserId?: string | null): Promise<boolean> {
  if (!REVENUECAT_APPLE_API_KEY) return false;
  if (!isRevenueCatNativeAvailable()) {
    warnRevenueCatNativeUnavailable('ensureConfigured');
    return false;
  }

  try {
    if (__DEV__ && !didLogRevenueCatPublicConfig) {
      didLogRevenueCatPublicConfig = true;
      console.log('[RevenueCat] public SDK config', {
        keyPrefix: REVENUECAT_APPLE_API_KEY.slice(0, 5),
        keySuffix: REVENUECAT_APPLE_API_KEY.slice(-4),
        keyLength: REVENUECAT_APPLE_API_KEY.length,
        entitlementId: REVENUECAT_ENTITLEMENT_ID,
        packageId: REVENUECAT_PACKAGE_ID || '(current offering)',
      });
    }
    const isConfigured = await Purchases.isConfigured();
    if (!isConfigured) {
      Purchases.configure({
        apiKey: REVENUECAT_APPLE_API_KEY,
        appUserID: appUserId || undefined,
        userDefaultsSuiteName: REVENUECAT_USER_DEFAULTS_SUITE || undefined,
      });
      await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
      configuredAppUserId = appUserId || null;
      return true;
    }

    if (appUserId && configuredAppUserId !== appUserId) {
      await Purchases.logIn(appUserId);
      configuredAppUserId = appUserId;
    }

    return true;
  } catch (error) {
    if (isRevenueCatNativeModuleUnavailableError(error)) {
      warnRevenueCatNativeUnavailable('ensureConfigured catch', error);
      return false;
    }
    if (isRevenueCatInvalidApiKeyError(error)) {
      warnRevenueCatInvalidApiKey('ensureConfigured catch', error);
      return false;
    }
    throw error;
  }
}

async function getCurrentPackageFromOfferings(offerings: PurchasesOfferings): Promise<PurchasesPackage | null> {
  const current = offerings.current;
  if (!current) return null;
  if (REVENUECAT_PACKAGE_ID) {
    const exact = current.availablePackages.find((item) => item.identifier === REVENUECAT_PACKAGE_ID);
    if (exact) return exact;
  }
  return current.availablePackages[0] || null;
}

export function isRevenueCatConfigured(): boolean {
  return Boolean(REVENUECAT_APPLE_API_KEY);
}

export function getRevenueCatEntitlementId(): string {
  return REVENUECAT_ENTITLEMENT_ID;
}

export function hasRevenueCatPremium(info: CustomerInfo | null | undefined): boolean {
  const entitlement = getActiveEntitlement(info);
  if (!entitlement) return false;
  const expiresAt = entitlement.expirationDate ? Date.parse(entitlement.expirationDate) : Number.POSITIVE_INFINITY;
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

export function getRevenueCatExpiration(info: CustomerInfo | null | undefined): string | null {
  const entitlement = getActiveEntitlement(info);
  return normalizeExpiration(entitlement?.expirationDate);
}

export async function configureRevenueCat(appUserId?: string | null): Promise<boolean> {
  return ensureConfigured(appUserId);
}

export async function getRevenueCatCustomerInfo(appUserId?: string | null): Promise<CustomerInfo | null> {
  const ready = await ensureConfigured(appUserId);
  if (!ready) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    if (isRevenueCatInvalidApiKeyError(error)) {
      warnRevenueCatInvalidApiKey('getCustomerInfo', error);
      return null;
    }
    throw error;
  }
}

export async function getRevenueCatOfferingSummary(appUserId?: string | null): Promise<RevenueCatOfferingSummary> {
  const ready = await ensureConfigured(appUserId);
  if (!ready) {
    return {
      priceLabel: null,
      packageId: null,
      offeringIdentifier: null,
    };
  }

  try {
    const offerings = await Purchases.getOfferings();
    const chosen = await getCurrentPackageFromOfferings(offerings);
    return {
      priceLabel: chosen?.product.priceString || null,
      packageId: chosen?.identifier || null,
      offeringIdentifier: offerings.current?.identifier || null,
    };
  } catch (error) {
    if (isRevenueCatInvalidApiKeyError(error)) {
      warnRevenueCatInvalidApiKey('getOfferings', error);
      return {
        priceLabel: null,
        packageId: null,
        offeringIdentifier: null,
      };
    }
    console.warn('[RevenueCat] getOfferings failed:', error);
    return {
      priceLabel: null,
      packageId: null,
      offeringIdentifier: null,
    };
  }
}

export async function purchaseRevenueCatPremium(appUserId?: string | null): Promise<CustomerInfo> {
  if (!isRevenueCatNativeAvailable()) {
    throw new Error('目前這個 app binary 還沒有 RevenueCat 原生模組。請重新執行一次 iOS development build。');
  }
  const ready = await ensureConfigured(appUserId);
  if (!ready) {
    throw new Error('RevenueCat 尚未設定，請先填入 EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY。');
  }

  const offerings = await Purchases.getOfferings();
  const chosen = await getCurrentPackageFromOfferings(offerings);
  if (!chosen) {
    throw new Error('目前找不到可購買的 Premium 方案，請確認 RevenueCat Offering 設定。');
  }

  const result = await Purchases.purchasePackage(chosen);
  return result.customerInfo;
}

export async function restoreRevenueCatPurchases(appUserId?: string | null): Promise<CustomerInfo> {
  if (!isRevenueCatNativeAvailable()) {
    throw new Error('目前這個 app binary 還沒有 RevenueCat 原生模組。請重新執行一次 iOS development build。');
  }
  const ready = await ensureConfigured(appUserId);
  if (!ready) {
    throw new Error('RevenueCat 尚未設定，請先填入 EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY。');
  }
  return Purchases.restorePurchases();
}
