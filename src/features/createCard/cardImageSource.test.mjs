import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCardCroppedImage,
  resolveCardOriginalImage,
  resolveCardDetailImageCandidates,
} from './cardImageSource.ts';

test('resolveCardCroppedImage prioritizes route cropped image over cached and original images', () => {
  const result = resolveCardCroppedImage({
    croppedImageUri: 'file:///cropped.jpg',
    cachedItemImageStoragePath: 'file:///cached_cropped.jpg',
    routeOriginalImageUri: 'file:///route_original.jpg',
    cachedItemMediaUri: 'file:///cached_original.jpg',
  });
  assert.equal(result, 'file:///cropped.jpg');
});

test('resolveCardCroppedImage prioritizes cached cropped storage path over pre-cropped original', () => {
  const result = resolveCardCroppedImage({
    cachedItemImageStoragePath: 'file:///cached_cropped.jpg',
    routeOriginalImageUri: 'file:///route_original.jpg',
    cachedItemMediaUri: 'file:///cached_original.jpg',
  });
  assert.equal(result, 'file:///cached_cropped.jpg');
});

test('resolveCardCroppedImage falls back to original photo when no crop exists', () => {
  const result = resolveCardCroppedImage({
    routeOriginalImageUri: 'file:///route_original.jpg',
    cachedItemMediaUri: 'file:///cached_original.jpg',
  });
  assert.equal(result, 'file:///route_original.jpg');

  const fallbackToMedia = resolveCardCroppedImage({
    cachedItemMediaUri: 'file:///cached_original.jpg',
  });
  assert.equal(fallbackToMedia, 'file:///cached_original.jpg');

  assert.equal(resolveCardCroppedImage({}), null);
});

test('resolveCardOriginalImage preserves pre-cropped photo priority for source preview', () => {
  const result = resolveCardOriginalImage({
    croppedImageUri: 'file:///cropped.jpg',
    routeOriginalImageUri: 'file:///route_original.jpg',
    cachedItemMediaUri: 'file:///cached_original.jpg',
  });
  assert.equal(result, 'file:///route_original.jpg');
});

test('resolveCardDetailImageCandidates prioritizes card imageUrl and cropped photo over pre-cropped original mediaUri', () => {
  const candidates = resolveCardDetailImageCandidates({
    cachedItemImageStoragePath: 'file:///cached_cropped.jpg',
    cardImageUrl: 'cards/card-123.jpg',
    cachedItemMediaUri: 'file:///pre_cropped_original.jpg',
  });
  assert.deepEqual(candidates, [
    'cards/card-123.jpg',
    'file:///cached_cropped.jpg',
    'file:///pre_cropped_original.jpg',
  ]);
});
