import type { AIReplyLanguage } from '../../services/settings/userSettings';

export type TipId =
  | 'customize_album'
  | 'correct_scanned_word'
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
    if (id === 'customize_album') return { title: '小提示', body: '長按相簿，就能更換封面、圖示和顏色。' };
    if (id === 'correct_scanned_word') return { title: '拼字怪怪的？', body: '長按掃描出的單字，就能直接修改。' };
    if (id === 'clear_cache') return { title: '小提示', body: '暫存卡片太多時，長按「略過」就能一次清空。' };
    return { title: '喜歡 Nuances 嗎？', body: '花幾秒留下評分，能幫助我們把 Nuances 做得更好。' };
  }
  if (language === 'zh-CN') {
    if (id === 'customize_album') return { title: '小提示', body: '长按相册，就能更换封面、图标和颜色。' };
    if (id === 'correct_scanned_word') return { title: '拼写怪怪的？', body: '长按扫描出的单词，就能直接修改。' };
    if (id === 'clear_cache') return { title: '小提示', body: '暂存卡片太多时，长按“跳过”就能一次清空。' };
    return { title: '喜欢 Nuances 吗？', body: '花几秒留下评分，能帮助我们把 Nuances 做得更好。' };
  }
  if (language === 'ja') {
    if (id === 'customize_album') return { title: 'ヒント', body: 'アルバムを長押しすると、カバーや色を変更できます。' };
    if (id === 'correct_scanned_word') return { title: 'スペルが少し変？', body: '読み取った単語を長押しすると、すぐに修正できます。' };
    if (id === 'clear_cache') return { title: 'ヒント', body: '「スキップ」を長押しすると、保留中のカードをまとめて消去できます。' };
    return { title: 'Nuancesを気に入りましたか？', body: '短いレビューで、より良いアプリづくりを応援してください。' };
  }
  if (language === 'ko') {
    if (id === 'customize_album') return { title: '팁', body: '앨범을 길게 누르면 표지, 아이콘, 색상을 바꿀 수 있어요.' };
    if (id === 'correct_scanned_word') return { title: '철자가 이상한가요?', body: '스캔된 단어를 길게 누르면 바로 수정할 수 있어요.' };
    if (id === 'clear_cache') return { title: '팁', body: '“건너뛰기”를 길게 누르면 대기 중인 카드를 한 번에 비울 수 있어요.' };
    return { title: 'Nuances가 마음에 드시나요?', body: '짧은 평가로 더 좋은 Nuances를 만드는 데 힘을 보태 주세요.' };
  }
  if (language === 'es') {
    if (id === 'customize_album') return { title: 'Consejo', body: 'Mantén pulsado un álbum para cambiar su portada, icono y color.' };
    if (id === 'correct_scanned_word') return { title: '¿La palabra no está bien?', body: 'Mantén pulsada una palabra escaneada para corregirla.' };
    if (id === 'clear_cache') return { title: 'Consejo', body: 'Mantén pulsado “Omitir” para vaciar todas las tarjetas pendientes.' };
    return { title: '¿Te gusta Nuances?', body: 'Una reseña breve nos ayuda a seguir mejorando Nuances.' };
  }
  if (language === 'fr') {
    if (id === 'customize_album') return { title: 'Astuce', body: 'Appuyez longuement sur un album pour modifier sa couverture, son icône et sa couleur.' };
    if (id === 'correct_scanned_word') return { title: 'Un mot semble incorrect ?', body: 'Appuyez longuement sur un mot numérisé pour le corriger.' };
    if (id === 'clear_cache') return { title: 'Astuce', body: 'Appuyez longuement sur « Ignorer » pour vider toutes les cartes en attente.' };
    return { title: 'Vous aimez Nuances ?', body: 'Une courte évaluation nous aide à continuer d’améliorer Nuances.' };
  }
  if (id === 'customize_album') return { title: 'Quick tip', body: 'Press and hold an album to change its cover, icon, and color.' };
  if (id === 'correct_scanned_word') return { title: 'Spelling look off?', body: 'Press and hold a scanned word to edit it.' };
  if (id === 'clear_cache') return { title: 'Quick tip', body: 'Press and hold “Skip” to clear every card waiting in your cache.' };
  return { title: 'Enjoying Nuances?', body: 'A quick rating helps us keep making Nuances better.' };
}
