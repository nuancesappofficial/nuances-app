import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveThemeColors } from '../theme/colors';

type ShareExtensionContextValue = {
  triggerShareSnackbar: (message?: string) => void;
  consumeShareSnackbar: () => string | false;
  snackbarSignal: number;
};

const ShareExtensionContext = createContext<ShareExtensionContextValue | null>(null);

const DEFAULT_SNACKBAR_MESSAGE = '卡片已建立';
const SNACKBAR_HIDE_DELAY_MS = 2400;

export function ShareExtensionProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const palette = resolveThemeColors(colorScheme);
  const insets = useSafeAreaInsets();
  const pendingMessageRef = useRef<string | null>(null);
  const [snackbarSignal, setSnackbarSignal] = useState(0);
  const [visibleMessage, setVisibleMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-18)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const triggerShareSnackbar = useCallback((message?: string) => {
    pendingMessageRef.current = message ?? DEFAULT_SNACKBAR_MESSAGE;
    setSnackbarSignal((prev) => prev + 1);
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
    snackbarSignal,
  };

  useEffect(() => {
    if (!snackbarSignal) return;

    const message = consumeShareSnackbar();
    if (!message) return;

    clearHideTimer();
    setVisibleMessage(message);
    opacity.stopAnimation();
    translateY.stopAnimation();
    opacity.setValue(0);
    translateY.setValue(-18);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 18,
        stiffness: 180,
        mass: 0.8,
        useNativeDriver: true,
      }),
    ]).start();

    hideTimerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -10,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setVisibleMessage(null);
        }
      });
    }, SNACKBAR_HIDE_DELAY_MS);
  }, [clearHideTimer, consumeShareSnackbar, opacity, snackbarSignal, translateY]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer]);

  return (
    <ShareExtensionContext.Provider value={value}>
      <View style={styles.providerRoot}>
        {children}
        {visibleMessage ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.snackbarWrap,
              {
                top: insets.top + 12,
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <View
              style={[
                styles.snackbarCard,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: palette.borderSubtle,
                  shadowColor: colorScheme === 'light' ? '#0F172A' : '#000000',
                },
              ]}
            >
              <Text style={[styles.snackbarText, { color: palette.textOnContainer }]}>
                {visibleMessage}
              </Text>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </ShareExtensionContext.Provider>
  );
}

export function useShareExtensionSnackbar() {
  const ctx = useContext(ShareExtensionContext);
  if (!ctx) {
    return {
      triggerShareSnackbar: (_message?: string) => {},
      consumeShareSnackbar: () => false as string | false,
      snackbarSignal: 0,
    };
  }
  return ctx;
}

const styles = StyleSheet.create({
  providerRoot: {
    flex: 1,
  },
  snackbarWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  snackbarCard: {
    minWidth: 220,
    maxWidth: '100%',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  snackbarText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
