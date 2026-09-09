import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTour } from '../../../contexts/AppTourContext';
import { getTourStepProgress } from '../../../features/tour/tutorialStepProgress';
import { tUI, type UILanguage } from '../../../i18n/uiLanguage';
import { loadUserSettings } from '../../../services/settings/userSettings';
import { MODAL_CTA_COLOR, MODAL_CTA_COLOR_BORDER } from '../../../theme/colors';

type Props = {
  uiLanguage?: UILanguage;
};

export default function TutorialHeaderOverlay({ uiLanguage: propUiLanguage }: Props) {
  const [effectiveLang, setEffectiveLang] = React.useState<UILanguage>(propUiLanguage || 'en');
  const appTour = useAppTour();
  const insets = useSafeAreaInsets();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const opacityAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (propUiLanguage) {
      setEffectiveLang(propUiLanguage);
      return;
    }
    void loadUserSettings().then((s) => {
      if (s?.uiLanguage) setEffectiveLang(s.uiLanguage);
    });
  }, [propUiLanguage]);

  if (!appTour.isActive) return null;

  const { current, total } = getTourStepProgress(appTour.step);
  if (current === 0) return null;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 0.94, useNativeDriver: true, speed: 40, bounciness: 0 }),
      Animated.timing(opacityAnim, { toValue: 0.82, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 4 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={styles.fullscreenRoot} pointerEvents="box-none">
      <View
        style={[
          styles.container,
          { top: Math.max(insets.top, 12) + 4 },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.row}>
          <Pressable
            onPress={() => appTour.skipTour()}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            hitSlop={12}
          >
            <Animated.View
              style={[
                styles.skipButton,
                { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
              ]}
            >
              <Text style={styles.skipText}>
                {tUI(effectiveLang, 'tour.skip')}
                {'  '}
                <Text style={styles.progressInline}>{current} / {total}</Text>
              </Text>
            </Animated.View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
  },
  container: {
    position: 'absolute',
    left: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skipButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: MODAL_CTA_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  progressInline: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});

