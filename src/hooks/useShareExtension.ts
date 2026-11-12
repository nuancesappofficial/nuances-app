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

export function useShareExtension(userId: string | null) {
  const appState = useRef(AppState.currentState);
  const delayedCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightCheckRef = useRef<Promise<void> | null>(null);

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
        // Check right away: it is one local App Group read, and runCheck already
        // collapses overlapping calls. The old 900ms delay held back the card drop
        // and the 5s skip left a second quick share waiting for the next resume.
        clearDelayedCheck();
        appState.current = nextAppState;
        void runCheck('foreground');
        return;
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
