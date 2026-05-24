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
import Reanimated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

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
};

const ELEGANT_SPRING = { damping: 30, stiffness: 140, mass: 1 } as const;
const SPOTLIGHT_SCALE = 1;
const TOOLTIP_WIDTH = 284;
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
}: Props) {
  const anchorRef = React.useRef<View | null>(null);
  const [layout, setLayout] = React.useState<WindowLayout | null>(null);
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

  const tooltipTop = React.useMemo(() => {
    if (!layout) return 120;
    const below = layout.pageY + layout.height + 26;
    const above = layout.pageY - 120;
    if (below + 108 < windowHeight) return below;
    return Math.max(70, above);
  }, [layout, windowHeight]);

  const tooltipLeft = React.useMemo(() => {
    if (!layout) return 24;
    const centered = layout.pageX + layout.width / 2 - TOOLTIP_WIDTH / 2;
    return Math.max(18, Math.min(centered, windowWidth - TOOLTIP_WIDTH - 18));
  }, [layout, windowWidth]);

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={style} onLayout={active ? measureAnchor : undefined}>
        {children}
      </View>

      <Modal visible={active && !!layout} transparent animationType="none" statusBarTranslucent presentationStyle="overFullScreen">
        <Pressable style={StyleSheet.absoluteFill} onPress={onSpotlightPress}>
          <AnimatedBlurView tint="dark" intensity={100} pointerEvents="none" style={[styles.blurLayer, blurStyle]} />
          <Reanimated.View pointerEvents="none" style={[styles.dimLayer, blurStyle]} />

          {layout ? (
            <Reanimated.View
              pointerEvents="none"
              style={[
                styles.cloneLayer,
                cloneStyle,
                {
                  top: layout.pageY,
                  left: layout.pageX,
                  width: layout.width,
                  height: layout.height,
                },
              ]}
            >
              {React.cloneElement(children as React.ReactElement<any>, {
                pointerEvents: 'none',
              })}
            </Reanimated.View>
          ) : null}
        </Pressable>

        {layout ? (
          <Reanimated.View
            pointerEvents="none"
            entering={FadeIn.delay(TOOLTIP_DELAY_MS).duration(260)}
            exiting={FadeOut.duration(TOUR_FADE_OUT_MS)}
            style={[
              styles.tooltip,
              isDarkMode ? styles.tooltipDarkModeLightBox : null,
              { top: tooltipTop, left: tooltipLeft },
            ]}
          >
            <Text style={[styles.tooltipText, isDarkMode ? styles.tooltipTextDarkModeLightBox : null]}>
              {tooltip}
            </Text>
          </Reanimated.View>
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
  cloneLayer: {
    position: 'absolute',
    zIndex: 30,
    overflow: 'visible',
  },
  tooltip: {
    position: 'absolute',
    zIndex: 40,
    width: TOOLTIP_WIDTH,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(2,33,61,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(137,206,255,0.38)',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  tooltipText: {
    color: '#F8FAFC',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
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
});
