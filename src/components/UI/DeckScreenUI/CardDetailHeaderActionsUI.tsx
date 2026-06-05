import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  floatingHeaderTop: number;
  isLightMode: boolean;
  headerTitle: string;
  displayIndex: number | null;
  totalCount: number;
  onBack: () => void;
  styles: any;
};

export default function CardDetailHeaderActionsUI({
  floatingHeaderTop,
  isLightMode,
  headerTitle,
  displayIndex,
  totalCount,
  onBack,
  styles,
}: Props) {
  return (
    <View pointerEvents="box-none" style={styles.floatingHeaderLayer}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [
          styles.floatingIconButton,
          styles.floatingBackButton,
          { top: floatingHeaderTop },
          pressed ? styles.pressableIconPressed : null,
        ]}
      >
        <Ionicons name="chevron-back" size={30} color={isLightMode ? '#111111' : '#F4EDE6'} />
      </Pressable>

      <View style={[styles.floatingHeaderCenter, { top: floatingHeaderTop }]}>
        <Text style={[styles.headerTitleText, isLightMode ? styles.headerTitleTextLight : null]}>
          {headerTitle}{' '}
          <Text style={[styles.headerCountText, isLightMode ? styles.headerCountTextLight : null]}>
            ({displayIndex !== null ? displayIndex + 1 : 0}/{totalCount})
          </Text>
        </Text>
      </View>
    </View>
  );
}
