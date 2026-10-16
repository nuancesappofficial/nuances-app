import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  Dimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { inAppMessageService, type AppMessage } from '../../../services/notifications/inAppMessageService';

export default function InAppMessageModal() {
  const [activeMessage, setActiveMessage] = React.useState<AppMessage | null>(null);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.92)).current;

  React.useEffect(() => {
    const unsubscribe = inAppMessageService.subscribe((message) => {
      setActiveMessage(message);
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
    });

    return () => {
      unsubscribe();
    };
  }, [fadeAnim, scaleAnim]);

  const handleDismiss = React.useCallback(() => {
    if (!activeMessage) return;
    const msgId = activeMessage.id;

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setActiveMessage(null);
      void inAppMessageService.markAsRead(msgId);
    });
  }, [activeMessage, fadeAnim]);

  const handleAction = React.useCallback(() => {
    if (!activeMessage) return;
    const url = activeMessage.action_url;
    handleDismiss();

    if (url) {
      setTimeout(() => {
        void Linking.openURL(url).catch((err) => {
          console.warn('[InAppMessageModal] Failed to open action URL:', err);
        });
      }, 250);
    }
  }, [activeMessage, handleDismiss]);

  if (!activeMessage) return null;

  const priorityColor =
    activeMessage.priority === 'urgent'
      ? '#EF4444'
      : activeMessage.priority === 'high'
      ? '#F59E0B'
      : '#10B981';

  const priorityLabel =
    activeMessage.priority === 'urgent'
      ? '緊急通知'
      : activeMessage.priority === 'high'
      ? '重要消息'
      : '系統公告';

  const priorityIcon =
    activeMessage.priority === 'urgent'
      ? 'alert-circle'
      : activeMessage.priority === 'high'
      ? 'notifications'
      : 'information-circle';

  return (
    <Modal
      transparent
      visible={Boolean(activeMessage)}
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        <Animated.View
          style={[
            styles.card,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Header Row: Badge & Close Button */}
          <View style={styles.headerRow}>
            <View style={[styles.badge, { backgroundColor: `${priorityColor}18` }]}>
              <Ionicons name={priorityIcon} size={14} color={priorityColor} style={styles.badgeIcon} />
              <Text style={[styles.badgeText, { color: priorityColor }]}>{priorityLabel}</Text>
            </View>
            <Pressable hitSlop={12} onPress={handleDismiss} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </Pressable>
          </View>

          {/* Title & Body */}
          <Text style={styles.title}>{activeMessage.title}</Text>
          <Text style={styles.body}>{activeMessage.body}</Text>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            {activeMessage.action_url ? (
              <Pressable style={[styles.primaryBtn, { backgroundColor: priorityColor }]} onPress={handleAction}>
                <Text style={styles.primaryBtnText}>
                  {activeMessage.action_text || '立即查看'}
                </Text>
                <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
              </Pressable>
            ) : null}
            <Pressable
              style={[
                styles.dismissBtn,
                !activeMessage.action_url && styles.dismissBtnFull,
              ]}
              onPress={handleDismiss}
            >
              <Text style={[styles.dismissBtnText, !activeMessage.action_url && styles.dismissBtnTextFull]}>
                知道了
              </Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 9999,
  },
  card: {
    width: Math.min(width - 48, 380),
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeIcon: {
    marginRight: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  closeBtn: {
    padding: 4,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 25,
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dismissBtn: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  dismissBtnFull: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  dismissBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  dismissBtnTextFull: {
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '700',
  },
});
