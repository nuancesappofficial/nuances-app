import * as Notifications from 'expo-notifications';
import { loadUserSettings, type AIReplyLanguage, type PlanType } from '../settings/userSettings';

const TRIAL_ENDING_REMINDER_ID = 'nuances-trial-ending-reminder';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function trialReminderCopy(language: AIReplyLanguage): { title: string; body: string } {
  if (language === 'zh-CN') {
    return {
      title: 'Nuances 试用即将结束',
      body: '你的试用将于明天结束。你可以随时到 Apple 订阅设置管理或取消。',
    };
  }
  if (language === 'zh-TW') {
    return {
      title: 'Nuances 試用即將結束',
      body: '你的試用將於明天結束。你可以隨時到 Apple 訂閱設定管理或取消。',
    };
  }
  if (language === 'ja') return {
    title: 'Nuancesのトライアルはまもなく終了します',
    body: 'トライアルは明日終了します。Appleのサブスクリプション設定からいつでも管理またはキャンセルできます。',
  };
  if (language === 'ko') return {
    title: 'Nuances 체험 기간이 곧 종료돼요',
    body: '체험 기간이 내일 종료됩니다. Apple 구독 설정에서 언제든지 관리하거나 취소할 수 있어요.',
  };
  if (language === 'es') return {
    title: 'Tu prueba de Nuances termina pronto',
    body: 'Tu prueba termina mañana. Puedes gestionarla o cancelarla en cualquier momento en los ajustes de suscripciones de Apple.',
  };
  if (language === 'fr') return {
    title: 'Votre essai Nuances se termine bientôt',
    body: 'Votre essai se termine demain. Vous pouvez le gérer ou l’annuler à tout moment dans les réglages des abonnements Apple.',
  };
  return {
    title: 'Nuances trial ends soon',
    body: 'Your trial ends tomorrow. Manage or cancel anytime in Apple subscription settings.',
  };
}

function getReminderDate(trialEndsAt: string, now = Date.now()): Date | null {
  const trialEndMs = Date.parse(trialEndsAt);
  if (!Number.isFinite(trialEndMs) || trialEndMs <= now) return null;

  const preferred = trialEndMs - DAY_MS;
  if (preferred > now + 60 * 1000) return new Date(preferred);

  const fallback = trialEndMs - HOUR_MS;
  if (fallback > now + 60 * 1000) return new Date(fallback);

  return null;
}

async function cancelTrialEndingReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(TRIAL_ENDING_REMINDER_ID).catch(() => undefined);
}

const TrialNotificationService = {
  async reconcile(params: {
    planType: PlanType;
    trialEndsAt: string | null;
  }): Promise<void> {
    await cancelTrialEndingReminder();

    if (params.planType !== 'trial' || !params.trialEndsAt) return;

    const settings = await loadUserSettings();
    if (!settings.reminderNotificationsEnabled) return;

    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;

    const reminderDate = getReminderDate(params.trialEndsAt);
    if (!reminderDate) return;

    const copy = trialReminderCopy(settings.aiReplyLanguage);
    await Notifications.scheduleNotificationAsync({
      identifier: TRIAL_ENDING_REMINDER_ID,
      content: {
        title: copy.title,
        body: copy.body,
        sound: true,
        data: {
          kind: 'nuances-trial-ending-reminder',
          trialEndsAt: params.trialEndsAt,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
      },
    });
  },

  async cancelAll(): Promise<void> {
    await cancelTrialEndingReminder();
  },
};

export default TrialNotificationService;
