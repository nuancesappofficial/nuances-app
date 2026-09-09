import React from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useAppTour } from '../../../contexts/AppTourContext';

export default function TutorialOverlayMask() {
  const appTour = useAppTour();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  if (!appTour.isActive) return null;

  // Scrollable CreateCard flows (OCR token selection, generate button, ghost card preview)
  // and quick quiz finish screen do not use fullscreen blocking mask to allow free vertical scrolling
  if (
    appTour.step === 'STEP_5_SELECT_TARGET' ||
    appTour.step === 'STEP_6_GENERATE_SAMPLE' ||
    appTour.step === 'STEP_7_SAVE_SAMPLE' ||
    appTour.step === 'STEP_10_QUIZ_FINISH'
  ) {
    return null;
  }

  const rect = appTour.spotlightRect;

  if (!rect) {
    return null;
  }

  const { x, y, width, height } = rect;

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.maskRoot]} pointerEvents="box-none">
      {/* Top blocker */}
      {y > 0 ? (
        <View
          style={[
            styles.blocker,
            { top: 0, left: 0, right: 0, height: Math.max(0, y) },
          ]}
          pointerEvents="auto"
          onStartShouldSetResponder={() => true}
        />
      ) : null}

      {/* Bottom blocker */}
      {screenHeight > y + height ? (
        <View
          style={[
            styles.blocker,
            { top: y + height, left: 0, right: 0, bottom: 0 },
          ]}
          pointerEvents="auto"
          onStartShouldSetResponder={() => true}
        />
      ) : null}

      {/* Left blocker */}
      {x > 0 ? (
        <View
          style={[
            styles.blocker,
            { top: y, left: 0, width: Math.max(0, x), height },
          ]}
          pointerEvents="auto"
          onStartShouldSetResponder={() => true}
        />
      ) : null}

      {/* Right blocker */}
      {screenWidth > x + width ? (
        <View
          style={[
            styles.blocker,
            { top: y, left: x + width, right: 0, height },
          ]}
          pointerEvents="auto"
          onStartShouldSetResponder={() => true}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  maskRoot: {
    zIndex: 90000,
    elevation: 90000,
  },
  blocker: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
});
