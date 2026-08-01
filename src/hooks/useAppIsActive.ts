import * as React from 'react';
import { AppState } from 'react-native';

let activeSnapshot = AppState.currentState === 'active';
let nativeSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!nativeSubscription) {
    nativeSubscription = AppState.addEventListener('change', (nextState) => {
      const nextSnapshot = nextState === 'active';
      if (nextSnapshot === activeSnapshot) return;
      activeSnapshot = nextSnapshot;
      listeners.forEach((notify) => notify());
    });
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      nativeSubscription?.remove();
      nativeSubscription = null;
      activeSnapshot = AppState.currentState === 'active';
    }
  };
}

export function useAppIsActive(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => activeSnapshot,
    () => true
  );
}
