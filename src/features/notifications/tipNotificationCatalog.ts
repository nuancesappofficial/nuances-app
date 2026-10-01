import type { AIReplyLanguage } from '../../services/settings/userSettings';

export type TipId =
  | 'clear_cache'
  | 'rate_app';

export type TipNotificationCopy = {
  title: string;
  body: string;
};

export function getTipNotificationCopy(
  language: AIReplyLanguage,
  id: TipId
): TipNotificationCopy {
  if (language === 'zh-TW') {
    if (id === 'clear_cache') return { title: '小提示', body: '暫存卡片太多時，長按「略過」就能一次清空。' };
    return { title: '喜歡 Nuances 嗎？', body: '花幾秒留下評分，能幫助我們把 Nuances 做得更好。' };
  }
  if (language === 'zh-CN') {
    if (id === 'clear_cache') return { title: '小提示', body: '暂存卡片太多时，长按“跳过”就能一次清空。' };
    return { title: '喜欢 Nuances 吗？', body: '花几秒留下评分，能帮助我们把 Nuances 做得更好。' };
  }
  if (language === 'ja') {
    if (id === 'clear_cache') return { title: 'ヒント', body: '「スキップ」を長押しすると、保留中のカードをまとめて消去できます。' };
    return { title: 'Nuancesを気に入りましたか？', body: '短いレビューで、より良いアプリづくりを応援してください。' };
  }
  if (language === 'ko') {
    if (id === 'clear_cache') return { title: '팁', body: '“건너뛰기”를 길게 누르면 대기 중인 카드를 한 번에 비울 수 있어요.' };
    return { title: 'Nuances가 마음에 드시나요?', body: '짧은 평가로 더 좋은 Nuances를 만드는 데 힘을 보태 주세요.' };
  }
  if (language === 'es') {
    if (id === 'clear_cache') return { title: 'Consejo', body: 'Mantén pulsado “Omitir” para vaciar todas las tarjetas pendientes.' };
    return { title: '¿Te gusta Nuances?', body: 'Una reseña breve nos ayuda a seguir mejorando Nuances.' };
  }
  if (language === 'fr') {
    if (id === 'clear_cache') return { title: 'Astuce', body: 'Appuyez longuement sur « Ignorer » pour vider toutes les cartes en attente.' };
    return { title: 'Vous aimez Nuances ?', body: 'Une courte évaluation nous aide à continuer d’améliorer Nuances.' };
  }
  if (id === 'clear_cache') return { title: 'Quick tip', body: 'Press and hold “Skip” to clear every card waiting in your cache.' };
  return { title: 'Enjoying Nuances?', body: 'A quick rating helps us keep making Nuances better.' };
}
