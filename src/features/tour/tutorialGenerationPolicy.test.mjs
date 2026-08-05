import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTutorialGenerationSource,
  shouldFallbackToCloudGeneration,
} from './tutorialGenerationPolicy.ts';

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

test('bundled tutorial failure never falls back to a cloud request', () => {
  assert.equal(shouldFallbackToCloudGeneration('bundled-fixture'), false);
  assert.equal(shouldFallbackToCloudGeneration('cloud'), true);
});
