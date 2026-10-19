import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWhatsNewToDisplay,
  checkIfBrandNewUser,
  LAST_SEEN_WHATS_NEW_KEY,
} from '../src/services/whatsNew/whatsNewCore.ts';

const mockConfig = {
  '1.3.3': {
    version: '1.3.3',
    title: '更新功能',
    items: [
      { number: '1', title: '原生高品質語音發音' },
      { number: '2', title: '離線智慧快取' },
      { number: '3', title: '複習排程與同步穩定性' },
    ],
  },
};

test('resolveWhatsNewToDisplay returns null when user is a brand new install (isFirstInstall: true)', () => {
  const result = resolveWhatsNewToDisplay('1.3.3', null, true, mockConfig);
  assert.equal(result, null);
});

test('resolveWhatsNewToDisplay returns release when existing user upgrades from an older version (isFirstInstall: false)', () => {
  const result = resolveWhatsNewToDisplay('1.3.3', '1.3.2', false, mockConfig);
  assert.ok(result);
  assert.equal(result.version, '1.3.3');
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].number, '1');
});

test('resolveWhatsNewToDisplay returns null when user has already seen the current version (gone for good)', () => {
  const result = resolveWhatsNewToDisplay('1.3.3', '1.3.3', false, mockConfig);
  assert.equal(result, null);
});

test('resolveWhatsNewToDisplay returns null when current version has no configured bulletin content', () => {
  const result = resolveWhatsNewToDisplay('1.4.0', '1.3.3', false, mockConfig);
  assert.equal(result, null);
});

test('LAST_SEEN_WHATS_NEW_KEY constant is valid storage key', () => {
  assert.equal(LAST_SEEN_WHATS_NEW_KEY, 'nuances_last_seen_whats_new_version');
});

test('checkIfBrandNewUser returns true when storage has no existing user/app data', async () => {
  const emptyStorage = {
    getItem: async () => null,
    setItem: async () => {},
  };
  const isBrandNew = await checkIfBrandNewUser(emptyStorage);
  assert.equal(isBrandNew, true);
});

test('checkIfBrandNewUser returns false when user has legacy analytics/app data', async () => {
  const existingStorage = {
    getItem: async (key) => (key === '@nuances/analytics/first-app-opened/v1' ? 'true' : null),
    setItem: async () => {},
  };
  const isBrandNew = await checkIfBrandNewUser(existingStorage);
  assert.equal(isBrandNew, false);
});

test('checkIfBrandNewUser returns false when user has authenticated user ID', async () => {
  const userStorage = {
    getItem: async (key) => (key === 'nuances_last_auth_user_id_v1' ? 'user-123' : null),
    setItem: async () => {},
  };
  const isBrandNew = await checkIfBrandNewUser(userStorage);
  assert.equal(isBrandNew, false);
});
