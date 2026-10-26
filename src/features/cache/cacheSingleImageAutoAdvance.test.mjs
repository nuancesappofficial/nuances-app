import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

test('single image upload must use deferred card creation with quick-add target and pre-normalize before cropper', () => {
  const flowPath = join(__dirname, '../../screens/flow/CacheScreenFlow/hooks/useCacheQuickAddFlow.ts');
  const flowContent = readFileSync(flowPath, 'utf8');

  const cropperPath = join(__dirname, '../../components/ImageCropperModal.tsx');
  const cropperContent = readFileSync(cropperPath, 'utf8');

  // Must dismiss upload modal immediately before any await on single upload
  assert.equal(
    /if\s*\(\s*isSingleUpload\s*\)[\s\S]*setShowAddModal\(false\)[\s\S]*await getCurrentSessionUserId/.test(flowContent),
    true,
    'useCacheQuickAddFlow must dismiss upload modal before async checks'
  );

  // Must run capacity check and duplicate query concurrently with Promise.all
  assert.equal(
    /Promise\.all\(\s*\[\s*getRemainingCacheCapacity\(userId\)/.test(flowContent),
    true,
    'useCacheQuickAddFlow must run capacity and duplicate checks concurrently with Promise.all'
  );

  // Must run manipulateAsync on Android and skip on iOS
  assert.equal(
    /if\s*\(\s*Platform\.OS === 'android'\s*\)[\s\S]*ImageManipulator\.manipulateAsync/.test(flowContent),
    true,
    'useCacheQuickAddFlow must run manipulateAsync only on Android'
  );

  // Must dynamically cushion iOS presentation delay (150ms after picker return when the sheet was closed first, else 700ms) to prevent UIKit collision
  assert.equal(
    /pickerDismissStartTime[\s\S]*Math\.max\(\s*50,\s*\(closedSheetBeforePicker \? 150 : 700\)\s*-\s*elapsed\s*\)/.test(flowContent),
    true,
    'useCacheQuickAddFlow must dynamically cushion iOS presentation to prevent UIKit modal drop'
  );

  // Must reset showUploadCropper to false at start of single upload to prevent stuck true state
  assert.equal(
    /if\s*\(\s*isSingleUpload\s*\)[\s\S]*setShowUploadCropper\(false\)/.test(flowContent),
    true,
    'useCacheQuickAddFlow must reset showUploadCropper to false before single upload flow'
  );

  // Must have watchdog fallback that creates card directly if cropper modal fails to present
  assert.equal(
    /cropperWatchdogTimerRef[\s\S]*createQuickImageCachedItem\(originalUri,\s*originalUri\)/.test(flowContent),
    true,
    'useCacheQuickAddFlow must have watchdog fallback to create card if cropper fails to present'
  );

  // ImageCropperModal must support onShow prop
  assert.equal(
    /onShow\?: \(\) => void/.test(cropperContent),
    true,
    'ImageCropperModal Props must define onShow callback'
  );

  // Must set target to quick-add for deferred creation
  assert.equal(
    /if\s*\(\s*isSingleUpload\s*\)[\s\S]*setCropperFlowTarget\(\s*['"]quick-add['"]\s*\)/.test(flowContent),
    true,
    "useCacheQuickAddFlow must set setCropperFlowTarget('quick-add') for single image upload"
  );

  // Must prefetch finalUri before cropper enters
  assert.equal(
    /Image\.prefetch\(\s*finalUri\s*\)/.test(flowContent),
    true,
    'useCacheQuickAddFlow must prefetch finalUri to preload decoded bitmap'
  );

  // Multi-image upload must still use createQuickImageCachedItems
  assert.equal(
    /await\s+createQuickImageCachedItems\([\s\S]*pickedAssets\.map/.test(flowContent),
    true,
    'useCacheQuickAddFlow must keep batch creation for multi-image upload'
  );

  // ImageCropperModal must declare statusBarTranslucent
  assert.equal(
    /statusBarTranslucent/.test(cropperContent),
    true,
    'ImageCropperModal must set statusBarTranslucent to eliminate layout jumps on Android'
  );

  // Must store original picked asset URI so temp file purge does not break card
  assert.equal(
    /pendingOriginalPickedUriRef\.current\s*=\s*singleAsset\.uri/.test(flowContent),
    true,
    'useCacheQuickAddFlow must store original picked asset URI in pendingOriginalPickedUriRef'
  );

  // Single-image cancel must create cached item with original URI and NOT reopen add modal
  assert.equal(
    /handleUploadCropCancel[\s\S]*createQuickImageCachedItem\(\s*originalPickedUri,\s*originalPickedUri\s*\)/.test(flowContent),
    true,
    'handleUploadCropCancel must create card using originalPickedUri'
  );
  assert.equal(
    /handleUploadCropCancel[\s\S]*setShowAddModal\(true\)/.test(flowContent),
    false,
    'handleUploadCropCancel must NOT reopen add modal'
  );

  // Confirm failure must close cropper and not leak state
  assert.equal(
    /handleUploadCropConfirm[\s\S]*if\s*\(!quickItem\)\s*\{[\s\S]*setShowUploadCropper\(false\)/.test(flowContent),
    true,
    'handleUploadCropConfirm must close cropper if item creation returns null'
  );

  // ImageCropperModal must support explicit isNormalized prop
  assert.equal(
    /isNormalized\?: boolean/.test(cropperContent),
    true,
    'ImageCropperModal Props must define isNormalized'
  );
  assert.equal(
    /if\s*\(\s*isNormalized\s*\)\s*\{\s*return;\s*\}/.test(cropperContent),
    true,
    'ImageCropperModal must skip manipulateAsync when isNormalized is true'
  );
  assert.equal(
    /imageUri\.includes\('ImageManipulator'\)/.test(cropperContent),
    false,
    'ImageCropperModal must not rely on fragile ImageManipulator string heuristic'
  );
});
