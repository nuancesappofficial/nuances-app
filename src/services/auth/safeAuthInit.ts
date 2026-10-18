import { Platform } from 'react-native';
import { logDiagnosticEvent } from '../logging/diagnosticsLog';

const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

export type GoogleAuthInitResult = {
  isConfigured: boolean;
  hasPlayServices: boolean;
  error: string | null;
  sha1MismatchSuspected: boolean;
};

let cachedInitResult: GoogleAuthInitResult = {
  isConfigured: false,
  hasPlayServices: false,
  error: null,
  sha1MismatchSuspected: false,
};

export function getGoogleAuthDiagnostics(): GoogleAuthInitResult {
  return cachedInitResult;
}

/**
 * Safely initializes Google Sign-In and checks Play Services.
 * Wraps everything in try-catch so startup NEVER crashes even if:
 * 1. Play Store App Signing SHA-1 is missing or mismatched (DEVELOPER_ERROR 10)
 * 2. Google Play Services is missing or outdated
 * 3. Environment variables are missing
 */
export async function safeInitializeGoogleAuth(): Promise<GoogleAuthInitResult> {
  const platformClientId = Platform.OS === 'android' ? googleAndroidClientId : googleIosClientId;

  if (!platformClientId || !googleWebClientId) {
    const errorMsg = `Google OAuth Client ID not configured for ${Platform.OS}`;
    cachedInitResult = {
      isConfigured: false,
      hasPlayServices: false,
      error: errorMsg,
      sha1MismatchSuspected: false,
    };
    void logDiagnosticEvent({
      severity: 'warn',
      category: 'auth',
      event: 'google_auth_init_skipped',
      message: errorMsg,
    });
    return cachedInitResult;
  }

  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');

    GoogleSignin.configure({
      ...(Platform.OS === 'ios' ? { iosClientId: googleIosClientId } : {}),
      webClientId: googleWebClientId,
      offlineAccess: false,
    });

    let hasPlayServices = true;
    if (Platform.OS === 'android') {
      try {
        hasPlayServices = await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: false,
        });
      } catch (playServicesError) {
        console.warn('[SafeAuthInit] Google Play Services check failed:', playServicesError);
        hasPlayServices = false;
      }
    }

    cachedInitResult = {
      isConfigured: true,
      hasPlayServices,
      error: null,
      sha1MismatchSuspected: false,
    };

    void logDiagnosticEvent({
      severity: 'info',
      category: 'auth',
      event: 'google_auth_init_success',
      context: { platform: Platform.OS, hasPlayServices },
    });

    return cachedInitResult;
  } catch (error) {
    const rawError = error instanceof Error ? error.message : String(error);
    const isSha1Mismatch =
      rawError.includes('10') ||
      rawError.toLowerCase().includes('developer_error') ||
      rawError.toLowerCase().includes('sign_in_failed');

    const formattedMessage = isSha1Mismatch
      ? `Google OAuth init failed (suspected SHA-1 mismatch from Play App Signing): ${rawError}`
      : `Google OAuth init failed: ${rawError}`;

    console.warn('[SafeAuthInit] Gracefully handled Google OAuth initialization error:', formattedMessage);

    cachedInitResult = {
      isConfigured: false,
      hasPlayServices: false,
      error: formattedMessage,
      sha1MismatchSuspected: isSha1Mismatch,
    };

    void logDiagnosticEvent({
      severity: 'warn',
      category: 'auth',
      event: 'google_auth_init_failed',
      message: formattedMessage,
      context: { rawError, isSha1Mismatch },
    });

    // Never rethrow - return status gracefully so startup and UI continue seamlessly
    return cachedInitResult;
  }
}
