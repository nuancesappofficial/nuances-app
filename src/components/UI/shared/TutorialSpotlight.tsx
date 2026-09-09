import React from 'react';
import {
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppTour } from '../../../contexts/AppTourContext';

type Props = {
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onSpotlightPress?: () => void;
};

export default function TutorialSpotlight({
  active,
  children,
  style,
}: Props) {
  const anchorRef = React.useRef<View | null>(null);
  const { setSpotlightRect } = useAppTour();

  const measureAnchor = React.useCallback(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      anchorRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setSpotlightRect({ x, y, width, height });
        }
      });
    });
  }, [active, setSpotlightRect]);

  React.useEffect(() => {
    if (!active) return;

    measureAnchor();
    const timers = [60, 180, 360, 600].map((ms) => setTimeout(measureAnchor, ms));
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [active, measureAnchor]);

  return (
    <View
      ref={anchorRef}
      collapsable={false}
      style={style}
      onLayout={active ? measureAnchor : undefined}
    >
      {children}
    </View>
  );
}
