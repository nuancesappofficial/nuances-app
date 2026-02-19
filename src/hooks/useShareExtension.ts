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

export function useShareExtension(userId: string | null) {
  const appState = useRef(AppState.currentState);
  const { triggerShareSnackbar } = useShareExtensionSnackbar();

  useEffect(() => {
    if (!userId) return;

    const runCheck = async () => {
      const count = await checkAndProcessSharedContent(userId).catch(() => 0);

      if (typeof count === 'number' && count > 0) {
        const message = `從上次離開到現在新增了 ${count} 個卡片`;
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
