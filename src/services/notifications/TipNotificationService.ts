import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getCurrentSessionUserId } from '../auth/userIdentity';
import { loadUserSettings, type AIReplyLanguage } from '../settings/userSettings';

const TIP_NOTIFICATION_ID = 'nuances-feature-tip';
const TIP_STATE_KEY_PREFIX = 'nuances_feature_tip_state_v1';

type TipId = 'customize_album' | 'clear_cache' | 'rate_app';

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
  { id: 'clear_cache', delayMs: 4 * 24 * 60 * 60 * 1000, target: 'cache' },
  { id: 'rate_app', delayMs: 7 * 24 * 60 * 60 * 1000, target: 'rate' },
];

function storageKey(userId: string): string {
  return `${TIP_STATE_KEY_PREFIX}:${userId}`;
}

function localizedTip(
  language: AIReplyLanguage,
  id: TipId
): { title: string; body: string } {
  if (language === 'zh-TW') {
    if (id === 'customize_album') {
      return { title: '小提示', body: '長按相簿，就能更換封面、圖示和顏色。' };
    }
    if (id === 'clear_cache') {
      return { title: '小提示', body: '暫存卡片太多時，長按「略過」就能一次清空。' };
    }
    return { title: '喜歡 Nuances 嗎？', body: '花幾秒留下評分，能幫助我們把 Nuances 做得更好。' };
  }
  if (language === 'zh-CN') {
    if (id === 'customize_album') {
      return { title: '小提示', body: '长按相册，就能更换封面、图标和颜色。' };
    }
    if (id === 'clear_cache') {
      return { title: '小提示', body: '暂存卡片太多时，长按“跳过”就能一次清空。' };
    }
    return { title: '喜欢 Nuances 吗？', body: '花几秒留下评分，能帮助我们把 Nuances 做得更好。' };
  }
  if (language === 'ja') {
    if (id === 'customize_album') return { title: 'ヒント', body: 'アルバムを長押しすると、カバーや色を変更できます。' };
    if (id === 'clear_cache') return { title: 'ヒント', body: '「スキップ」を長押しすると、保留中のカードをまとめて消去できます。' };
    return { title: 'Nuancesを気に入りましたか？', body: '短いレビューで、より良いアプリづくりを応援してください。' };
  }
  if (language === 'ko') {
    if (id === 'customize_album') return { title: '팁', body: '앨범을 길게 누르면 표지, 아이콘, 색상을 바꿀 수 있어요.' };
    if (id === 'clear_cache') return { title: '팁', body: '“건너뛰기”를 길게 누르면 대기 중인 카드를 한 번에 비울 수 있어요.' };
    return { title: 'Nuances가 마음에 드시나요?', body: '짧은 평가로 더 좋은 Nuances를 만드는 데 힘을 보태 주세요.' };
  }
  if (language === 'es') {
    if (id === 'customize_album') return { title: 'Consejo', body: 'Mantén pulsado un álbum para cambiar su portada, icono y color.' };
    if (id === 'clear_cache') return { title: 'Consejo', body: 'Mantén pulsado “Omitir” para vaciar todas las tarjetas pendientes.' };
    return { title: '¿Te gusta Nuances?', body: 'Una reseña breve nos ayuda a seguir mejorando Nuances.' };
  }
  if (language === 'fr') {
    if (id === 'customize_album') return { title: 'Astuce', body: 'Appuyez longuement sur un album pour modifier sa couverture, son icône et sa couleur.' };
    if (id === 'clear_cache') return { title: 'Astuce', body: 'Appuyez longuement sur « Ignorer » pour vider toutes les cartes en attente.' };
    return { title: 'Vous aimez Nuances ?', body: 'Une courte évaluation nous aide à continuer d’améliorer Nuances.' };
  }
  if (id === 'customize_album') {
    return { title: 'Quick tip', body: 'Press and hold an album to change its cover, icon, and color.' };
  }
  if (id === 'clear_cache') {
    return { title: 'Quick tip', body: 'Press and hold “Skip” to clear every card waiting in your cache.' };
  }
  return { title: 'Enjoying Nuances?', body: 'A quick rating helps us keep making Nuances better.' };
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
    const copy = localizedTip(settings.aiReplyLanguage, nextTip.id);
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
