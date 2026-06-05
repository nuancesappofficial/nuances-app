import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

const PRIVACY_POLICY_URL = 'https://example.com/privacy-policy';
const TERMS_OF_SERVICE_URL = 'https://example.com/terms-of-service';

type Props = {
  style?: StyleProp<ViewStyle>;
};

export default function PaywallFooter({ style }: Props) {
  const openUrl = React.useCallback((url: string) => {
    void Linking.openURL(url);
  }, []);

  return (
    <View style={[styles.container, style]}>
      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        style={({ pressed }) => [styles.linkPressable, pressed ? styles.linkPressed : null]}
        onPress={() => openUrl(PRIVACY_POLICY_URL)}
      >
        <Text style={styles.linkText}>Privacy Policy</Text>
      </Pressable>

      <Text style={styles.divider}>•</Text>

      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        style={({ pressed }) => [styles.linkPressable, pressed ? styles.linkPressed : null]}
        onPress={() => openUrl(TERMS_OF_SERVICE_URL)}
      >
        <Text style={styles.linkText}>Terms of Service</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
