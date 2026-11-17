// Pure helpers for "which cards belong to a tag-driven album".
//
// Albums are stored as `album:<id>` entries inside a card's JSON `tags`
// column. Any list that shows an album's cards MUST be driven by that column
// (not by a cardIds snapshot) so it re-queries when tags change.
// See albumQuery.test.mjs for the regression guards.

export const ALBUM_TAG_PREFIX = 'album:';

/** LIKE pattern matching the exact JSON string element `"album:<id>"`. */
export function buildAlbumTagLikePattern(albumId: string): string {
  const needle = `${ALBUM_TAG_PREFIX}${albumId}`.replace(/[%_\\]/g, (c) => `\\${c}`);
  // Trailing quote stops `album:custom-1` from also matching `album:custom-12`.
  return `%${needle}"%`;
}

/** JS-side twin of the SQL pattern, used for tests and in-memory checks. */
export function cardHasAlbumTag(tags: unknown, albumId: string): boolean {
  const raw = Array.isArray(tags) ? JSON.stringify(tags) : String(tags ?? '');
  return raw.toLowerCase().includes(`${ALBUM_TAG_PREFIX}${albumId}"`.toLowerCase());
}
