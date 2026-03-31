import * as React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';

type NativeTabSelectEvent = {
  nativeEvent: {
    selectedTabIndex: number;
  };
};

type NativeLiquidTabBarProps = {
  selectedTabIndex: number;
  showsAddButton?: boolean;
  onTabSelect?: (event: NativeTabSelectEvent) => void;
  onAddPress?: () => void;
  style?: any;
};

const NativeLiquidTabBar = requireNativeViewManager<NativeLiquidTabBarProps>('LiquidTabBar');

export type LiquidTabBarProps = {
  selectedTabIndex: number;
  showsAddButton?: boolean;
  onTabSelect?: (index: number) => void;
  onAddPress?: () => void;
  style?: any;
};

export function LiquidTabBar({
  selectedTabIndex,
  showsAddButton = true,
  onTabSelect,
  onAddPress,
  style,
}: LiquidTabBarProps) {
  if (Platform.OS !== 'ios') {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>LiquidTabBar is iOS-only</Text>
      </View>
    );
  }

  return (
    <NativeLiquidTabBar
      style={[styles.nativeBar, style]}
      selectedTabIndex={selectedTabIndex}
      showsAddButton={showsAddButton}
      onTabSelect={(e) => onTabSelect?.(e.nativeEvent.selectedTabIndex)}
      onAddPress={onAddPress}
    />
  );
}

const styles = StyleSheet.create({
  nativeBar: {
    width: '100%',
    height: 78,
  },
  fallback: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1b1b1b',
  },
  fallbackText: {
    fontSize: 12,
    color: '#999',
  },
});
