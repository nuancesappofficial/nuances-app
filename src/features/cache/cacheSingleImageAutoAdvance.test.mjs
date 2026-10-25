import test from 'node:test';
import assert from 'node:assert/strict';

export function shouldAutoAdvanceToCropper(pickedAssetsCount) {
  return pickedAssetsCount === 1;
}

test('single image upload triggers auto advance to cropper', () => {
  assert.equal(shouldAutoAdvanceToCropper(1), true);
});

test('multi image upload does NOT auto advance to cropper', () => {
  assert.equal(shouldAutoAdvanceToCropper(2), false);
  assert.equal(shouldAutoAdvanceToCropper(5), false);
  assert.equal(shouldAutoAdvanceToCropper(0), false);
});
