import React, { createContext, useCallback, useContext, useRef } from 'react';

type ShareExtensionContextValue = {
  triggerShareSnackbar: (message?: string) => void;
  consumeShareSnackbar: () => string | false;
};

const ShareExtensionContext = createContext<ShareExtensionContextValue | null>(null);

const DEFAULT_SNACKBAR_MESSAGE = '卡片已建立';

export function ShareExtensionProvider({ children }: { children: React.ReactNode }) {
  const pendingMessageRef = useRef<string | null>(null);

  const triggerShareSnackbar = useCallback((message?: string) => {
    pendingMessageRef.current = message ?? DEFAULT_SNACKBAR_MESSAGE;
  }, []);

  const consumeShareSnackbar = useCallback((): string | false => {
    const msg = pendingMessageRef.current;
    if (msg == null) return false;
    pendingMessageRef.current = null;
    return msg;
  }, []);

  const value: ShareExtensionContextValue = {
    triggerShareSnackbar,
    consumeShareSnackbar,
  };

  return (
    <ShareExtensionContext.Provider value={value}>
      {children}
    </ShareExtensionContext.Provider>
  );
}

export function useShareExtensionSnackbar() {
  const ctx = useContext(ShareExtensionContext);
  if (!ctx) {
    return {
      triggerShareSnackbar: (_message?: string) => {},
      consumeShareSnackbar: () => false as string | false,
    };
  }
  return ctx;
}
