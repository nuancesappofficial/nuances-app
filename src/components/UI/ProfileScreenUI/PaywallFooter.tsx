import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { tUI } from '../../../i18n/uiLanguage';
import type { UILanguage } from '@services/settings/userSettings';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../../../constants/legalLinks';

type Props = {
  style?: StyleProp<ViewStyle>;
  uiLanguage: UILanguage;
};

export default function PaywallFooter({ style, uiLanguage }: Props) {
  const openUrl = React.useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn('[PaywallFooter] failed to open legal link:', error);
      Alert.alert(tUI(uiLanguage, 'common.unableToOpenLink'));
    }
  }, [uiLanguage]);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.linkRow}>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          style={({ pressed }) => [styles.linkPressable, pressed ? styles.linkPressed : null]}
          onPress={() => void openUrl(PRIVACY_POLICY_URL)}
        >
          <Text style={styles.linkText}>
            {tUI(uiLanguage, 'profile.privacyPolicy')}
          </Text>
        </Pressable>

        <Text style={styles.divider}>•</Text>

        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          style={({ pressed }) => [styles.linkPressable, pressed ? styles.linkPressed : null]}
          onPress={() => void openUrl(TERMS_OF_SERVICE_URL)}
        >
          <Text style={styles.linkText}>
            {tUI(uiLanguage, 'profile.termsOfService')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 18,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  linkPressable: {
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  linkPressed: {
    opacity: 0.62,
    transform: [{ scale: 0.985 }],
  },
  linkText: {
    color: '#8E8E93',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  divider: {
    color: '#8E8E93',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    opacity: 0.7,
  },
});
