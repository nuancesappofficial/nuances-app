import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { loadQuizReviewedCardIds } from '../../features/deck/cardDetailSeen';
import { cancelRetiredNotifications } from '../../features/notifications/retiredNotifications';
import { getCurrentSessionUserId } from '../auth/userIdentity';
import { loadUserSettings, saveUserSettings, type AIReplyLanguage } from '../settings/userSettings';

const REMINDER_MORNING_ID = 'nuances-reminder-morning';
const REMINDER_EVENING_ID = 'nuances-reminder-evening';
const LAST_ACTIVE_AT_KEY = 'nuances_reminders_last_active_at_v1';
const SOFT_PROMPTED_AT_KEY = 'nuances_reminders_soft_prompted_at_v1';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MORNING_HOUR = 9;
const MORNING_MINUTE = 30;
const EVENING_HOUR = 20;
const EVENING_MINUTE = 30;
let permissionPromptInFlight = false;

type ReminderWindow = 'morning' | 'evening';

type PendingReminderCounts = {
  cacheCount: number;
  newWordsCount: number;
};

type ReminderCopy = {
  title: string;
  body: string;
};

type EvaluateOptions = {
  allowSoftPrompt?: boolean;
  markAppActive?: boolean;
};

function toDayKey(input: Date): string {
  const year = input.getFullYear();
  const month = `${input.getMonth() + 1}`.padStart(2, '0');
  const day = `${input.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function notificationTitle(language: AIReplyLanguage): string {
  if (language === 'zh-TW' || language === 'zh-CN') return 'Nuances 有待辦';
  if (language === 'ja') return 'Nuances に未完了の項目があります';
  if (language === 'ko') return 'Nuances에 할 일이 있어요';
  if (language === 'es') return 'Tienes tareas pendientes en Nuances';
  if (language === 'fr') return 'Des éléments vous attendent dans Nuances';
  return 'Nuances is waiting';
}

function bodyForCounts(language: AIReplyLanguage, counts: PendingReminderCounts): string {
  const { cacheCount, newWordsCount } = counts;
  if (language === 'zh-CN') {
    if (cacheCount > 0 && newWordsCount > 0) return `${cacheCount} 张笔记和 ${newWordsCount} 个新词还在等你。`;
    if (cacheCount > 0) return `你有 ${cacheCount} 张笔记还在 Nuances 等处理。`;
    return `${newWordsCount} 个新词还没快速测验。`;
  }
  if (language === 'zh-TW') {
    if (cacheCount > 0 && newWordsCount > 0) return `${cacheCount} 張筆記和 ${newWordsCount} 個新字還在等你。`;
    if (cacheCount > 0) return `你有 ${cacheCount} 張筆記還在 Nuances 等處理。`;
    return `${newWordsCount} 個新字還沒快速測驗。`;
  }
  if (language === 'ja') {
    if (cacheCount > 0 && newWordsCount > 0) return `${cacheCount}件のメモと${newWordsCount}個の新しい単語が待っています。`;
    if (cacheCount > 0) return `Nuancesに未整理のメモが${cacheCount}件あります。`;
    return `${newWordsCount}個の新しい単語がクイッククイズを待っています。`;
  }
  if (language === 'ko') {
    if (cacheCount > 0 && newWordsCount > 0) return `메모 ${cacheCount}개와 새 단어 ${newWordsCount}개가 기다리고 있어요.`;
    if (cacheCount > 0) return `Nuances에 정리할 메모가 ${cacheCount}개 있어요.`;
    return `새 단어 ${newWordsCount}개가 빠른 퀴즈를 기다리고 있어요.`;
  }
  if (language === 'es') {
    if (cacheCount > 0 && newWordsCount > 0) return `Tienes ${cacheCount} notas y ${newWordsCount} palabras nuevas pendientes.`;
    if (cacheCount > 0) return `Tienes ${cacheCount} notas pendientes en Nuances.`;
    return `${newWordsCount} palabras nuevas esperan un quiz rápido.`;
  }
  if (language === 'fr') {
    if (cacheCount > 0 && newWordsCount > 0) return `${cacheCount} notes et ${newWordsCount} nouveaux mots vous attendent.`;
    if (cacheCount > 0) return `${cacheCount} notes vous attendent dans Nuances.`;
    return `${newWordsCount} nouveaux mots attendent un quiz rapide.`;
  }
  if (cacheCount > 0 && newWordsCount > 0) return `${cacheCount} notes and ${newWordsCount} new words are waiting.`;
  if (cacheCount > 0) return `You have ${cacheCount} notes waiting in Nuances.`;
  return `${newWordsCount} new words are waiting for a quick quiz.`;
}

function newInputPrompt(language: AIReplyLanguage, date: Date): ReminderCopy {
  const index = date.getDate() % 4;
  if (language === 'zh-CN') {
    return {
      title: '今天想收进什么？',
      body: [
        '看到值得记下的，就分享给 Nuances。',
        '丢一段文字或一张图片给我，我帮你收着。',
        '今天学到新东西了吗？放进 Nuances 吧。',
        '下一个想记住的内容，交给我。',
      ][index],
    };
  }
  if (language === 'zh-TW') {
    return {
      title: '今天想收進什麼？',
      body: [
        '看到值得記下的，就分享給 Nuances。',
        '丟一段文字或一張圖片給我，我幫你收著。',
        '今天學到新東西了嗎？放進 Nuances 吧。',
        '下一個想記住的內容，交給我。',
      ][index],
    };
  }
  if (language === 'ja') {
    return {
      title: '今日は何を残しますか？',
      body: [
        '覚えておきたいものを見つけたら、Nuancesに共有してください。',
        '文章や画像を送ってください。こちらで預かります。',
        '今日、新しく学んだことはありますか？Nuancesに残しましょう。',
        '次に覚えておきたいものは、こちらにお任せください。',
      ][index],
    };
  }
  if (language === 'ko') {
    return {
      title: '오늘은 무엇을 담아 둘까요?',
      body: [
        '기억해 두고 싶은 내용을 발견하면 Nuances로 공유하세요.',
        '텍스트나 이미지 하나를 보내 주세요. 제가 보관해 둘게요.',
        '오늘 새로 배운 게 있나요? Nuances에 담아 두세요.',
        '다음에 기억하고 싶은 내용은 저한테 맡기세요.',
      ][index],
    };
  }
  if (language === 'es') {
    return {
      title: '¿Qué quieres guardar hoy?',
      body: [
        'Cuando encuentres algo que quieras recordar, compártelo con Nuances.',
        'Envíame un texto o una imagen y te lo guardo.',
        '¿Has aprendido algo nuevo hoy? Guárdalo en Nuances.',
        'Déjame lo próximo que quieras recordar.',
      ][index],
    };
  }
  if (language === 'fr') {
    return {
      title: 'Que voulez-vous garder aujourd’hui ?',
      body: [
        'Quand vous trouvez quelque chose à retenir, partagez-le avec Nuances.',
        'Envoyez-moi un texte ou une image, je vous le garde.',
        'Vous avez appris quelque chose aujourd’hui ? Gardez-le dans Nuances.',
        'Confiez-moi la prochaine chose que vous voulez retenir.',
      ][index],
    };
  }
  return {
    title: 'What will you save today?',
    body: [
      'Found something worth remembering? Share it with Nuances.',
      'Send me a piece of text or an image. I’ll hold onto it.',
      'Learned something new today? Save it to Nuances.',
      'Leave the next thing you want to remember to me.',
    ][index],
  };
}

function softPromptCopy(language: AIReplyLanguage): { title: string; body: string; allow: string; later: string; settingsLater: string } {
  if (language === 'zh-CN') {
    return {
      title: '要我提醒你吗？',
      body: 'Nuances 可以提醒你处理暂存笔记、快速测验，也会偶尔邀请你加入新内容。',
      allow: '开启提醒',
      later: '稍后再说',
      settingsLater: '你可以稍后在 iOS 设置中开启通知。',
    };
  }
  if (language === 'zh-TW') {
    return {
      title: '要我提醒你嗎？',
      body: 'Nuances 可以提醒你處理暫存筆記、快速測驗，也會偶爾邀請你加入新內容。',
      allow: '開啟提醒',
      later: '稍後再說',
      settingsLater: '你可以稍後到 iOS 設定裡開啟通知。',
    };
  }
  if (language === 'ja') return {
    title: 'リマインダーを有効にしますか？',
    body: '未整理のメモやクイッククイズをお知らせし、ときどき新しい内容の追加もご案内します。',
    allow: 'リマインダーを有効にする',
    later: 'あとで',
    settingsLater: '通知はあとでiOSの設定から有効にできます。',
  };
  if (language === 'ko') return {
    title: '알림을 받을까요?',
    body: '정리할 메모와 빠른 퀴즈를 알려드리고, 가끔 새 콘텐츠를 추가하도록 초대해 드려요.',
    allow: '알림 켜기',
    later: '나중에',
    settingsLater: '나중에 iOS 설정에서 알림을 켤 수 있어요.',
  };
  if (language === 'es') return {
    title: '¿Quieres recibir recordatorios?',
    body: 'Nuances puede recordarte tus notas y quizzes rápidos, y a veces invitarte a añadir contenido nuevo.',
    allow: 'Activar recordatorios',
    later: 'Más tarde',
    settingsLater: 'Puedes activar las notificaciones más tarde en Ajustes de iOS.',
  };
  if (language === 'fr') return {
    title: 'Activer les rappels ?',
    body: 'Nuances peut vous rappeler vos notes et quiz rapides, et parfois vous inviter à ajouter du contenu.',
    allow: 'Activer les rappels',
    later: 'Plus tard',
    settingsLater: 'Vous pourrez activer les notifications plus tard dans les réglages iOS.',
  };
  return {
    title: 'Want a gentle reminder?',
    body: 'Nuances can remind you about notes and quick quizzes, and occasionally invite you to add something new.',
    allow: 'Enable reminders',
    later: 'Maybe later',
    settingsLater: 'You can enable notifications later in iOS Settings.',
  };
}

function nextWindowDate(now: Date, window: ReminderWindow, dayOffset: number): Date {
  const date = new Date(now);
  date.setDate(now.getDate() + dayOffset);
  if (window === 'morning') {
    date.setHours(MORNING_HOUR, MORNING_MINUTE, 0, 0);
  } else {
    date.setHours(EVENING_HOUR, EVENING_MINUTE, 0, 0);
  }
  return date;
}

function upcomingReminderWindows(now: Date): Array<{ id: string; date: Date; window: ReminderWindow }> {
  const candidates = [
    { id: REMINDER_MORNING_ID, date: nextWindowDate(now, 'morning', 0), window: 'morning' as const },
    { id: REMINDER_EVENING_ID, date: nextWindowDate(now, 'evening', 0), window: 'evening' as const },
    { id: REMINDER_MORNING_ID, date: nextWindowDate(now, 'morning', 1), window: 'morning' as const },
    { id: REMINDER_EVENING_ID, date: nextWindowDate(now, 'evening', 1), window: 'evening' as const },
  ];

  const seen = new Set<ReminderWindow>();
  return candidates
    .filter((candidate) => candidate.date.getTime() > now.getTime() + 60 * 1000)
    .filter((candidate) => {
      if (seen.has(candidate.window)) return false;
      seen.add(candidate.window);
      return true;
    });
}

async function getPendingCounts(): Promise<PendingReminderCounts> {
  const userId = await getCurrentSessionUserId();
  if (!userId) return { cacheCount: 0, newWordsCount: 0 };

  const [cacheItems, cards, quizReviewed] = await Promise.all([
    database
      .get<CachedItem>('cached_items')
      .query(
        Q.where('user_id', userId),
        Q.where('deleted_at', null),
        Q.where('converted_to_card', false)
      )
      .fetch(),
    database
      .get<Card>('cards')
      .query(Q.where('user_id', userId), Q.where('deleted_at', null))
      .fetch(),
    loadQuizReviewedCardIds(),
  ]);

  const todayKey = toDayKey(new Date());
  const todayCardIds = cards
    .filter((card) => card.createdAt && toDayKey(card.createdAt) === todayKey)
    .map((card) => card.id);

  return {
    cacheCount: cacheItems.length,
    newWordsCount: todayCardIds.filter((id) => !quizReviewed.has(id)).length,
  };
}

async function cancelReminderNotifications(): Promise<void> {
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(REMINDER_MORNING_ID).catch(() => undefined),
    Notifications.cancelScheduledNotificationAsync(REMINDER_EVENING_ID).catch(() => undefined),
  ]);
}

async function ensurePermission(language: AIReplyLanguage, allowSoftPrompt: boolean): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.status === 'denied') {
    await updateReminderPreference(false);
    return false;
  }
  if (!allowSoftPrompt) return false;
  if (permissionPromptInFlight) return false;

  const promptedAt = await AsyncStorage.getItem(SOFT_PROMPTED_AT_KEY);
  if (promptedAt) return false;

  permissionPromptInFlight = true;
  await AsyncStorage.setItem(SOFT_PROMPTED_AT_KEY, new Date().toISOString());
  const copy = softPromptCopy(language);

  return new Promise((resolve) => {
    Alert.alert(
      copy.title,
      copy.body,
      [
        {
          text: copy.later,
          style: 'cancel',
          onPress: () => {
            permissionPromptInFlight = false;
            void updateReminderPreference(false);
            resolve(false);
          },
        },
        {
          text: copy.allow,
          onPress: () => {
            void Notifications.requestPermissionsAsync().then((next) => {
              permissionPromptInFlight = false;
              if (!next.granted) {
                void updateReminderPreference(false);
              }
              resolve(next.granted);
            });
          },
        },
      ],
      {
        onDismiss: () => {
          permissionPromptInFlight = false;
          void updateReminderPreference(false);
          resolve(false);
        },
      }
    );
  });
}

async function scheduleReminderNotifications(counts: PendingReminderCounts, language: AIReplyLanguage): Promise<void> {
  await cancelReminderNotifications();

  const now = new Date();
  const lastActiveRaw = await AsyncStorage.getItem(LAST_ACTIVE_AT_KEY);
  const lastActiveAt = lastActiveRaw ? new Date(lastActiveRaw).getTime() : now.getTime();
  const hasPending = counts.cacheCount > 0 || counts.newWordsCount > 0;
  const windows = upcomingReminderWindows(now).filter(
    ({ window }) => hasPending || window === 'evening'
  );

  await Promise.all(
    windows.map(async ({ id, date }) => {
      if (date.getTime() - lastActiveAt < TWO_HOURS_MS) return;
      const copy = hasPending
        ? { title: notificationTitle(language), body: bodyForCounts(language, counts) }
        : newInputPrompt(language, date);
      const target = counts.cacheCount > 0 || !hasPending ? 'cache' : 'deck';
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: copy.title,
          body: copy.body,
          sound: true,
          data: {
            kind: 'nuances-reminder',
            cacheCount: counts.cacheCount,
            newWordsCount: counts.newWordsCount,
            target,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      });
    })
  );
}

async function setLastActiveNow(): Promise<void> {
  await AsyncStorage.setItem(LAST_ACTIVE_AT_KEY, new Date().toISOString());
}

async function updateReminderPreference(enabled: boolean): Promise<void> {
  const settings = await loadUserSettings();
  if (settings.reminderNotificationsEnabled === enabled) return;
  await saveUserSettings({ ...settings, reminderNotificationsEnabled: enabled });
}

const ReminderNotificationService = {
  async configure(): Promise<void> {
    await cancelRetiredNotifications((identifier) =>
      Notifications.cancelScheduledNotificationAsync(identifier)
    );

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: AppState.currentState !== 'active',
        shouldPlaySound: AppState.currentState !== 'active',
        shouldSetBadge: false,
        shouldShowBanner: AppState.currentState !== 'active',
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Nuances reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  },

  async evaluateAndSchedule(options: EvaluateOptions = {}): Promise<PendingReminderCounts> {
    if (options.markAppActive) {
      await setLastActiveNow();
    }

    const settings = await loadUserSettings();
    const counts = await getPendingCounts();
    if (!settings.reminderNotificationsEnabled) {
      await cancelReminderNotifications();
      return counts;
    }

    const hasPermission = await ensurePermission(settings.aiReplyLanguage, options.allowSoftPrompt === true);
    if (!hasPermission) {
      await cancelReminderNotifications();
      return counts;
    }

    await scheduleReminderNotifications(counts, settings.aiReplyLanguage);
    return counts;
  },

  async setEnabled(enabled: boolean): Promise<void> {
    await updateReminderPreference(enabled);
    if (!enabled) {
      await cancelReminderNotifications();
      return;
    }
    const settings = await loadUserSettings();
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      await updateReminderPreference(false);
      await cancelReminderNotifications();
      const copy = softPromptCopy(settings.aiReplyLanguage);
      Alert.alert(copy.title, copy.settingsLater);
      return;
    }
    await this.evaluateAndSchedule({ markAppActive: true });
  },

  async cancelAll(): Promise<void> {
    await cancelReminderNotifications();
  },

  async getPendingCounts(): Promise<PendingReminderCounts> {
    return getPendingCounts();
  },
};

export default ReminderNotificationService;
