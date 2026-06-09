/**
 * useShareExtension Hook
 *
 * App 啟動或從背景喚醒時檢查 Share Extension 傳遞的內容，入庫後觸發 snackbar
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { checkAndProcessSharedContent } from '../services/shareExtension/shareExtensionService';
import { syncWithRetry } from '../services/sync';

export function useShareExtension(userId: string | null) {
  const appState = useRef(AppState.currentState);
  const delayedCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDelayedCheck = useCallback(() => {
    if (delayedCheckRef.current) {
      clearTimeout(delayedCheckRef.current);
      delayedCheckRef.current = null;
    }
  }, []);

  const runCheck = useCallback(async (source: string) => {
    if (!userId) return;

    const result = await checkAndProcessSharedContent(userId).catch((error) => {
      console.error('[ShareExtension] Shared content check failed:', error);
      return {
        addedCount: 0,
        blockedCount: 0,
        currentCacheCount: 0,
        planType: 'premium' as const,
      };
    });

    console.log('[ShareExtension] Ingest result:', {
      source,
      addedCount: result.addedCount,
      blockedCount: result.blockedCount,
      currentCacheCount: result.currentCacheCount,
      planType: result.planType,
    });

    // 在 App 啟動/回前景時做一次背景同步，不阻斷 UI 流程
    await syncWithRetry(2).catch((error) => {
      console.error('[ShareExtension] Background sync failed:', error);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    runCheck('mount');

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        runCheck('foreground');
        clearDelayedCheck();
        delayedCheckRef.current = setTimeout(() => {
          runCheck('foreground_delayed');
        }, 700);
      }
      appState.current = nextAppState;
    });

    return () => {
      clearDelayedCheck();
      subscription.remove();
    };
  }, [clearDelayedCheck, runCheck, userId]);
}
