import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';
import { NativeModules, Platform } from 'react-native';
import type { PlanType } from '@services/settings/userSettings';

const REVENUECAT_APPLE_API_KEY = (process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || '').trim();
const REVENUECAT_GOOGLE_API_KEY = (process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY || '').trim();
const REVENUECAT_ENTITLEMENT_ID = (process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'premium').trim();
const REVENUECAT_PACKAGE_ID = (process.env.EXPO_PUBLIC_REVENUECAT_PACKAGE_ID || '').trim();
const REVENUECAT_USER_DEFAULTS_SUITE = (
  process.env.EXPO_PUBLIC_REVENUECAT_USER_DEFAULTS_SUITE || 'group.com.jeffenglishlearning.nuances.v2'
).trim();

let configuredAppUserId: string | null = null;
let didWarnMissingNativeModule = false;
let didWarnInvalidApiKey = false;
let didLogRevenueCatPublicConfig = false;
let configurationPromise: Promise<boolean> | null = null;

function getRevenueCatApiKey(): string {
  if (Platform.OS === 'ios') return REVENUECAT_APPLE_API_KEY;
  if (Platform.OS === 'android') return REVENUECAT_GOOGLE_API_KEY;
  return '';
}

function getRevenueCatKeyEnvironmentName(): string {
  return Platform.OS === 'android'
    ? 'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY'
    : 'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY';
}

export type RevenueCatOfferingSummary = {
  priceLabel: string | null;
  packageId: string | null;
  offeringIdentifier: string | null;
  packages: RevenueCatPackageSummary[];
  /** Lite 軌的產品包（identifier / packageType 含 'lite' 關鍵字）。 */
  litePackages: RevenueCatPackageSummary[];
  /** Pro 軌的產品包（其餘非 lite 的產品包）。 */
  proPackages: RevenueCatPackageSummary[];
};

export type RevenueCatPackageSummary = {
  identifier: string;
  packageType: string;
  productIdentifier: string;
  title: string;
  description: string;
  priceLabel: string;
  currencyCode: string | null;
  subscriptionPeriod: string | null;
  hasFreeTrialOffer: boolean;
  isFreeTrialEligible: boolean;
  freeTrialPeriodUnit: string | null;
  freeTrialPeriodCount: number | null;
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
    `[RevenueCat] ${context}: invalid public API key. Premium remains unavailable until ${getRevenueCatKeyEnvironmentName()} is corrected.`,
    error || ''
  );
}

function getActiveEntitlement(info: CustomerInfo | null | undefined) {
  if (!info) return null;
  const active = info.entitlements?.active || {};
  return active[REVENUECAT_ENTITLEMENT_ID] || null;
}

function getActiveProductId(info: CustomerInfo | null | undefined): string | null {
  const entitlement = getActiveEntitlement(info) as Record<string, unknown> | null;
  const productId =
    entitlement?.productIdentifier ??
    entitlement?.product_identifier ??
    entitlement?.productId ??
    null;
  return typeof productId === 'string' && productId.trim() ? productId : null;
}

function getEntitlementPeriodType(info: CustomerInfo | null | undefined): string {
  const entitlement = getActiveEntitlement(info) as Record<string, unknown> | null;
  return String(
    entitlement?.periodType ??
    entitlement?.period_type ??
    entitlement?.storePeriodType ??
    entitlement?.store_period_type ??
    ''
  ).trim().toLowerCase();
}

function normalizeExpiration(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function performEnsureConfigured(appUserId?: string | null): Promise<boolean> {
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) return false;
  if (!isRevenueCatNativeAvailable()) {
    warnRevenueCatNativeUnavailable('ensureConfigured');
    return false;
  }

  try {
    if (__DEV__ && !didLogRevenueCatPublicConfig) {
      didLogRevenueCatPublicConfig = true;
      console.log('[RevenueCat] public SDK config', {
        platform: Platform.OS,
        keyPrefix: apiKey.slice(0, 5),
        keySuffix: apiKey.slice(-4),
        keyLength: apiKey.length,
        entitlementId: REVENUECAT_ENTITLEMENT_ID,
        packageId: REVENUECAT_PACKAGE_ID || '(current offering)',
      });
    }
    const isConfigured = await Purchases.isConfigured();
    if (!isConfigured) {
      Purchases.configure({
        apiKey,
        appUserID: appUserId || undefined,
        userDefaultsSuiteName:
          Platform.OS === 'ios' ? REVENUECAT_USER_DEFAULTS_SUITE || undefined : undefined,
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

async function ensureConfigured(appUserId?: string | null): Promise<boolean> {
  if (configurationPromise) {
    const configured = await configurationPromise;
    if (!configured) return false;
    if (!appUserId || configuredAppUserId === appUserId) return true;
  }

  const work = performEnsureConfigured(appUserId);
  configurationPromise = work;
  try {
    return await work;
  } finally {
    if (configurationPromise === work) {
      configurationPromise = null;
    }
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

function getPackageByIdentifierFromOfferings(
  offerings: PurchasesOfferings,
  packageIdentifier?: string | null
): PurchasesPackage | null {
  const current = offerings.current;
  if (!current) return null;
  const requested = packageIdentifier?.trim();
  if (requested) {
    const exact = current.availablePackages.find((item) => item.identifier === requested);
    if (exact) return exact;
  }
  if (REVENUECAT_PACKAGE_ID) {
    const configured = current.availablePackages.find((item) => item.identifier === REVENUECAT_PACKAGE_ID);
    if (configured) return configured;
  }
  return current.availablePackages[0] || null;
}

function summarizePackage(
  item: PurchasesPackage,
  freeTrialEligibility: Record<string, boolean> = {}
): RevenueCatPackageSummary {
  const product = item.product as PurchasesPackage['product'] & {
    subscriptionPeriod?: string | null;
  };
  const hasFreeTrialOffer = product.introPrice?.price === 0;
  const freeTrialPeriodCount =
    hasFreeTrialOffer && product.introPrice
      ? product.introPrice.periodNumberOfUnits *
        Math.max(1, product.introPrice.cycles)
      : null;
  return {
    identifier: item.identifier,
    packageType: String(item.packageType || ''),
    productIdentifier: product.identifier,
    title: product.title || item.identifier,
    description: product.description || '',
    priceLabel: product.priceString || '',
    currencyCode: product.currencyCode || null,
    subscriptionPeriod: product.subscriptionPeriod || null,
    hasFreeTrialOffer,
    isFreeTrialEligible:
      hasFreeTrialOffer && freeTrialEligibility[product.identifier] === true,
    freeTrialPeriodUnit:
      hasFreeTrialOffer && product.introPrice
        ? product.introPrice.periodUnit
        : null,
    freeTrialPeriodCount,
  };
}

function isLitePackage(item: RevenueCatPackageSummary): boolean {
  const haystack = `${item.identifier} ${item.packageType} ${item.productIdentifier}`.toLowerCase();
  return haystack.includes('lite');
}

function splitPackagesByTier(
  packages: RevenueCatPackageSummary[]
): { litePackages: RevenueCatPackageSummary[]; proPackages: RevenueCatPackageSummary[] } {
  const litePackages: RevenueCatPackageSummary[] = [];
  const proPackages: RevenueCatPackageSummary[] = [];
  for (const item of packages) {
    if (isLitePackage(item)) litePackages.push(item);
    else proPackages.push(item);
  }
  return { litePackages, proPackages };
}

export function isRevenueCatConfigured(): boolean {
  return Boolean(getRevenueCatApiKey());
}

export function getRevenueCatEntitlementId(): string {
  return REVENUECAT_ENTITLEMENT_ID;
}

export function hasRevenueCatPremium(info: CustomerInfo | null | undefined): boolean {
  if (!getRevenueCatApiKey()) return false;
  const entitlement = getActiveEntitlement(info);
  if (!entitlement) return false;
  const expiresAt = entitlement.expirationDate ? Date.parse(entitlement.expirationDate) : Number.POSITIVE_INFINITY;
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

export function getRevenueCatPlanType(info: CustomerInfo | null | undefined): PlanType {
  if (!hasRevenueCatPremium(info)) return 'free';
  const periodType = getEntitlementPeriodType(info);
  if (periodType.includes('trial') || periodType.includes('intro')) return 'trial';
  const productId = getActiveProductId(info);
  return productId && productId.toLowerCase().includes('lite') ? 'lite' : 'premium';
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
      packages: [],
      litePackages: [],
      proPackages: [],
    };
  }

  try {
    const offerings = await Purchases.getOfferings();
    const chosen = await getCurrentPackageFromOfferings(offerings);
    const availablePackages = offerings.current?.availablePackages || [];
    const freeTrialProductIds = availablePackages
      .filter((item) => item.product.introPrice?.price === 0)
      .map((item) => item.product.identifier);
    let freeTrialEligibility: Record<string, boolean> = {};

    if (Platform.OS === 'ios' && freeTrialProductIds.length > 0) {
      try {
        const eligibility =
          await Purchases.checkTrialOrIntroductoryPriceEligibility(
            freeTrialProductIds
          );
        freeTrialEligibility = Object.fromEntries(
          freeTrialProductIds.map((productId) => [
            productId,
            eligibility[productId]?.status ===
              INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE,
          ])
        );
      } catch (error) {
        console.warn('[RevenueCat] trial eligibility check failed:', error);
      }
    }

    const packages = availablePackages.map((item) =>
      summarizePackage(item, freeTrialEligibility)
    );
    const { litePackages, proPackages } = splitPackagesByTier(packages);
    return {
      priceLabel: chosen?.product.priceString || null,
      packageId: chosen?.identifier || null,
      offeringIdentifier: offerings.current?.identifier || null,
      packages,
      litePackages,
      proPackages,
    };
  } catch (error) {
    if (isRevenueCatInvalidApiKeyError(error)) {
      warnRevenueCatInvalidApiKey('getOfferings', error);
      return {
        priceLabel: null,
        packageId: null,
        offeringIdentifier: null,
        packages: [],
        litePackages: [],
        proPackages: [],
      };
    }
    console.warn('[RevenueCat] getOfferings failed:', error);
    return {
      priceLabel: null,
      packageId: null,
      offeringIdentifier: null,
      packages: [],
      litePackages: [],
      proPackages: [],
    };
  }
}

/** 使用者主動取消購買流程時拋出，上層應靜默處理（不顯示「購買失敗」）。 */
export class PurchaseCancelledError extends Error {
  constructor(message = 'Purchase cancelled by user') {
    super(message);
    this.name = 'PurchaseCancelledError';
  }
}

function isUserCancelledError(error: unknown): boolean {
  if (error instanceof PurchaseCancelledError) return true;
  const candidate = error as { userCancelled?: unknown; code?: unknown } | null;
  if (candidate?.userCancelled === true) return true;
  const code = String(candidate?.code ?? '');
  // RevenueCat 取消購買的錯誤碼（iOS / Android 通用）。
  return code === '1' || code === 'USER_CANCELLED' || code === 'PurchaseCancelledError';
}

export async function purchaseRevenueCatPremium(
  appUserId?: string | null,
  packageIdentifier?: string | null
): Promise<CustomerInfo> {
  if (!isRevenueCatNativeAvailable()) {
    throw new Error('目前這個 app binary 還沒有 RevenueCat 原生模組。請重新執行一次 iOS development build。');
  }
  const ready = await ensureConfigured(appUserId);
  if (!ready) {
    throw new Error(`RevenueCat 尚未設定，請先填入 ${getRevenueCatKeyEnvironmentName()}。`);
  }

  const offerings = await Purchases.getOfferings();
  const chosen = getPackageByIdentifierFromOfferings(offerings, packageIdentifier);
  if (!chosen) {
    throw new Error('目前找不到可購買的 Premium 方案，請確認 RevenueCat Offering 設定。');
  }

  try {
    const result = await Purchases.purchasePackage(chosen);
    return result.customerInfo;
  } catch (error) {
    if (isUserCancelledError(error)) {
      throw new PurchaseCancelledError();
    }
    throw error;
  }
}

export async function restoreRevenueCatPurchases(appUserId?: string | null): Promise<CustomerInfo> {
  if (!isRevenueCatNativeAvailable()) {
    throw new Error('目前這個 app binary 還沒有 RevenueCat 原生模組。請重新執行一次 iOS development build。');
  }
  const ready = await ensureConfigured(appUserId);
  if (!ready) {
    throw new Error(`RevenueCat 尚未設定，請先填入 ${getRevenueCatKeyEnvironmentName()}。`);
  }
  return Purchases.restorePurchases();
}
