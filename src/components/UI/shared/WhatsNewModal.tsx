import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Animated,
  useColorScheme,
  ScrollView,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { whatsNewService } from '../../../services/whatsNew/whatsNewService';
import type { WhatsNewRelease } from '../../../config/whatsNew';
import {
  resolveThemeColors,
  MODAL_CTA_COLOR,
} from '../../../theme/colors';

const BOTTOM_SHEET_INITIAL_Y = 500;

export default function WhatsNewModal() {
  const [release, setRelease] = React.useState<WhatsNewRelease | null>(null);
  const colorScheme = useColorScheme();
  const palette = resolveThemeColors(colorScheme);
  const isDark = colorScheme !== 'light';
  const insets = useSafeAreaInsets();

  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const translateYAnim = React.useRef(new Animated.Value(BOTTOM_SHEET_INITIAL_Y)).current;

  React.useEffect(() => {
    let isMounted = true;

    async function checkRelease() {
      const data = await whatsNewService.checkShouldShow();
      if (!isMounted || !data) return;

      setRelease(data);
      fadeAnim.setValue(0);
      translateYAnim.setValue(BOTTOM_SHEET_INITIAL_Y);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          friction: 8,
          tension: 45,
          useNativeDriver: true,
        }),
      ]).start();
    }

    void checkRelease();

    return () => {
      isMounted = false;
    };
  }, [fadeAnim, translateYAnim]);

  const handleDismiss = React.useCallback(() => {
    if (!release) return;
    const targetVersion = release.version;

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: BOTTOM_SHEET_INITIAL_Y,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setRelease(null);
      void whatsNewService.markAsSeen(targetVersion);
    });
  }, [release, fadeAnim, translateYAnim]);

  if (!release) return null;

  return (
    <Modal
      transparent
      visible={Boolean(release)}
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <View
        style={[
          styles.overlay,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(15, 23, 42, 0.08)',
              opacity: fadeAnim,
              transform: [{ translateY: translateYAnim }],
            },
          ]}
        >
          {/* Header Title */}
          <View style={styles.header}>
            <Text
              style={[
                styles.title,
                { color: isDark ? '#FFFFFF' : '#0F172A' },
              ]}
            >
              {release.title || '更新功能'}
            </Text>
          </View>

          {/* Numbered Feature List (Plain Numbers, No Secondary Text) */}
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {release.items.map((item) => (
              <View key={item.number} style={styles.itemRow}>
                <Text style={styles.itemNumber}>{item.number}</Text>
                <View style={styles.itemTextContainer}>
                  <Text
                    style={[
                      styles.itemTitle,
                      { color: isDark ? '#FFFFFF' : '#0F172A' },
                    ]}
                  >
                    {item.title}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Bottom Primary Button */}
          <View
            style={[
              styles.footer,
              {
                borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
              },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: isDark ? MODAL_CTA_COLOR : '#0F172A',
                },
                pressed && styles.primaryBtnPressed,
              ]}
              onPress={handleDismiss}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: isDark ? '#02213D' : '#FFFFFF' },
                ]}
              >
                Continue
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const { width, height } = Dimensions.get('window');
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 9999,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: Math.min(height * 0.82, 640),
    borderRadius: 32,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.36,
    shadowRadius: 28,
    elevation: 20,
  },
  header: {
    alignItems: 'center',
    paddingTop: 4,
    marginBottom: 22,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  listContainer: {
    maxHeight: 280,
  },
  listContent: {
    paddingVertical: 4,
    gap: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  itemNumber: {
    color: MODAL_CTA_COLOR,
    fontFamily: 'Courier',
    fontSize: 17,
    fontWeight: '800',
    width: 18,
    textAlign: 'center',
  },
  itemTextContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 18,
    marginTop: 20,
  },
  primaryBtn: {
    backgroundColor: MODAL_CTA_COLOR,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryBtnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  primaryBtnText: {
    color: '#02213D',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
