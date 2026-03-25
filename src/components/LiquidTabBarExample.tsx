import * as React from 'react';
import { View } from 'react-native';
import { LiquidTabBar } from 'liquid-tab-bar';

export default function LiquidTabBarExample() {
  const [selectedTabIndex, setSelectedTabIndex] = React.useState(0);

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
      <LiquidTabBar
        selectedTabIndex={selectedTabIndex}
        onTabSelect={(index) => {
          setSelectedTabIndex(index);
          console.log(`[LiquidTabBar] tab pressed: ${index}`);
        }}
      />
    </View>
  );
}
