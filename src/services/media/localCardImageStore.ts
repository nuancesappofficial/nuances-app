import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystemLegacy from 'expo-file-system/legacy';

const LOCAL_CARD_IMAGE_MAP_KEY = 'local_card_image_map_v1';
const LOCAL_CARD_IMAGE_DIR = `${FileSystemLegacy.documentDirectory || ''}card-images/`;

let cacheMap: Record<string, string> | null = null;

function toFileUri(input: string): string {
  if (!input) return input;
  return input.startsWith('file://') ? input : `file://${input}`;
}

function getExt(uri: string): string {
  const clean = uri.split('?')[0] || '';
  const dot = clean.lastIndexOf('.');
  if (dot < 0) return 'jpg';
  const ext = clean.slice(dot + 1).toLowerCase();
  if (!ext) return 'jpg';
  return ext;
}

async function loadMap(): Promise<Record<string, string>> {
  if (cacheMap) return cacheMap;
  try {
    const raw = await AsyncStorage.getItem(LOCAL_CARD_IMAGE_MAP_KEY);
    if (!raw) {
      cacheMap = {};
      return cacheMap;
    }
    const parsed = JSON.parse(raw) as Record<string, string>;
    cacheMap = parsed && typeof parsed === 'object' ? parsed : {};
    return cacheMap;
  } catch {
    cacheMap = {};
    return cacheMap;
  }
}

async function saveMap(nextMap: Record<string, string>): Promise<void> {
  cacheMap = nextMap;
  await AsyncStorage.setItem(LOCAL_CARD_IMAGE_MAP_KEY, JSON.stringify(nextMap));
}

async function ensureLocalDir(): Promise<void> {
  const dirInfo = await FileSystemLegacy.getInfoAsync(LOCAL_CARD_IMAGE_DIR);
  if (!dirInfo.exists) {
    await FileSystemLegacy.makeDirectoryAsync(LOCAL_CARD_IMAGE_DIR, { intermediates: true });
  }
}

export async function persistLocalCardImage(cardId: string, sourceUri?: string | null): Promise<string | null> {
  const normalizedCardId = (cardId || '').trim();
  const normalizedSource = (sourceUri || '').trim();
  if (!normalizedCardId || !normalizedSource) return null;
  if (/^https?:\/\//i.test(normalizedSource)) return null;

  const sourceFileUri = toFileUri(normalizedSource);
  const sourceInfo = await FileSystemLegacy.getInfoAsync(sourceFileUri);
  if (!sourceInfo.exists) return null;

  await ensureLocalDir();
  const ext = getExt(sourceFileUri);
  const targetUri = `${LOCAL_CARD_IMAGE_DIR}${normalizedCardId}.${ext}`;
  await FileSystemLegacy.copyAsync({
    from: sourceFileUri,
    to: targetUri,
  });
  const targetInfo = await FileSystemLegacy.getInfoAsync(targetUri);
  if (!targetInfo.exists) return null;

  const map = await loadMap();
  const nextMap = { ...map, [normalizedCardId]: targetUri };
  await saveMap(nextMap);
  return targetUri;
}

export async function persistRemoteCardImage(cardId: string, remoteUri?: string | null): Promise<string | null> {
  const normalizedCardId = (cardId || '').trim();
  const normalizedRemote = (remoteUri || '').trim();
  if (!normalizedCardId || !normalizedRemote) return null;
  if (!/^https?:\/\//i.test(normalizedRemote)) return null;

  await ensureLocalDir();
  const clean = normalizedRemote.split('?')[0] || '';
  const ext = getExt(clean);
  const targetUri = `${LOCAL_CARD_IMAGE_DIR}${normalizedCardId}.${ext}`;
  try {
    await FileSystemLegacy.downloadAsync(normalizedRemote, targetUri);
  } catch {
    return null;
  }

  const targetInfo = await FileSystemLegacy.getInfoAsync(targetUri);
  if (!targetInfo.exists) return null;
  const map = await loadMap();
  const nextMap = { ...map, [normalizedCardId]: targetUri };
  await saveMap(nextMap);
  return targetUri;
}

export async function getLocalCardImageUri(cardId?: string | null): Promise<string | null> {
  const normalizedCardId = (cardId || '').trim();
  if (!normalizedCardId) return null;
  const map = await loadMap();
  const uri = (map[normalizedCardId] || '').trim();
  if (!uri) return null;

  const fileUri = toFileUri(uri);
  const info = await FileSystemLegacy.getInfoAsync(fileUri);
  if (!info.exists) {
    const nextMap = { ...map };
    delete nextMap[normalizedCardId];
    await saveMap(nextMap);
    return null;
  }
  return fileUri;
}
