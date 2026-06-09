import React from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAppTour } from '../../../contexts/AppTourContext';

type WindowLayout = LayoutRectangle & {
  pageX: number;
  pageY: number;
};

type Props = {
  active: boolean;
  tooltip: string;
  children: React.ReactElement;
  style?: StyleProp<ViewStyle>;
  onSpotlightPress: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  showSkip?: boolean;
};

const ELEGANT_SPRING = { damping: 30, stiffness: 140, mass: 1 } as const;
const SPOTLIGHT_SCALE = 1;
const TOUR_FADE_IN_MS = 420;
const TOUR_FADE_OUT_MS = 180;
const TOOLTIP_DELAY_MS = 220;
const DARK_MODE_TOOLTIP_BG = '#F1EBE3';
const DARK_MODE_TOOLTIP_TEXT = '#0F172A';

export default function TutorialSpotlight({
  active,
  tooltip,
  children,
  style,
  onSpotlightPress,
  onSkip,
  skipLabel = 'Skip tutorial',
  showSkip = true,
}: Props) {
  const anchorRef = React.useRef<View | null>(null);
  const [layout, setLayout] = React.useState<WindowLayout | null>(null);
  const appTour = useAppTour();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme !== 'light';
  const visibleProgress = useSharedValue(0);
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
  const AnimatedBlurView = React.useMemo(() => Reanimated.createAnimatedComponent(BlurView), []);

  const measureAnchor = React.useCallback(() => {
    requestAnimationFrame(() => {
      anchorRef.current?.measureInWindow((pageX, pageY, width, height) => {
        if (width <= 0 || height <= 0) return;
        setLayout({ x: 0, y: 0, pageX, pageY, width, height });
      });
    });
  }, []);

  React.useEffect(() => {
    if (!active) {
      visibleProgress.value = withTiming(0, { duration: TOUR_FADE_OUT_MS });
      return;
    }
    measureAnchor();
    const retryTimers = [80, 180, 320].map((delay) => setTimeout(measureAnchor, delay));
    visibleProgress.value = withTiming(1, { duration: TOUR_FADE_IN_MS });
    return () => {
      retryTimers.forEach(clearTimeout);
    };
  }, [active, measureAnchor, visibleProgress]);

  const blurStyle = useAnimatedStyle(() => ({
    opacity: visibleProgress.value,
  }));

  const cloneStyle = useAnimatedStyle(() => {
    const delayedOpacity = Math.max(0, Math.min(1, (visibleProgress.value - 0.22) / 0.78));
    return {
      opacity: delayedOpacity,
      transform: [{ scale: withSpring(active ? SPOTLIGHT_SCALE : 1, ELEGANT_SPRING) }],
    };
  });

  const tooltipLayout = React.useMemo(() => {
    const horizontalInset = 24;
    const width = Math.min(windowWidth - horizontalInset * 2, 390);
    const left = Math.max(horizontalInset, (windowWidth - width) / 2);
    const top = Math.min(
      windowHeight - insets.bottom - 190,
      Math.max(insets.top + 130, windowHeight * 0.38)
    );
    return { top, left, width };
  }, [insets.bottom, insets.top, windowHeight, windowWidth]);

  const handleSkipPress = React.useCallback(() => {
    if (onSkip) {
      onSkip();
      return;
    }
    appTour.skipTour();
  }, [appTour, onSkip]);

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={style} onLayout={active ? measureAnchor : undefined}>
        {children}
      </View>

      <Modal visible={active && !!layout} transparent animationType="none" statusBarTranslucent presentationStyle="overFullScreen">
        <View style={StyleSheet.absoluteFill}>
          <AnimatedBlurView tint="dark" intensity={100} pointerEvents="none" style={[styles.blurLayer, blurStyle]} />
          <Reanimated.View pointerEvents="none" style={[styles.dimLayer, blurStyle]} />

          {layout ? (
            <Pressable
              hitSlop={8}
              onPress={onSpotlightPress}
              style={[
                styles.clonePressTarget,
                {
                  top: layout.pageY,
                  left: layout.pageX,
                  width: layout.width,
                  height: layout.height,
                },
              ]}
            >
              <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, cloneStyle]}>
                {React.cloneElement(children as React.ReactElement<any>, {
                  pointerEvents: 'none',
                })}
              </Reanimated.View>
            </Pressable>
          ) : null}
        </View>

        {layout ? (
          <Reanimated.View
            pointerEvents="none"
            entering={FadeIn.delay(TOOLTIP_DELAY_MS).duration(260)}
            exiting={FadeOut.duration(TOUR_FADE_OUT_MS)}
            style={[
              styles.tooltip,
              isDarkMode ? styles.tooltipDarkModeLightBox : null,
              tooltipLayout,
            ]}
          >
            <Text style={[styles.tooltipText, isDarkMode ? styles.tooltipTextDarkModeLightBox : null]}>
              {tooltip}
            </Text>
          </Reanimated.View>
        ) : null}

        {showSkip ? (
          <Pressable
            hitSlop={12}
            onPress={handleSkipPress}
            style={[
              styles.skipLink,
              isDarkMode ? styles.skipLinkDarkModeLightBox : null,
              { top: insets.top + 10 },
            ]}
          >
            <Text style={[styles.skipLinkText, isDarkMode ? styles.skipLinkTextDarkMode : null]}>
              {skipLabel}
            </Text>
          </Pressable>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  blurLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  dimLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 11,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  clonePressTarget: {
    position: 'absolute',
    zIndex: 30,
    overflow: 'visible',
  },
  tooltip: {
    position: 'absolute',
    zIndex: 40,
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingVertical: 22,
    backgroundColor: 'rgba(2,33,61,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(137,206,255,0.38)',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.34,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  tooltipText: {
    color: '#F8FAFC',
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  tooltipDarkModeLightBox: {
    backgroundColor: DARK_MODE_TOOLTIP_BG,
    borderColor: 'rgba(15,23,42,0.16)',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
  },
  tooltipTextDarkModeLightBox: {
    color: DARK_MODE_TOOLTIP_TEXT,
  },
  skipLink: {
    position: 'absolute',
    right: 18,
    zIndex: 60,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(15,23,42,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.18)',
  },
  skipLinkText: {
    color: '#F8FAFC',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
  },
  skipLinkTextDarkMode: {
    color: DARK_MODE_TOOLTIP_TEXT,
  },
  skipLinkDarkModeLightBox: {
    backgroundColor: DARK_MODE_TOOLTIP_BG,
    borderColor: 'rgba(15,23,42,0.16)',
  },
});
