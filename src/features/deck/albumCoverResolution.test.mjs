import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAlbumCoverUri } from './albumCoverResolution.ts';

test('resolveAlbumCoverUri returns undefined or empty string for falsy input', () => {
  assert.equal(resolveAlbumCoverUri(undefined, 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/'), undefined);
  assert.equal(resolveAlbumCoverUri('', 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/'), '');
});

test('resolveAlbumCoverUri leaves remote URLs and asset schemes untouched', () => {
  assert.equal(resolveAlbumCoverUri('https://example.com/cover.jpg', 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/'), 'https://example.com/cover.jpg');
  assert.equal(resolveAlbumCoverUri('asset:/covers/1.png', 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/'), 'asset:/covers/1.png');
});

test('resolveAlbumCoverUri rewrites old container UUID to current container documentDirectory', () => {
  const oldStoredUri = 'file:///var/mobile/Containers/Data/Application/OLD-CONTAINER-UUID/Documents/album-covers/album-cover-1790849343913-bils0jccel7.jpg';
  const currentDocDir = 'file:///var/mobile/Containers/Data/Application/NEW-CONTAINER-UUID/Documents/';
  const resolved = resolveAlbumCoverUri(oldStoredUri, currentDocDir);

  assert.equal(
    resolved,
    'file:///var/mobile/Containers/Data/Application/NEW-CONTAINER-UUID/Documents/album-covers/album-cover-1790849343913-bils0jccel7.jpg'
  );
});

test('resolveAlbumCoverUri handles relative album-covers path', () => {
  const relativeUri = 'album-covers/album-cover-123.jpg';
  const currentDocDir = 'file:///var/mobile/Containers/Data/Application/NEW-CONTAINER-UUID/Documents/';
  const resolved = resolveAlbumCoverUri(relativeUri, currentDocDir);

  assert.equal(
    resolved,
    'file:///var/mobile/Containers/Data/Application/NEW-CONTAINER-UUID/Documents/album-covers/album-cover-123.jpg'
  );
});
