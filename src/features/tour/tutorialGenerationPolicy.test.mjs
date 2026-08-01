import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTutorialGenerationSource } from './tutorialGenerationPolicy.ts';

test('bundled tutorial content never uses cloud generation', () => {
  assert.equal(
    resolveTutorialGenerationSource({
      isTutorial: true,
      isBundledDemoContent: true,
    }),
    'bundled-fixture'
  );
});

test('normal card creation continues to use cloud generation', () => {
  assert.equal(
    resolveTutorialGenerationSource({
      isTutorial: false,
      isBundledDemoContent: false,
    }),
    'cloud'
  );
});
