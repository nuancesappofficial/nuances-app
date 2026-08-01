import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';

const LOCAL_CARD_IMAGE_MAP_KEY = 'local_card_image_map_v1';

const cacheMaps = new Map<string, Record<string, string>>();

type ImageScope = {
  userId: string;
  storageKey: string;
  directory: string;
};

async function getImageScope(): Promise<ImageScope | null> {
  const userId = await getCurrentSessionUserId();
  if (!userId) return null;
  return {
    userId,
    storageKey: `${LOCAL_CARD_IMAGE_MAP_KEY}:${userId}`,
    directory: `${FileSystemLegacy.documentDirectory || ''}card-images/${userId}/`,
  };
}

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

async function loadMap(scope: ImageScope): Promise<Record<string, string>> {
  const cached = cacheMaps.get(scope.userId);
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(scope.storageKey);
    if (!raw) {
      const emptyMap = {};
      cacheMaps.set(scope.userId, emptyMap);
      return emptyMap;
    }
    const parsed = JSON.parse(raw) as Record<string, string>;
    const nextMap = parsed && typeof parsed === 'object' ? parsed : {};
    cacheMaps.set(scope.userId, nextMap);
    return nextMap;
  } catch {
    const emptyMap = {};
    cacheMaps.set(scope.userId, emptyMap);
    return emptyMap;
  }
}

async function saveMap(scope: ImageScope, nextMap: Record<string, string>): Promise<void> {
  cacheMaps.set(scope.userId, nextMap);
  await AsyncStorage.setItem(scope.storageKey, JSON.stringify(nextMap));
}

async function ensureLocalDir(scope: ImageScope): Promise<void> {
  const dirInfo = await FileSystemLegacy.getInfoAsync(scope.directory);
  if (!dirInfo.exists) {
    await FileSystemLegacy.makeDirectoryAsync(scope.directory, { intermediates: true });
  }
}

export async function persistLocalCardImage(cardId: string, sourceUri?: string | null): Promise<string | null> {
  const normalizedCardId = (cardId || '').trim();
  const normalizedSource = (sourceUri || '').trim();
  if (!normalizedCardId || !normalizedSource) return null;
  if (/^https?:\/\//i.test(normalizedSource)) return null;
  const scope = await getImageScope();
  if (!scope) return null;

  const sourceFileUri = toFileUri(normalizedSource);
  const sourceInfo = await FileSystemLegacy.getInfoAsync(sourceFileUri);
  if (!sourceInfo.exists) return null;

  await ensureLocalDir(scope);
  const ext = getExt(sourceFileUri);
  const targetUri = `${scope.directory}${normalizedCardId}.${ext}`;
  await FileSystemLegacy.copyAsync({
    from: sourceFileUri,
    to: targetUri,
  });
  const targetInfo = await FileSystemLegacy.getInfoAsync(targetUri);
  if (!targetInfo.exists) return null;

  const map = await loadMap(scope);
  const nextMap = { ...map, [normalizedCardId]: targetUri };
  await saveMap(scope, nextMap);
  return targetUri;
}

export async function persistRemoteCardImage(cardId: string, remoteUri?: string | null): Promise<string | null> {
  const normalizedCardId = (cardId || '').trim();
  const normalizedRemote = (remoteUri || '').trim();
  if (!normalizedCardId || !normalizedRemote) return null;
  if (!/^https?:\/\//i.test(normalizedRemote)) return null;
  const scope = await getImageScope();
  if (!scope) return null;

  await ensureLocalDir(scope);
  const clean = normalizedRemote.split('?')[0] || '';
  const ext = getExt(clean);
  const targetUri = `${scope.directory}${normalizedCardId}.${ext}`;
  try {
    await FileSystemLegacy.downloadAsync(normalizedRemote, targetUri);
  } catch {
    return null;
  }

  const targetInfo = await FileSystemLegacy.getInfoAsync(targetUri);
  if (!targetInfo.exists) return null;
  const map = await loadMap(scope);
  const nextMap = { ...map, [normalizedCardId]: targetUri };
  await saveMap(scope, nextMap);
  return targetUri;
}

export async function getLocalCardImageUri(cardId?: string | null): Promise<string | null> {
  const normalizedCardId = (cardId || '').trim();
  if (!normalizedCardId) return null;
  const scope = await getImageScope();
  if (!scope) return null;
  const map = await loadMap(scope);
  const uri = (map[normalizedCardId] || '').trim();
  if (!uri) return null;

  const fileUri = toFileUri(uri);
  const info = await FileSystemLegacy.getInfoAsync(fileUri);
  if (!info.exists) {
    const nextMap = { ...map };
    delete nextMap[normalizedCardId];
    await saveMap(scope, nextMap);
    return null;
  }
  return fileUri;
}
