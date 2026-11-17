import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildAlbumTagLikePattern,
  cardHasAlbumTag,
} from './albumQuery.ts';

test('card with album tag is found by that album', () => {
  assert.equal(cardHasAlbumTag(['create-flow', 'album:custom-1-abc'], 'custom-1-abc'), true);
});

test('card without the tag is not in the album', () => {
  assert.equal(cardHasAlbumTag(['create-flow'], 'custom-1-abc'), false);
});

test('album id that is a prefix of another does not match', () => {
  assert.equal(cardHasAlbumTag(['album:custom-12'], 'custom-1'), false);
});

test('pattern anchors on the closing JSON quote', () => {
  assert.equal(buildAlbumTagLikePattern('custom-1-abc'), '%album:custom-1-abc"%');
});

// ---- Source guards for the "card not showing in album" regression --------
// Root cause (2026-11): album view queried `id IN album.cardIds` (a navigation
// snapshot) and the deck observed cards with plain .observe(), so tag-only
// edits never re-ran any query. These guards fail if either comes back.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('AlbumView drives custom albums from the tags column', () => {
  const src = read('../../screens/flow/DeckScreenFlow/AlbumViewFlow.tsx');
  assert.match(src, /buildAlbumTagLikePattern/);
});

test('Deck main observes the tags column so tag edits refresh albums', () => {
  const src = read('../../screens/flow/DeckScreenFlow/DeckMainFlow.tsx');
  assert.match(src, /observeWithColumns\(\['tags'\]\)/);
});
