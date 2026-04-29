import React from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AIReplyLanguage, AppThemeName } from '@services/settings/userSettings';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';

const AI_LANGUAGE_OPTIONS: Array<{ code: AIReplyLanguage; label: string }> = [
  { code: 'zh-TW', label: '繁中' },
  { code: 'zh-CN', label: '简中' },
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];
const APP_THEME_OPTIONS: Array<{ code: AppThemeName; label: string }> = [
  { code: 'black', label: 'Black' },
  { code: 'white', label: 'White' },
  { code: 'blue', label: 'Blue' },
];

type Props = {
  visible: boolean;
  savingEntitlement: boolean;
  entitlementMode: 'guest' | 'premium';
  aiReplyLanguage: AIReplyLanguage;
  appTheme: AppThemeName;
  onClose: () => void;
  onPressUploadProfilePic: () => void;
  onToggleEntitlement: () => void;
  onChangeAIReplyLanguage: (language: AIReplyLanguage) => void;
  onChangeTheme: (theme: AppThemeName) => void;
};

export default function ProfileSettingsModalUI({
  visible,
  savingEntitlement,
  entitlementMode,
  aiReplyLanguage,
  appTheme,
  onClose,
  onPressUploadProfilePic,
  onToggleEntitlement,
  onChangeAIReplyLanguage,
  onChangeTheme,
}: Props) {
  const [mounted, setMounted] = React.useState(visible);
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const sheetTranslateY = React.useRef(new Animated.Value(48)).current;

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 18,
          stiffness: 180,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 48,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [overlayOpacity, sheetTranslateY, visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <Animated.View
            style={[
              styles.sheet,
              {
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            <View style={styles.handle} />
            <Text style={styles.title}>Settings</Text>

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

            <View style={styles.languageSection}>
              <Text style={styles.languageTitle}>Theme</Text>
              <View style={styles.languageOptionsRow}>
                {APP_THEME_OPTIONS.map((option) => {
                  const active = option.code === appTheme;
                  return (
                    <TouchableOpacity
                      key={option.code}
                      style={[styles.languageOption, active && styles.languageOptionActive]}
                      activeOpacity={0.86}
                      onPress={() => onChangeTheme(option.code)}
                    >
                      <Text style={[styles.languageOptionText, active && styles.languageOptionTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity style={styles.closeButton} activeOpacity={0.85} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 18, 0.45)',
    justifyContent: 'flex-end',
  },
  safeArea: {
    width: '100%',
  },
  sheet: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 16,
    textAlign: 'center',
  },
  primaryButton: {
    borderRadius: BUTTON_TOKENS.radius.lg,
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  secondaryButton: {
    borderRadius: BUTTON_TOKENS.radius.lg,
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F7',
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: '#111111',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  languageSection: {
    borderRadius: 18,
    backgroundColor: '#EEF2F7',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  languageTitle: {
    color: '#4D5562',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  languageOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageOption: {
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.09)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  languageOptionActive: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },
  languageOptionText: {
    color: '#2B3340',
    fontSize: 12,
    fontWeight: '700',
  },
  languageOptionTextActive: {
    color: '#FFFFFF',
  },
  closeButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#5C6470',
    fontSize: 14,
    fontWeight: '600',
  },
});
