import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const secureValue = await SecureStore.getItemAsync(key);
      if (secureValue != null) return secureValue;

      const legacyValue = await AsyncStorage.getItem(key);
      if (legacyValue != null) {
        await SecureStore.setItemAsync(key, legacyValue);
        await AsyncStorage.removeItem(key);
      }
      return legacyValue;
    } catch (error) {
      if (__DEV__) console.warn('[Auth] SecureStore getItem failed, falling back to AsyncStorage:', error);
      return AsyncStorage.getItem(key);
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      if (__DEV__) console.warn('[Auth] SecureStore setItem failed, falling back to AsyncStorage:', error);
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      if (__DEV__) console.warn('[Auth] SecureStore deleteItem failed:', error);
    }
    await AsyncStorage.removeItem(key);
  },
};

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase URL or Anon Key is missing. Please check your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureAuthStorage,
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Helper functions for auth
export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (!error) {
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch (googleError) {
      console.warn('[Auth] Google native sign-out cleanup failed:', googleError);
    }
  }
  return { error };
};

export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error };
};

export const getCurrentSession = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  return { session, error };
};

export const signInWithGoogle = async () => {
  const platformClientId = Platform.OS === 'android' ? googleAndroidClientId : googleIosClientId;
  if (!platformClientId || !googleWebClientId) {
    return {
      data: null,
      error: new Error(
        `Google 原生登入缺少 ${Platform.OS === 'android' ? 'Android' : 'iOS'} 或 Web Client ID。請檢查 EXPO_PUBLIC_GOOGLE_*_CLIENT_ID。`
      ),
      cancelled: false,
    };
  }

  try {
    const { GoogleSignin, isCancelledResponse } = await import(
      '@react-native-google-signin/google-signin'
    );
    GoogleSignin.configure({
      ...(Platform.OS === 'ios' ? { iosClientId: googleIosClientId } : {}),
      webClientId: googleWebClientId,
      offlineAccess: false,
    });

    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) {
      return {
        data: null,
        error: null,
        cancelled: true,
      };
    }

    const identityToken = response.data.idToken?.trim();
    const googleTokens = await GoogleSignin.getTokens();
    const accessToken = googleTokens.accessToken?.trim();
    if (!identityToken) {
      return {
        data: null,
        error: new Error('Google 沒有回傳有效的 ID token。'),
        cancelled: false,
      };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: identityToken,
      ...(accessToken ? { access_token: accessToken } : {}),
    });

    if (error) {
      return { data, error, cancelled: false };
    }
    if (!data.session?.access_token) {
      return {
        data,
        error: new Error('Google 登入完成，但沒有建立 app session。'),
        cancelled: false,
      };
    }

    return {
      data,
      error: null,
      cancelled: false,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
      cancelled: false,
    };
  }
};

export const signInWithApple = async () => {
  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    return {
      data: null,
      error: new Error('Apple 登入目前無法在這台裝置上使用。'),
    };
  }

  try {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    const identityToken = credential.identityToken?.trim();
    if (!identityToken) {
      return {
        data: null,
        error: new Error('Apple 沒有回傳有效的 identity token。'),
      };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce: rawNonce,
    });

    if (error) {
      return { data, error };
    }

    const givenName = credential.fullName?.givenName?.trim() || '';
    const familyName = credential.fullName?.familyName?.trim() || '';
    const fullName = [givenName, familyName].filter(Boolean).join(' ').trim();

    if (fullName || credential.email) {
      await supabase.auth.updateUser({
        data: {
          ...(fullName ? { full_name: fullName } : {}),
          ...(givenName ? { given_name: givenName } : {}),
          ...(familyName ? { family_name: familyName } : {}),
          ...(credential.email ? { email: credential.email } : {}),
        },
      });
    }

    return {
      data: {
        ...data,
        credential,
      },
      error: null,
    };
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      return {
        data: null,
        error: new Error('Apple 登入已取消。'),
      };
    }
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
};
