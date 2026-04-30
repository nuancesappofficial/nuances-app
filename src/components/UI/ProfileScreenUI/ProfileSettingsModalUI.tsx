import React from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { AIReplyLanguage } from '@services/settings/userSettings';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import { TEXT_ON_CTA, CTA_COLOR, CTA_COLOR_BORDER } from '../../../theme/colors';

const AI_LANGUAGE_OPTIONS: Array<{ code: AIReplyLanguage; label: string }> = [
  { code: 'zh-TW', label: '繁中' },
  { code: 'zh-CN', label: '简中' },
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];

type Props = {
  visible: boolean;
  renderAsStaticPage?: boolean;
  savingEntitlement: boolean;
  entitlementMode: 'guest' | 'premium';
  aiReplyLanguage: AIReplyLanguage;
  onClose: () => void;
  onPressUploadProfilePic: () => void;
  onToggleEntitlement: () => void;
  onChangeAIReplyLanguage: (language: AIReplyLanguage) => void;
};

const OVERLAY_ENTRY_DURATION_MS = 240;
const OVERLAY_EXIT_DURATION_MS = 180;
const PAGE_ENTRY_DURATION_MS = 520;
const PAGE_EXIT_DURATION_MS = 340;

export default function ProfileSettingsModalUI({
  visible,
  renderAsStaticPage = false,
  savingEntitlement,
  entitlementMode,
  aiReplyLanguage,
  onClose,
  onPressUploadProfilePic,
  onToggleEntitlement,
  onChangeAIReplyLanguage,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const [mounted, setMounted] = React.useState(visible);
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const pageTranslateX = React.useRef(new Animated.Value(screenWidth)).current;
  const lastVisibleRef = React.useRef(visible);

  React.useEffect(() => {
    const wasVisible = lastVisibleRef.current;
    lastVisibleRef.current = visible;

    if (visible) {
      if (wasVisible) return;
      setMounted(true);
      overlayOpacity.setValue(0);
      pageTranslateX.setValue(screenWidth * 1.04);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: OVERLAY_ENTRY_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pageTranslateX, {
          toValue: 0,
          duration: PAGE_ENTRY_DURATION_MS,
          easing: Easing.bezier(0.16, 0.84, 0.24, 1),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!wasVisible) return;
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: OVERLAY_EXIT_DURATION_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pageTranslateX, {
        toValue: screenWidth,
        duration: PAGE_EXIT_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [overlayOpacity, pageTranslateX, screenWidth, visible]);

  if (renderAsStaticPage) {
    return (
      <View style={styles.page}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.85} onPress={onClose}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.eyebrow}>PROFILE</Text>
            <View style={styles.headerIconBtnGhost} />
          </View>

          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Personalize your profile and AI response language.</Text>

          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9} onPress={onPressUploadProfilePic}>
            <Text style={styles.primaryButtonText}>Upload profile pic</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.9} onPress={onToggleEntitlement}>
            <Text style={styles.secondaryButtonText}>
              {savingEntitlement
                ? 'Updating...'
                : entitlementMode === 'premium'
                  ? 'Switch to Guest'
                  : 'Switch to Premium'}
            </Text>
          </TouchableOpacity>

          <View style={styles.languageSection}>
            <Text style={styles.languageTitle}>AI Reply Language</Text>
            <View style={styles.languageOptionsRow}>
              {AI_LANGUAGE_OPTIONS.map((option) => {
                const active = option.code === aiReplyLanguage;
                return (
                  <TouchableOpacity
                    key={option.code}
                    style={[styles.languageOption, active && styles.languageOptionActive]}
                    activeOpacity={0.86}
                    onPress={() => onChangeAIReplyLanguage(option.code)}
                  >
                    <Text style={[styles.languageOptionText, active && styles.languageOptionTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.page,
          {
            width: screenWidth,
            transform: [{ translateX: pageTranslateX }],
          },
        ]}
      >
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.85} onPress={onClose}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.eyebrow}>PROFILE</Text>
            <View style={styles.headerIconBtnGhost} />
          </View>

          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Personalize your profile and AI response language.</Text>

          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9} onPress={onPressUploadProfilePic}>
            <Text style={styles.primaryButtonText}>Upload profile pic</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.9} onPress={onToggleEntitlement}>
            <Text style={styles.secondaryButtonText}>
              {savingEntitlement
                ? 'Updating...'
                : entitlementMode === 'premium'
                  ? 'Switch to Guest'
                  : 'Switch to Premium'}
            </Text>
          </TouchableOpacity>

          <View style={styles.languageSection}>
            <Text style={styles.languageTitle}>AI Reply Language</Text>
            <View style={styles.languageOptionsRow}>
              {AI_LANGUAGE_OPTIONS.map((option) => {
                const active = option.code === aiReplyLanguage;
                return (
                  <TouchableOpacity
                    key={option.code}
                    style={[styles.languageOption, active && styles.languageOptionActive]}
                    activeOpacity={0.86}
                    onPress={() => onChangeAIReplyLanguage(option.code)}
                  >
                    <Text style={[styles.languageOptionText, active && styles.languageOptionTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 12, 18, 0.45)',
  },
  page: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#02213D',
    zIndex: 20,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  headerIconBtnGhost: {
    width: 40,
    height: 40,
  },
  eyebrow: {
    color: '#8D93A1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#B4BBC8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  primaryButton: {
    borderRadius: BUTTON_TOKENS.radius.md,
    minHeight: BUTTON_TOKENS.height.regular,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CTA_COLOR,
    marginBottom: 10,
  },
  primaryButtonText: {
    color: TEXT_ON_CTA,
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  secondaryButton: {
    borderRadius: BUTTON_TOKENS.radius.md,
    minHeight: BUTTON_TOKENS.height.regular,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  languageSection: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  languageTitle: {
    color: '#97A0AF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  languageOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageOption: {
    borderRadius: BUTTON_TOKENS.radius.md,
    minHeight: BUTTON_TOKENS.height.regular,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  languageOptionActive: {
    backgroundColor: CTA_COLOR,
    borderColor: CTA_COLOR_BORDER,
  },
  languageOptionText: {
    color: '#FFFFFF',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  languageOptionTextActive: {
    color: TEXT_ON_CTA,
  },
});
