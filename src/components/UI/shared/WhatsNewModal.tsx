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
} from 'react-native';
import { whatsNewService } from '../../../services/whatsNew/whatsNewService';
import type { WhatsNewRelease } from '../../../config/whatsNew';
import {
  resolveThemeColors,
  MODAL_CTA_COLOR,
} from '../../../theme/colors';

export default function WhatsNewModal() {
  const [release, setRelease] = React.useState<WhatsNewRelease | null>(null);
  const colorScheme = useColorScheme();
  const palette = resolveThemeColors(colorScheme);
  const isDark = colorScheme !== 'light';

  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.92)).current;

  React.useEffect(() => {
    let isMounted = true;

    async function checkRelease() {
      const data = await whatsNewService.checkShouldShow();
      if (!isMounted || !data) return;

      setRelease(data);
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.92);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    }

    void checkRelease();

    return () => {
      isMounted = false;
    };
  }, [fadeAnim, scaleAnim]);

  const handleDismiss = React.useCallback(() => {
    if (!release) return;
    const targetVersion = release.version;

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setRelease(null);
      void whatsNewService.markAsSeen(targetVersion);
    });
  }, [release, fadeAnim]);

  if (!release) return null;

  return (
    <Modal
      transparent
      visible={Boolean(release)}
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#082847' : '#FFFFFF',
              borderColor: isDark ? 'rgba(78,175,244,0.24)' : 'rgba(15,23,42,0.12)',
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Header Row: Badge */}
          <View style={styles.header}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: isDark ? 'rgba(78,175,244,0.16)' : 'rgba(78,175,244,0.12)',
                },
              ]}
            >
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>{release.badge}</Text>
            </View>

            <Text
              style={[
                styles.title,
                { color: isDark ? '#F8FAFC' : '#0F172A' },
              ]}
            >
              {release.title}
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: palette.secondaryText },
              ]}
            >
              {release.subtitle}
            </Text>
          </View>

          {/* Numbered Feature List (Plain Numbers, No Pills) */}
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
                      { color: isDark ? '#F8FAFC' : '#0F172A' },
                    ]}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={[
                      styles.itemDescription,
                      { color: palette.secondaryText },
                    ]}
                  >
                    {item.description}
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
                pressed && styles.primaryBtnPressed,
              ]}
              onPress={handleDismiss}
            >
              <Text style={styles.primaryBtnText}>開始體驗</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 33, 61, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 9999,
  },
  card: {
    width: Math.min(width - 40, 380),
    maxHeight: 580,
    borderRadius: 32,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    marginBottom: 12,
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: MODAL_CTA_COLOR,
  },
  badgeText: {
    color: MODAL_CTA_COLOR,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  listContainer: {
    maxHeight: 300,
  },
  listContent: {
    paddingVertical: 4,
    gap: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  itemNumber: {
    color: MODAL_CTA_COLOR,
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 1,
    width: 24,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 3,
  },
  itemDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 18,
    marginTop: 16,
  },
  primaryBtn: {
    backgroundColor: MODAL_CTA_COLOR,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: MODAL_CTA_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
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
