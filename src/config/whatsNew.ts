import type { WhatsNewItem, WhatsNewRelease } from '../services/whatsNew/whatsNewCore';

export type { WhatsNewItem, WhatsNewRelease };

export const WHATS_NEW_CONFIG: Record<string, WhatsNewRelease> = {
  '1.3.4': {
    version: '1.3.4',
    title: '更新功能',
    items: [
      {
        number: '01',
        title: 'App-wide text size control in font settings',
      },
      {
        number: '02',
        title: 'Pronunciation coach with live waveform & IPA',
      },
      {
        number: '03',
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
