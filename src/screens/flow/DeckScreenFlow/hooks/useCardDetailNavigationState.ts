import React from 'react';
import { Animated } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

export function useCardDetailNavigationState() {
  const [currentIndex, setCurrentIndex] = React.useState<number | null>(null);
  const [displayIndex, setDisplayIndex] = React.useState<number | null>(null);
  const [isFullscreenViewerVisible, setIsFullscreenViewerVisible] = React.useState(false);
  const [fullscreenCardIndex, setFullscreenCardIndex] = React.useState<number | null>(null);

  const flatListRef = React.useRef<any>(null);
  const initialScrollDone = React.useRef(false);
  const didMountIndexRef = React.useRef(false);
  const scrollX = useSharedValue(0);
  const activeIndexUI = useSharedValue(0);
  const fullscreenDragY = React.useRef(new Animated.Value(0)).current;
  const fullscreenBackdropOpacity = React.useRef(new Animated.Value(1)).current;
  const fullscreenEntryProgress = React.useRef(new Animated.Value(0)).current;
  const fullscreenOriginDeltaX = React.useRef(new Animated.Value(0)).current;
  const fullscreenOriginDeltaY = React.useRef(new Animated.Value(0)).current;
  const fullscreenDragYValueRef = React.useRef(0);

  return {
    currentIndex,
    setCurrentIndex,
    displayIndex,
    setDisplayIndex,
    isFullscreenViewerVisible,
    setIsFullscreenViewerVisible,
    fullscreenCardIndex,
    setFullscreenCardIndex,
    flatListRef,
    initialScrollDone,
    didMountIndexRef,
    scrollX,
    activeIndexUI,
    fullscreenDragY,
    fullscreenBackdropOpacity,
    fullscreenEntryProgress,
    fullscreenOriginDeltaX,
    fullscreenOriginDeltaY,
    fullscreenDragYValueRef,
  };
}
