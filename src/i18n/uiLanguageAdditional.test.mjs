import assert from 'node:assert/strict';
import test from 'node:test';

import { ADDITIONAL_UI_STRINGS } from './uiLanguageAdditional.ts';

test('Japanese UI presents the current tour completion call to action', () => {
  assert.equal(
    ADDITIONAL_UI_STRINGS.ja['deck.tourCompleteTitle'],
    'アプリを開かずに保存',
  );
  assert.equal(
    ADDITIONAL_UI_STRINGS.ja['deck.tourCompleteBody'],
    '学びたいものをアップロードするか、iOS の共有シートからテキストや画像を Nuances に送信してください。',
  );
});
