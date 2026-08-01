/**
 * useShareExtension Hook
 *
 * App 啟動或從背景喚醒時檢查 Share Extension 傳遞的內容。
 * Share Extension 只寫入 local-only cache，不得觸發 Supabase 同步。
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { AndroidShareIntent } from 'android-share-intent';
import {
  checkAndProcessSharedContent,
  hasPendingSharedContent,
} from '../services/shareExtension/shareExtensionService';

const FOREGROUND_SHARE_CHECK_MIN_INTERVAL_MS = 5000;

export function useShareExtension(userId: string | null) {
  const appState = useRef(AppState.currentState);
  const delayedCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightCheckRef = useRef<Promise<void> | null>(null);
  const lastForegroundCheckAtRef = useRef(0);

  const clearDelayedCheck = useCallback(() => {
    if (delayedCheckRef.current) {
      clearTimeout(delayedCheckRef.current);
      delayedCheckRef.current = null;
    }
  }, []);

  const runCheck = useCallback((source: string) => {
    if (!userId || AppState.currentState !== 'active') return Promise.resolve();
    if (inFlightCheckRef.current) return inFlightCheckRef.current;

    const work = hasPendingSharedContent()
      .then((hasPending) => {
        if (!hasPending || AppState.currentState !== 'active') return undefined;
        return checkAndProcessSharedContent(userId);
      })
      .then(() => undefined)
      .catch((error) => {
        console.error(`[ShareExtension] ${source} shared content check failed:`, error);
      })
      .finally(() => {
        if (inFlightCheckRef.current === work) {
          inFlightCheckRef.current = null;
        }
      });
    inFlightCheckRef.current = work;
    return work;
  }, [userId]);

  const scheduleCheck = useCallback((source: string, delayMs: number) => {
    clearDelayedCheck();
    delayedCheckRef.current = setTimeout(() => {
      delayedCheckRef.current = null;
      void runCheck(source);
    }, delayMs);
  }, [clearDelayedCheck, runCheck]);

  useEffect(() => {
    if (!userId) return;

    scheduleCheck('mount', 250);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        const now = Date.now();
        if (now - lastForegroundCheckAtRef.current < FOREGROUND_SHARE_CHECK_MIN_INTERVAL_MS) {
          appState.current = nextAppState;
          return;
        }
        lastForegroundCheckAtRef.current = now;
        scheduleCheck('foreground', 900);
      } else if (nextAppState !== 'active') {
        clearDelayedCheck();
      }
      appState.current = nextAppState;
    });
    const androidShareSubscription = Platform.OS === 'android'
      ? AndroidShareIntent.addListener(() => {
          scheduleCheck('android_intent', 100);
        })
      : null;

    return () => {
      clearDelayedCheck();
      subscription.remove();
      androidShareSubscription?.remove();
    };
  }, [clearDelayedCheck, scheduleCheck, userId]);
}
