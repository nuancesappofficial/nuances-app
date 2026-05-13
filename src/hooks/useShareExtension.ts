/**
 * useShareExtension Hook
 *
 * App 啟動或從背景喚醒時檢查 Share Extension 傳遞的內容，入庫後觸發 snackbar
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { checkAndProcessSharedContent } from '../services/shareExtension/shareExtensionService';
import { syncWithRetry } from '../services/sync';
import { useShareExtensionSnackbar } from '../contexts/ShareExtensionContext';
import { FREE_CACHE_CARD_LIMIT } from '../services/cache/cacheLimitService';

export function useShareExtension(userId: string | null) {
  const appState = useRef(AppState.currentState);
  const { triggerShareSnackbar } = useShareExtensionSnackbar();

  useEffect(() => {
    if (!userId) return;

    const runCheck = async () => {
      const result = await checkAndProcessSharedContent(userId).catch(() => ({
        addedCount: 0,
        blockedCount: 0,
        currentCacheCount: 0,
        planType: 'free' as const,
      }));

      if (result.addedCount > 0 || result.blockedCount > 0) {
        const message =
          result.planType === 'free'
            ? `${result.currentCacheCount}/${FREE_CACHE_CARD_LIMIT} cards in cache`
            : `${result.currentCacheCount} cards in cache`;
        triggerShareSnackbar(message);
      }

      // 在 App 啟動/回前景時做一次背景同步，不阻斷 UI 流程
      await syncWithRetry(2).catch((error) => {
        console.error('[ShareExtension] Background sync failed:', error);
      });
    };

    runCheck();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        runCheck();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [userId, triggerShareSnackbar]);
}
