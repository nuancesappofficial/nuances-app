import assert from 'node:assert/strict';
import test from 'node:test';

import { getTipNotificationCopy } from './tipNotificationCatalog.ts';

test('provides clear_cache tip in Traditional Chinese and English', () => {
  const copyTW = getTipNotificationCopy('zh-TW', 'clear_cache');
  assert.deepEqual(copyTW, {
    title: '小提示',
    body: '暫存卡片太多時，長按「略過」就能一次清空。',
  });

  const copyEN = getTipNotificationCopy('en', 'clear_cache');
  assert.deepEqual(copyEN, {
    title: 'Quick tip',
    body: 'Press and hold “Skip” to clear every card waiting in your cache.',
  });
});

test('provides rate_app tip in Traditional Chinese and English', () => {
  const copyTW = getTipNotificationCopy('zh-TW', 'rate_app');
  assert.deepEqual(copyTW, {
    title: '喜歡 Nuances 嗎？',
    body: '花幾秒留下評分，能幫助我們把 Nuances 做得更好。',
  });

  const copyEN = getTipNotificationCopy('en', 'rate_app');
  assert.deepEqual(copyEN, {
    title: 'Enjoying Nuances?',
    body: 'A quick rating helps us keep making Nuances better.',
  });
});
