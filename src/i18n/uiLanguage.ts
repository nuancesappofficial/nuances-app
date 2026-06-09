import type { UILanguage } from '../services/settings/userSettings';

export type UIStringKey =
  | 'common.back'
  | 'common.free'
  | 'common.premium'
  | 'common.trial'
  | 'deck.searchPlaceholder'
  | 'deck.noOriginalSentence'
  | 'deck.emptyWordPopTitle'
  | 'deck.emptyWordPopSubtitle'
  | 'deck.newWords'
  | 'deck.quickQuiz'
  | 'profile.membership'
  | 'profile.mainScreen'
  | 'profile.language'
  | 'profile.voice'
  | 'profile.font'
  | 'profile.deleteAccount'
  | 'profile.deleteAccountDeleting'
  | 'profile.mainScreenSummary.wordPopOn'
  | 'profile.mainScreenSummary.wordPopOff'
  | 'settings.title.language'
  | 'settings.title.voice'
  | 'settings.title.mainScreen'
  | 'settings.title.membership'
  | 'settings.title.font'
  | 'settings.language.subtitle'
  | 'settings.language.english'
  | 'settings.language.chineseTraditional'
  | 'settings.language.chineseSimplified'
  | 'settings.language.englishMeta'
  | 'settings.language.chineseTraditionalMeta'
  | 'settings.language.chineseSimplifiedMeta'
  | 'settings.main.albumsPerPage'
  | 'settings.main.wordPop'
  | 'settings.main.wordPopMeta'
  | 'settings.main.wordPopSource'
  | 'settings.main.wordPopSourceMeta'
  | 'appVersion.updateUnavailableTitle'
  | 'appVersion.updateUnavailableNoUrl'
  | 'appVersion.updateUnavailableOpenFailed'
  | 'appVersion.updateRequiredTitle'
  | 'appVersion.updateAvailableTitle'
  | 'appVersion.updateRequiredBody'
  | 'appVersion.updateAvailableBody'
  | 'appVersion.updateAction'
  | 'appVersion.laterAction';

const STRINGS: Record<'en' | 'zh-TW' | 'zh-CN', Record<UIStringKey, string>> = {
  en: {
    'common.back': 'Back',
    'common.free': 'Not subscribed',
    'common.premium': 'Premium',
    'common.trial': 'Trial',
    'deck.searchPlaceholder': 'Search cards, albums, notes...',
    'deck.noOriginalSentence': 'No original sentence yet.',
    'deck.emptyWordPopTitle': 'Start adding cards to generate words',
    'deck.emptyWordPopSubtitle': 'Tap to open card details',
    'deck.newWords': 'New words',
    'deck.quickQuiz': 'Quick quiz',
    'profile.membership': 'Membership',
    'profile.mainScreen': 'Main screen',
    'profile.language': 'Language',
    'profile.voice': 'Voice',
    'profile.font': 'Font',
    'profile.deleteAccount': 'Delete Account',
    'profile.deleteAccountDeleting': 'Deleting...',
    'profile.mainScreenSummary.wordPopOn': 'Word pop on',
    'profile.mainScreenSummary.wordPopOff': 'Word pop off',
    'settings.title.language': 'Language',
    'settings.title.voice': 'Voice',
    'settings.title.mainScreen': 'Main screen',
    'settings.title.membership': 'Membership',
    'settings.title.font': 'Font',
    'settings.language.subtitle': 'Controls both app UI language and AI reply language.',
    'settings.language.english': 'English',
    'settings.language.chineseTraditional': 'Traditional Chinese',
    'settings.language.chineseSimplified': 'Simplified Chinese',
    'settings.language.englishMeta': 'UI and AI replies use English.',
    'settings.language.chineseTraditionalMeta': 'UI and AI replies use Traditional Chinese.',
    'settings.language.chineseSimplifiedMeta': 'UI and AI replies use Simplified Chinese.',
    'settings.main.albumsPerPage': 'Albums per page',
    'settings.main.wordPop': 'Word pop',
    'settings.main.wordPopMeta': 'Show section on main screen',
    'settings.main.wordPopSource': 'Word pop source',
    'settings.main.wordPopSourceMeta': 'Choose which album feeds the slideshow.',
    'appVersion.updateUnavailableTitle': 'Update unavailable',
    'appVersion.updateUnavailableNoUrl': 'The App Store update link is not configured yet.',
    'appVersion.updateUnavailableOpenFailed': 'Unable to open the App Store update page. Please try again later.',
    'appVersion.updateRequiredTitle': 'Update required',
    'appVersion.updateAvailableTitle': 'Update available',
    'appVersion.updateRequiredBody': 'Please update Nuances from the App Store to continue using the latest supported version.',
    'appVersion.updateAvailableBody': 'A newer version of Nuances is available. Update from the App Store for the latest fixes and improvements.',
    'appVersion.updateAction': 'Update App',
    'appVersion.laterAction': 'Later',
  },
  'zh-TW': {
    'common.back': '返回',
    'common.free': '未訂閱',
    'common.premium': 'Premium',
    'common.trial': '試用中',
    'deck.searchPlaceholder': '搜尋卡片、相簿、筆記...',
    'deck.noOriginalSentence': '還沒有原始句子。',
    'deck.emptyWordPopTitle': '新增卡片後會出現單字',
    'deck.emptyWordPopSubtitle': '點擊可開啟卡片細節',
    'deck.newWords': '新單字',
    'deck.quickQuiz': '快速測驗',
    'profile.membership': '會員',
    'profile.mainScreen': '主畫面',
    'profile.language': '語言',
    'profile.voice': '聲音',
    'profile.font': '字體',
    'profile.deleteAccount': '刪除帳號',
    'profile.deleteAccountDeleting': '刪除中...',
    'profile.mainScreenSummary.wordPopOn': 'Word pop 開啟',
    'profile.mainScreenSummary.wordPopOff': 'Word pop 關閉',
    'settings.title.language': '語言',
    'settings.title.voice': '聲音',
    'settings.title.mainScreen': '主畫面',
    'settings.title.membership': '會員',
    'settings.title.font': '字體',
    'settings.language.subtitle': '同時控制 App 介面語言與 AI 回覆語言。',
    'settings.language.english': 'English',
    'settings.language.chineseTraditional': '繁體中文',
    'settings.language.chineseSimplified': '簡體中文',
    'settings.language.englishMeta': '介面與 AI 回覆使用英文。',
    'settings.language.chineseTraditionalMeta': '介面與 AI 回覆使用繁體中文。',
    'settings.language.chineseSimplifiedMeta': '介面與 AI 回覆使用簡體中文。',
    'settings.main.albumsPerPage': '每頁相簿數',
    'settings.main.wordPop': 'Word pop',
    'settings.main.wordPopMeta': '在主畫面顯示這個區塊',
    'settings.main.wordPopSource': 'Word pop 來源',
    'settings.main.wordPopSourceMeta': '選擇要從哪個相簿輪播單字。',
    'appVersion.updateUnavailableTitle': '無法更新',
    'appVersion.updateUnavailableNoUrl': 'App Store 更新連結尚未設定。',
    'appVersion.updateUnavailableOpenFailed': '無法開啟 App Store 更新頁面，請稍後再試。',
    'appVersion.updateRequiredTitle': '需要更新',
    'appVersion.updateAvailableTitle': '有新版本',
    'appVersion.updateRequiredBody': '請從 App Store 更新 Nuances，才能繼續使用目前支援的版本。',
    'appVersion.updateAvailableBody': 'Nuances 有新版本可用。更新後可取得最新修正與改進。',
    'appVersion.updateAction': '更新 App',
    'appVersion.laterAction': '稍後',
  },
  'zh-CN': {
    'common.back': '返回',
    'common.free': '未订阅',
    'common.premium': 'Premium',
    'common.trial': '试用中',
    'deck.searchPlaceholder': '搜索卡片、相册、笔记...',
    'deck.noOriginalSentence': '还没有原始句子。',
    'deck.emptyWordPopTitle': '新增卡片后会出现单词',
    'deck.emptyWordPopSubtitle': '点击可打开卡片详情',
    'deck.newWords': '新单词',
    'deck.quickQuiz': '快速测验',
    'profile.membership': '会员',
    'profile.mainScreen': '主屏幕',
    'profile.language': '语言',
    'profile.voice': '声音',
    'profile.font': '字体',
    'profile.deleteAccount': '删除账号',
    'profile.deleteAccountDeleting': '删除中...',
    'profile.mainScreenSummary.wordPopOn': 'Word pop 开启',
    'profile.mainScreenSummary.wordPopOff': 'Word pop 关闭',
    'settings.title.language': '语言',
    'settings.title.voice': '声音',
    'settings.title.mainScreen': '主屏幕',
    'settings.title.membership': '会员',
    'settings.title.font': '字体',
    'settings.language.subtitle': '同时控制 App 界面语言与 AI 回复语言。',
    'settings.language.english': 'English',
    'settings.language.chineseTraditional': '繁体中文',
    'settings.language.chineseSimplified': '简体中文',
    'settings.language.englishMeta': '界面与 AI 回复使用英文。',
    'settings.language.chineseTraditionalMeta': '界面与 AI 回复使用繁体中文。',
    'settings.language.chineseSimplifiedMeta': '界面与 AI 回复使用简体中文。',
    'settings.main.albumsPerPage': '每页相册数',
    'settings.main.wordPop': 'Word pop',
    'settings.main.wordPopMeta': '在主屏幕显示这个区块',
    'settings.main.wordPopSource': 'Word pop 来源',
    'settings.main.wordPopSourceMeta': '选择要从哪个相册轮播单词。',
    'appVersion.updateUnavailableTitle': '无法更新',
    'appVersion.updateUnavailableNoUrl': 'App Store 更新链接尚未设置。',
    'appVersion.updateUnavailableOpenFailed': '无法打开 App Store 更新页面，请稍后再试。',
    'appVersion.updateRequiredTitle': '需要更新',
    'appVersion.updateAvailableTitle': '有新版本',
    'appVersion.updateRequiredBody': '请从 App Store 更新 Nuances，才能继续使用当前支持的版本。',
    'appVersion.updateAvailableBody': 'Nuances 有新版本可用。更新后可获得最新修复与改进。',
    'appVersion.updateAction': '更新 App',
    'appVersion.laterAction': '稍后',
  },
};

export function normalizeUILanguage(value: unknown): UILanguage {
  if (value === 'zh-TW' || value === 'zh-CN' || value === 'en' || value === 'ja' || value === 'ko' || value === 'es') {
    return value;
  }
  return 'en';
}

export function getSupportedUILanguage(value: UILanguage): 'en' | 'zh-TW' | 'zh-CN' {
  if (value === 'zh-TW' || value === 'zh-CN') return value;
  return 'en';
}

export function tUI(language: UILanguage, key: UIStringKey): string {
  const supported = getSupportedUILanguage(language);
  return STRINGS[supported][key] || STRINGS.en[key] || key;
}
