import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWhatsNewToDisplay, LAST_SEEN_WHATS_NEW_KEY } from '../src/services/whatsNew/whatsNewCore.ts';

const mockConfig = {
  '1.3.3': {
    version: '1.3.3',
    badge: '版本 1.3.3 更新重點',
    title: '新功能與優化',
    subtitle: '提供更流暢自然的沉浸式英語學習體驗',
    items: [
      { number: '01', title: '原生高品質語音發音', description: '升級系統層級 TTS 語音模型' },
      { number: '02', title: '離線智慧快取', description: '字卡載入架構優化' },
      { number: '03', title: '複習排程與同步穩定性', description: '修復弱網環境下的計時誤差' },
    ],
  },
};

test('resolveWhatsNewToDisplay returns release when user has never seen any version (first open after install/upgrade)', () => {
  const result = resolveWhatsNewToDisplay('1.3.3', null, mockConfig);
  assert.ok(result);
  assert.equal(result.version, '1.3.3');
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].number, '01');
  assert.equal(result.items[1].number, '02');
  assert.equal(result.items[2].number, '03');
});

test('resolveWhatsNewToDisplay returns release when user upgrades from an older version', () => {
  const result = resolveWhatsNewToDisplay('1.3.3', '1.3.2', mockConfig);
  assert.ok(result);
  assert.equal(result.version, '1.3.3');
});

test('resolveWhatsNewToDisplay returns null when user has already seen the current version (gone for good)', () => {
  const result = resolveWhatsNewToDisplay('1.3.3', '1.3.3', mockConfig);
  assert.equal(result, null);
});

test('resolveWhatsNewToDisplay returns null when current version has no configured bulletin content', () => {
  const result = resolveWhatsNewToDisplay('1.4.0', '1.3.3', mockConfig);
  assert.equal(result, null);
});

test('LAST_SEEN_WHATS_NEW_KEY constant is valid storage key', () => {
  assert.equal(LAST_SEEN_WHATS_NEW_KEY, 'nuances_last_seen_whats_new_version');
});
