// Expo FileSystem's documentDirectory is resolved dynamically at runtime.
// For testing in Node.js environments where expo-file-system cannot be imported directly,
// we resolve it safely with fallback.
let cachedDocDir: string | null = null;

function getRuntimeDocumentDirectory(): string {
  if (cachedDocDir !== null) {
    return cachedDocDir;
  }
  try {
    // Dynamic require so node test environments don't fail parsing expo-file-system
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileSystem = require('expo-file-system');
    cachedDocDir = (FileSystem.documentDirectory as string) || '';
  } catch {
    cachedDocDir = '';
  }
  return cachedDocDir;
}

/**
 * Resolves a stored album cover URI against the current app container's document directory.
 * On iOS, the sandbox container UUID changes on app updates/reinstalls.
 * Any persisted absolute file:// path pointing into album-covers must be mapped to the current Document directory.
 *
 * @param storedUri The persisted URI string
 * @param baseDocDir Optional base directory for testing; defaults to FileSystem.documentDirectory
 */
export function resolveAlbumCoverUri(
  storedUri?: string,
  baseDocDir?: string | null
): string | undefined {
  if (!storedUri) {
    return storedUri;
  }

  // Remote URLs or non-album-cover assets should remain unchanged
  if (
    storedUri.startsWith('http://') ||
    storedUri.startsWith('https://') ||
    storedUri.startsWith('asset:')
  ) {
    return storedUri;
  }

  const docDir =
    baseDocDir !== undefined ? (baseDocDir || '') : getRuntimeDocumentDirectory();
  const normalizedDocDir = docDir.endsWith('/') ? docDir : `${docDir}/`;

  // Pattern 1: Relative path like "album-covers/album-cover-xxx.jpg"
  if (storedUri.startsWith('album-covers/')) {
    return `${normalizedDocDir}${storedUri}`;
  }

  // Pattern 2: Absolute file:// URI that contains /album-covers/
  const albumCoversIndex = storedUri.indexOf('/album-covers/');
  if (albumCoversIndex !== -1) {
    const relativeSubpath = storedUri.slice(albumCoversIndex + 1); // "album-covers/xxx.jpg"
    return `${normalizedDocDir}${relativeSubpath}`;
  }

  return storedUri;
}
