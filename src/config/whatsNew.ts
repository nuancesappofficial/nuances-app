import type { WhatsNewItem, WhatsNewRelease } from '../services/whatsNew/whatsNewCore';

export type { WhatsNewItem, WhatsNewRelease };

export const WHATS_NEW_CONFIG: Record<string, WhatsNewRelease> = {
  '1.3.3': {
    version: '1.3.3',
    badge: '版本 1.3.3 更新重點',
    title: '新功能與優化',
    subtitle: '提供更流暢自然的沉浸式英語學習體驗',
    items: [
      {
        number: '01',
        title: '原生高品質語音發音',
        description: '升級系統層級 TTS 語音模型，單字與例句發音更貼近真實母語對話。',
      },
      {
        number: '02',
        title: '離線智慧快取',
        description: '字卡載入架構優化，無網路連線環境下依然維持即時翻閱速度。',
      },
      {
        number: '03',
        title: '複習排程與同步穩定性',
        description: '全面修復弱網環境下的記憶間隔計時誤差，確保跨裝置複習進度一致。',
      },
    ],
  },
};
