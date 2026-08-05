import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getCurrentSessionUserId } from '../auth/userIdentity';
import { loadUserSettings, type AIReplyLanguage } from '../settings/userSettings';
import {
  getTipNotificationCopy,
  type TipId,
} from '../../features/notifications/tipNotificationCatalog';

const TIP_NOTIFICATION_ID = 'nuances-feature-tip';
const TIP_STATE_KEY_PREFIX = 'nuances_feature_tip_state_v1';

type TipState = {
  completedIds: TipId[];
  scheduledId?: TipId;
  scheduledFor?: string;
  scheduledLanguage?: AIReplyLanguage;
};

type TipDefinition = {
  id: TipId;
  delayMs: number;
  target: 'deck' | 'cache' | 'rate';
};

const TIP_SEQUENCE: TipDefinition[] = [
  { id: 'customize_album', delayMs: 36 * 60 * 60 * 1000, target: 'deck' },
  { id: 'correct_scanned_word', delayMs: 3 * 24 * 60 * 60 * 1000, target: 'cache' },
  { id: 'clear_cache', delayMs: 4 * 24 * 60 * 60 * 1000, target: 'cache' },
  { id: 'rate_app', delayMs: 7 * 24 * 60 * 60 * 1000, target: 'rate' },
];

function storageKey(userId: string): string {
  return `${TIP_STATE_KEY_PREFIX}:${userId}`;
}

async function loadState(userId: string): Promise<TipState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return { completedIds: [] };
    const parsed = JSON.parse(raw) as Partial<TipState>;
    return {
      completedIds: Array.isArray(parsed.completedIds)
        ? parsed.completedIds.filter((id): id is TipId => TIP_SEQUENCE.some((tip) => tip.id === id))
        : [],
      scheduledId: parsed.scheduledId,
      scheduledFor: parsed.scheduledFor,
      scheduledLanguage: parsed.scheduledLanguage,
    };
  } catch {
    return { completedIds: [] };
  }
}

async function saveState(userId: string, state: TipState): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(state));
}

const TipNotificationService = {
  async reconcile(): Promise<void> {
    const userId = await getCurrentSessionUserId();
    if (!userId) return;

    const [settings, permission] = await Promise.all([
      loadUserSettings(),
      Notifications.getPermissionsAsync(),
    ]);
    if (!settings.reminderNotificationsEnabled || !permission.granted) return;

    const now = Date.now();
    const state = await loadState(userId);
    const scheduledAt = state.scheduledFor ? new Date(state.scheduledFor).getTime() : Number.NaN;

    if (state.scheduledId && Number.isFinite(scheduledAt) && scheduledAt <= now) {
      state.completedIds = Array.from(new Set([...state.completedIds, state.scheduledId]));
      state.scheduledId = undefined;
      state.scheduledFor = undefined;
      await saveState(userId, state);
    }

    if (
      state.scheduledId &&
      Number.isFinite(scheduledAt) &&
      scheduledAt > now &&
      state.scheduledLanguage === settings.aiReplyLanguage
    ) return;

    const nextTip = TIP_SEQUENCE.find((tip) => !state.completedIds.includes(tip.id));
    if (!nextTip) {
      await Notifications.cancelScheduledNotificationAsync(TIP_NOTIFICATION_ID).catch(() => undefined);
      return;
    }

    const triggerDate = new Date(now + nextTip.delayMs);
    const copy = getTipNotificationCopy(settings.aiReplyLanguage, nextTip.id);
    await Notifications.cancelScheduledNotificationAsync(TIP_NOTIFICATION_ID).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier: TIP_NOTIFICATION_ID,
      content: {
        title: copy.title,
        body: copy.body,
        sound: true,
        data: { kind: 'nuances-tip', tipId: nextTip.id, target: nextTip.target },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
    await saveState(userId, {
      ...state,
      scheduledId: nextTip.id,
      scheduledFor: triggerDate.toISOString(),
      scheduledLanguage: settings.aiReplyLanguage,
    });
  },

  async cancelScheduled(): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(TIP_NOTIFICATION_ID).catch(() => undefined);
  },
};

export default TipNotificationService;
