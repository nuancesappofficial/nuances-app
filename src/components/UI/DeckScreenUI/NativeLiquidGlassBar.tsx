import React from 'react';
import {
  type NativeSyntheticEvent,
  requireNativeComponent,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';

type NativeLiquidGlassBarEvent = NativeSyntheticEvent<Record<string, never>>;

type NativeLiquidGlassBarProps = ViewProps & {
  title?: string;
  onPress?: (event: NativeLiquidGlassBarEvent) => void;
};

const RCTLiquidGlassBar = requireNativeComponent<NativeLiquidGlassBarProps>('LiquidGlassBar');

type Props = {
  title?: string;
  onPress?: () => void;
};

export default function NativeLiquidGlassBar({ title = 'Open Cache', onPress }: Props) {
  return (
    <View style={styles.wrap}>
      <RCTLiquidGlassBar
        style={styles.bar}
        title={title}
        onPress={() => {
          onPress?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  bar: {
    flex: 1,
  },
});

