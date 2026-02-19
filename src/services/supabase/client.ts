import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const authRedirectScheme = process.env.EXPO_PUBLIC_AUTH_REDIRECT_SCHEME || 'nuances';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase URL or Anon Key is missing. Please check your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

function getAuthRedirectTo(): string {
  return `${authRedirectScheme}://auth/callback`;
}

function getParamFromUrl(url: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const queryRegex = new RegExp(`[?&]${escapedKey}=([^&#]+)`);
  const hashRegex = new RegExp(`[#&]${escapedKey}=([^&#]+)`);
  const queryMatch = url.match(queryRegex);
  if (queryMatch?.[1]) {
    return decodeURIComponent(queryMatch[1]);
  }
  const hashMatch = url.match(hashRegex);
  if (hashMatch?.[1]) {
    return decodeURIComponent(hashMatch[1]);
  }
  return null;
}

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
  const redirectTo = getAuthRedirectTo();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    return { data, error };
  }

  const authUrl = data?.url?.trim();
  if (!authUrl) {
    return {
      data,
      error: new Error('Google OAuth URL is empty. Please check provider settings.'),
    };
  }
  if (!/^https?:\/\//i.test(authUrl)) {
    return {
      data,
      error: new Error(`Google OAuth URL is invalid: ${authUrl}`),
    };
  }

  const canOpen = await Linking.canOpenURL(authUrl);
  if (!canOpen) {
    return {
      data,
      error: new Error(`Cannot open OAuth URL: ${authUrl}`),
    };
  }

  await Linking.openURL(authUrl);

  return { data, error: null };
};

export const completeOAuthFromUrl = async (url: string) => {
  const code = getParamFromUrl(url, 'code');
  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    return { ...result, handled: true };
  }

  const accessToken = getParamFromUrl(url, 'access_token');
  const refreshToken = getParamFromUrl(url, 'refresh_token');
  if (accessToken && refreshToken) {
    const result = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { ...result, handled: true };
  }

  return {
    data: null,
    error: new Error('OAuth callback does not contain auth code or tokens'),
    handled: false,
  };
};
