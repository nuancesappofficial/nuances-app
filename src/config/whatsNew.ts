import type { WhatsNewItem, WhatsNewRelease } from '../services/whatsNew/whatsNewCore';

export type { WhatsNewItem, WhatsNewRelease };

export const WHATS_NEW_CONFIG: Record<string, WhatsNewRelease> = {
  '1.3.6': {
    version: '1.3.6',
    title: 'What’s New',
    items: [
      {
        number: '1',
        title: 'Direct cropping for single photos',
      },
      {
        number: '2',
        title: 'Smoother photo picker & cropper',
      },
    ],
    localized: {
      'zh-TW': {
        title: '更新功能',
        items: [
          { number: '1', title: '單張圖片直接進入裁切製卡' },
          { number: '2', title: '圖片選取與裁切更流暢穩定' },
        ],
      },
      'zh-CN': {
        title: '更新功能',
        items: [
          { number: '1', title: '单张图片直接进入裁剪制卡' },
          { number: '2', title: '图片选取与裁剪更流畅稳定' },
        ],
      },
      'en': {
        title: 'What’s New',
        items: [
          { number: '1', title: 'Direct cropping for single photos' },
          { number: '2', title: 'Smoother photo picker & cropper' },
        ],
      },
      'ja': {
        title: '新機能',
        items: [
          { number: '1', title: '選択画像を直接トリミング製カード' },
          { number: '2', title: '画像選択とトリミングの安定化' },
        ],
      },
      'ko': {
        title: '새로운 기능',
        items: [
          { number: '1', title: '단일 사진 선택 즉시 자르기' },
          { number: '2', title: '사진 선택 및 자르기 안정성 향상' },
        ],
      },
      'es': {
        title: 'Novedades',
        items: [
          { number: '1', title: 'Recorte directo para fotos únicas' },
          { number: '2', title: 'Selector y recorte de fotos más fluido' },
        ],
      },
      'fr': {
        title: 'Nouveautés',
        items: [
          { number: '1', title: 'Recadrage direct d’une photo' },
          { number: '2', title: 'Sélection et recadrage de photos fluidifiés' },
        ],
      },
    },
  },
  '1.3.5': {
    version: '1.3.5',
    title: 'What’s New',
    items: [
      {
        number: '1',
        title: 'Pronunciation records in quizzes',
      },
      {
        number: '2',
        title: 'Faster audio loading & caching',
      },
      {
        number: '3',
        title: 'Smoother card flips & creation',
      },
    ],
    localized: {
      'zh-TW': {
        title: '更新功能',
        items: [
          { number: '1', title: '測驗同步紀錄發音成果' },
          { number: '2', title: '發音即時快取與預載播放' },
          { number: '3', title: '翻卡與製作卡片更流暢' },
        ],
      },
      'zh-CN': {
        title: '更新功能',
        items: [
          { number: '1', title: '测验同步记录发音成果' },
          { number: '2', title: '发音即时缓存与预载播放' },
          { number: '3', title: '翻卡与制作卡片更流畅' },
        ],
      },
      'en': {
        title: 'What’s New',
        items: [
          { number: '1', title: 'Pronunciation records in quizzes' },
          { number: '2', title: 'Faster audio loading & caching' },
          { number: '3', title: 'Smoother card flips & creation' },
        ],
      },
      'ja': {
        title: '新機能',
        items: [
          { number: '1', title: 'クイズの発音スコアを自動記録' },
          { number: '2', title: '音声キャッシュと即時読み込み' },
          { number: '3', title: 'カード作成と反転をより快適に' },
        ],
      },
      'ko': {
        title: '새로운 기능',
        items: [
          { number: '1', title: '퀴즈 발음 기록 자동 동기화' },
          { number: '2', title: '빠른 발음 캐싱 및 즉시 로딩' },
          { number: '3', title: '카드 생성 및 뒤집기 동작 개선' },
        ],
      },
      'es': {
        title: 'Novedades',
        items: [
          { number: '1', title: 'Registro de pronunciación en cuestionarios' },
          { number: '2', title: 'Carga y caché de audio más rápida' },
          { number: '3', title: 'Creación y giro de tarjetas más fluido' },
        ],
      },
      'fr': {
        title: 'Nouveautés',
        items: [
          { number: '1', title: 'Suivi de la prononciation dans les quiz' },
          { number: '2', title: 'Mise en cache et lecture audio accélérées' },
          { number: '3', title: 'Création et retournement de cartes fluidifiés' },
        ],
      },
    },
  },
  '1.3.4': {
    version: '1.3.4',
    title: '更新功能',
    items: [
      {
        number: '1',
        title: 'App-wide text size control in font settings',
      },
      {
        number: '2',
        title: 'Pronunciation coach with live waveform & IPA',
      },
      {
        number: '3',
        title: 'Smoother quiz feedback and instant card loading',
      },
    ],
  },
  '1.3.3': {
    version: '1.3.3',
    title: '更新功能',
    items: [
      {
        number: '1',
        title: '原生高品質語音發音',
      },
      {
        number: '2',
        title: '離線智慧快取',
      },
      {
        number: '3',
        title: '複習排程與同步穩定性',
      },
    ],
  },
};
