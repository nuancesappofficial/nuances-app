import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { supabase } from '@services/supabase/client';

let cachedPushToken: string | null = null;

/**
 * Registers the device's Expo Push Token in Supabase for the current authenticated user.
 * Silently skips if running on an unsupported simulator or if permissions are denied.
 */
export async function registerPushTokenForUser(userId: string): Promise<string | null> {
  if (!userId) return null;

  try {
    // Push notifications are generally only delivered to physical devices
    if (!Device.isDevice) {
      if (__DEV__) {
        console.log('[PushTokenService] Skipping push token registration on simulator/emulator.');
      }
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) {
        console.log('[PushTokenService] Push notification permissions not granted.');
      }
      return null;
    }

    // Android Oreo and above requires a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5CC58A',
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } })?.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;

    if (!token) return null;
    cachedPushToken = token;

    const appVersion =
      Application.nativeApplicationVersion ||
      Constants.expoConfig?.version ||
      '1.0.0';

    const { error } = await supabase.from('user_push_tokens').upsert(
      {
        user_id: userId,
        push_token: token,
        platform: Platform.OS,
        app_version: appVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,push_token' }
    );

    if (error) {
      console.warn('[PushTokenService] Failed to upsert push token:', error.message);
    } else if (__DEV__) {
      console.log('[PushTokenService] Push token registered successfully:', token);
    }

    return token;
  } catch (error) {
    console.warn('[PushTokenService] Error registering push token:', error);
    return null;
  }
}

/**
 * Removes the device's push token from Supabase upon logout.
 */
export async function unregisterPushTokenForUser(userId: string): Promise<void> {
  if (!userId || !cachedPushToken) return;

  try {
    await supabase
      .from('user_push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('push_token', cachedPushToken);
    cachedPushToken = null;
  } catch (error) {
    console.warn('[PushTokenService] Failed to unregister push token:', error);
  }
}
