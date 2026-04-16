import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, AppState, type AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { Q } from '@nozbe/watermelondb';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { pasteTextFromClipboard } from '@services/clipboard/clipboardService';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';
import { extractTextFromImage, isOCRAvailable, type OCRBlock } from '@services/ocr';
import { supabase } from '@services/supabase/client';
import ImageCropperModal from '../../../components/ImageCropperModal';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import CacheStackUI from '../../../components/UI/CacheScreenUI/CacheStackUI';
import CacheInputModalUI from '../../../components/UI/CacheScreenUI/CacheInputModalUI';
import CameraModalUI from '../../../components/UI/CacheScreenUI/CameraModalUI';

type Props = {
  navigation: any;
};

type CacheCardRecord = {
  id: string;
  imageUri?: string;
  text: string;
  detectedPreview?: string;
  sourceLabel: string;
  importedAtLabel: string;
  cachedItem: CachedItem;
};

type CropperFlowTarget = 'quick-add' | 'swipe-image';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toSourceLabel(sourceApp?: string | null): string {
  const value = (sourceApp || '').trim().toLowerCase();
  if (!value) return 'Unknown';

  if (value === 'share_sheet' || value === 'share sheet') return 'Share Sheet';
  if (value === 'clipboard') return 'Clipboard';
  if (value === 'manual entry') return 'Manual Entry';
  if (value === 'quick add') return 'Quick Add';
  if (value === 'camera') return 'Camera';

  return sourceApp || 'Unknown';
}

function toRelativeImportTime(createdAt?: Date | null): string {
  if (!createdAt) return 'Unknown time';
  const ts = createdAt.getTime();
  if (!Number.isFinite(ts)) return 'Unknown time';

  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'Just now';

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'Just now';

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} hr ago`;

  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} d ago`;

  const week = Math.floor(day / 7);
  if (week < 5) return `${week} wk ago`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month} mo ago`;

  const year = Math.floor(day / 365);
  return `${year} yr ago`;
}

function getDetectedPreview(annotations: unknown): string | undefined {
  let rows: Array<{ text?: string }> = [];

  if (Array.isArray(annotations)) {
    rows = annotations as Array<{ text?: string }>;
  } else if (typeof annotations === 'string') {
    try {
      const parsed = JSON.parse(annotations);
      if (Array.isArray(parsed)) {
        rows = parsed as Array<{ text?: string }>;
      }
    } catch {
      rows = [];
    }
  }

  const words = rows
    .flatMap((item) => (item?.text || '').split(/\s+/))
    .map((word) => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').trim())
    .filter(Boolean);

  if (words.length === 0) return 'No text recognized';
  const compact = Array.from(new Set(words.map((word) => word.toLowerCase()))).slice(0, 4);
  const display = compact.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return `Detected words: ${display.join(', ')}${words.length > compact.length ? '...' : ''}`;
}

export default function CacheScreenFlow({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const [cacheItems, setCacheItems] = useState<CachedItem[]>([]);
  const [animationSeed, setAnimationSeed] = useState(0);
  const [restoreSeed, setRestoreSeed] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'text' | 'image'>('text');
  const [manualText, setManualText] = useState('');
  const [creatingImage, setCreatingImage] = useState(false);
  const [showQuickCamera, setShowQuickCamera] = useState(false);
  const [quickCameraFacing, setQuickCameraFacing] = useState<CameraType>('back');
  const [showUploadCropper, setShowUploadCropper] = useState(false);
  const [cropperFlowTarget, setCropperFlowTarget] = useState<CropperFlowTarget>('quick-add');
  const [pendingOriginalImageUri, setPendingOriginalImageUri] = useState<string | null>(null);
  const [pendingOriginalImageSize, setPendingOriginalImageSize] = useState<{ width: number; height: number } | null>(null);
  const [pendingSwipeImageItem, setPendingSwipeImageItem] = useState<CachedItem | null>(null);
  const [pendingOpenCropperAfterAddDismiss, setPendingOpenCropperAfterAddDismiss] = useState(false);
  const [suppressAddModalAnimation, setSuppressAddModalAnimation] = useState(false);
  const quickCameraRef = React.useRef<CameraView | null>(null);
  const [quickCameraPermission, requestQuickCameraPermission] = useCameraPermissions();
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const deletingItemIdsRef = React.useRef(new Set<string>());
  const hasFocusedOnceRef = React.useRef(false);
  const invalidCleanupRunningRef = React.useRef(false);
  const ocrProcessingIdsRef = React.useRef(new Set<string>());
  const ocrSettledIdsRef = React.useRef(new Set<string>());
  const [liveDetectedPreviewById, setLiveDetectedPreviewById] = useState<Record<string, string>>({});

  const openAddModal = React.useCallback(() => {
    setShowAddModal(true);
  }, []);

  useEffect(() => {
    if (!tabSwipeContext) return;
    tabSwipeContext.setCacheAddActionHandler(openAddModal);
    return () => {
      tabSwipeContext.setCacheAddActionHandler(null);
    };
  }, [openAddModal, tabSwipeContext]);

  useEffect(() => {
    const query = database
      .get<CachedItem>('cached_items')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const load = async () => {
      try {
        const data = await query.fetch();
        setCacheItems(data);
      } catch (error) {
        console.error('[CacheList] load cached items failed:', error);
        setCacheItems([]);
      }
    };

    void load();
    const sub = query.observe().subscribe((data) => setCacheItems(data));
    return () => sub.unsubscribe();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (hasFocusedOnceRef.current) {
        setRestoreSeed((prev) => prev + 1);
      } else {
        hasFocusedOnceRef.current = true;
      }
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      if ((prevState === 'background' || prevState === 'inactive') && nextState === 'active') {
        setAnimationSeed((prev) => prev + 1);
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const cards = useMemo<CacheCardRecord[]>(() => {
    return [...cacheItems].reverse().reduce<CacheCardRecord[]>((acc, item) => {
        const text = (
          item.contentText?.trim() ||
          item.userKeywords?.trim() ||
          item.contentUrl?.trim() ||
          ''
        );
        const imageUri =
          item.imageStoragePath ||
          item.mediaUri ||
          (item.contentType === 'image' ? item.contentUrl || undefined : undefined);
        const detectedPreview = imageUri
          ? liveDetectedPreviewById[item.id] ?? getDetectedPreview(item.imageAnnotations)
          : undefined;

        const hasText = text.length > 0;
        const hasImageSource = Boolean(imageUri);
        if (!hasText && !hasImageSource) {
          return acc;
        }

        acc.push({
          id: item.id,
          imageUri,
          text: hasText ? text : 'Image unavailable',
          detectedPreview,
          sourceLabel: toSourceLabel(item.sourceApp),
          importedAtLabel: toRelativeImportTime(item.createdAt),
          cachedItem: item,
        });
        return acc;
      }, []);
  }, [cacheItems, liveDetectedPreviewById]);

  const stackCards = useMemo(() => {
    return cards.map((item) => ({
      id: item.id,
      imageUri: item.imageUri,
      text: item.text,
      detectedPreview: item.detectedPreview,
      sourceLabel: item.sourceLabel,
      importedAtLabel: item.importedAtLabel,
    }));
  }, [cards]);

  const handleQuickAddText = React.useCallback(async () => {
    const trimmed = manualText.trim();
    if (!trimmed) return;
    try {
      await Clipboard.setStringAsync(trimmed);
      const userId = await getCurrentAuthUserId();
      if (!userId) {
        Alert.alert('需要登入', '請先登入後再使用文字新增。');
        return;
      }
      const result = await pasteTextFromClipboard(userId);
      if (!result.success) {
        Alert.alert('新增失敗', result.message || '無法新增文字快取。');
        return;
      }
      setManualText('');
      setShowAddModal(false);
    } catch (error) {
      console.error('[CacheList] quick add text failed:', error);
      Alert.alert('新增失敗', '無法新增文字快取，請稍後再試。');
    }
  }, [manualText]);

  const normalizeImageUriForCache = React.useCallback(async (imageUri: string): Promise<string> => {
    if (!imageUri) return imageUri;
    //if (imageUri.startsWith('file://')) return imageUri;
    try {
      const normalized = await ImageManipulator.manipulateAsync(
        imageUri,
        [],
        { compress: 0.98, format: ImageManipulator.SaveFormat.JPEG }
      );
      return normalized.uri || imageUri;
    } catch (error) {
      console.warn('[CacheList] normalize image uri failed, fallback to original:', error);
      return imageUri;
    }
  }, []);

  const runLocalOCRForPreview = React.useCallback(async (imageUri: string): Promise<OCRBlock[] | undefined> => {
    if (!imageUri || !isOCRAvailable()) return undefined;
    try {
      const result = await extractTextFromImage(imageUri);
      if (!Array.isArray(result.blocks) || result.blocks.length === 0) return undefined;
      return result.blocks;
    } catch (error) {
      console.warn('[CacheList] quick cache OCR failed:', error);
      return undefined;
    }
  }, []);

  const hasOCRAnnotations = React.useCallback((annotations: unknown): boolean => {
    if (annotations == null) return false;

    if (Array.isArray(annotations)) {
      return annotations.length > 0;
    }
    if (typeof annotations === 'string') {
      try {
        const parsed = JSON.parse(annotations);
        return Array.isArray(parsed) && parsed.length > 0;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  React.useEffect(() => {
    const activeIds = new Set(cacheItems.map((item) => item.id));
    for (const id of Array.from(ocrSettledIdsRef.current)) {
      if (!activeIds.has(id)) ocrSettledIdsRef.current.delete(id);
    }
    for (const id of Array.from(ocrProcessingIdsRef.current)) {
      if (!activeIds.has(id)) ocrProcessingIdsRef.current.delete(id);
    }
    setLiveDetectedPreviewById((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        if (!activeIds.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cacheItems]);

  React.useEffect(() => {
    let cancelled = false;

    const runBackfillOCR = async () => {
      const targets = cacheItems
        .filter((item) => {
        const imageUri =
          item.imageStoragePath ||
          item.mediaUri ||
          (item.contentType === 'image' ? item.contentUrl || undefined : undefined);
        if (!imageUri) return false;
        if (hasOCRAnnotations(item.imageAnnotations)) return false;
        if (ocrProcessingIdsRef.current.has(item.id)) return false;
        if (ocrSettledIdsRef.current.has(item.id)) return false;
        return true;
      })
        .sort((a, b) => {
          const aTs = a.createdAt?.getTime?.() ?? 0;
          const bTs = b.createdAt?.getTime?.() ?? 0;
          return bTs - aTs;
        });

      for (const item of targets) {
        if (cancelled) return;
        const baseUri =
          item.imageStoragePath ||
          item.mediaUri ||
          (item.contentType === 'image' ? item.contentUrl || undefined : undefined);
        if (!baseUri) continue;

        ocrProcessingIdsRef.current.add(item.id);
        setLiveDetectedPreviewById((prev) => ({ ...prev, [item.id]: 'text scanning...' }));
        try {
          const normalizedUri = await normalizeImageUriForCache(baseUri);
          const ocrBlocks = await runLocalOCRForPreview(normalizedUri);
          if (cancelled) return;

          const detectedPreview = getDetectedPreview(ocrBlocks);
          setLiveDetectedPreviewById((prev) => ({
            ...prev,
            [item.id]: detectedPreview || 'No text recognized',
          }));

          await database.write(async () => {
            await item.update((record) => {
              if ((!record.imageStoragePath || !record.imageStoragePath.startsWith('file://')) && normalizedUri) {
                record.imageStoragePath = normalizedUri;
              }
              record.imageAnnotations = (ocrBlocks || []) as any; 
            });
          });
        } catch (error) {
          console.warn('[CacheList] backfill OCR failed:', error);
        } finally {
          ocrProcessingIdsRef.current.delete(item.id);
          ocrSettledIdsRef.current.add(item.id);
        }
      }
    };

    void runBackfillOCR();
    return () => {
      cancelled = true;
    };
  }, [cacheItems, hasOCRAnnotations, normalizeImageUriForCache, runLocalOCRForPreview]);

  const createQuickImageCachedItems = React.useCallback(
    async (imageUris: string[]): Promise<number> => {
      const userId = await getCurrentAuthUserId();
      if (!userId) {
        Alert.alert('需要登入', '請先登入後再建立圖片卡片。');
        return 0;
      }

      const validUris = imageUris.filter(Boolean);
      if (validUris.length === 0) return 0;

      await database.write(async () => {
        const collection = database.get<CachedItem>('cached_items');
        for (const uri of validUris) {
          await collection.create((item) => {
            item.userId = userId;
            item.contentType = 'image';
            item.type = 'image';
            item.contentText = undefined;
            item.contentUrl = undefined;
            item.mediaUri = uri;
            item.imageStoragePath = uri;
            item.sourceApp = 'Quick Add';
            item.userKeywords = undefined;
            item.aiAnalysisCompleted = false;
            item.convertedToCard = false;
            item.imageAnnotations = undefined;

            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 10);
            item.expiresAt = expiresAt;
          });
        }
      });

      return validUris.length;
    },
    []
  );

  const handleUploadImageDirect = React.useCallback(async () => {
    try {
      setCreatingImage(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('需要相簿權限', '請允許相簿權限後再上傳圖片。');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 20,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;

      const pickedAssets = result.assets.filter((asset) => Boolean(asset.uri));
      if (pickedAssets.length === 0) return;

      if (pickedAssets.length > 1) {
        try {
          const createdCount = await createQuickImageCachedItems(
            pickedAssets.map((asset) => asset.uri).filter(Boolean) as string[]
          );
          if (createdCount > 0) {
            setShowAddModal(false);
          } else {
            Alert.alert('新增失敗', '沒有成功新增任何圖片快取。');
          }
        } catch (error) {
          console.error('[CacheList] batch image create failed:', error);
          Alert.alert('新增失敗', '批次新增圖片快取失敗，請稍後再試。');
        }
        return;
      }

      const picked = pickedAssets[0];
      setCropperFlowTarget('quick-add');
      setPendingSwipeImageItem(null);
      setPendingOriginalImageUri(picked.uri);
      setPendingOriginalImageSize(
        typeof picked.width === 'number' && typeof picked.height === 'number'
          ? { width: picked.width, height: picked.height }
          : null
      );
      setPendingOpenCropperAfterAddDismiss(true);
      setSuppressAddModalAnimation(true);
      setShowAddModal(false);
    } catch (error) {
      console.error('[CacheList] upload picker failed:', error);
      Alert.alert('圖片選擇失敗', '無法開啟相簿，請稍後再試。');
    } finally {
      setCreatingImage(false);
    }
  }, [createQuickImageCachedItems]);

  const handleCaptureImage = React.useCallback(async () => {
    if (!quickCameraPermission?.granted) {
      const permission = await requestQuickCameraPermission();
      if (!permission.granted) {
        Alert.alert('需要相機權限', '請允許相機權限後再拍照。');
        return;
      }
    }
    setCropperFlowTarget('quick-add');
    setPendingSwipeImageItem(null);
    setPendingOpenCropperAfterAddDismiss(false);
    setShowAddModal(false);
    setShowQuickCamera(true);
  }, [quickCameraPermission?.granted, requestQuickCameraPermission]);

  const closeQuickCamera = React.useCallback(() => {
    setShowQuickCamera(false);
  }, []);

  const toggleQuickCameraFacing = React.useCallback(() => {
    setQuickCameraFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const captureQuickPhoto = React.useCallback(async () => {
    try {
      const photo = await quickCameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) {
        Alert.alert('拍照失敗', '請再試一次');
        return;
      }
      setShowQuickCamera(false);
      setShowAddModal(false);
      setCropperFlowTarget('quick-add');
      setPendingSwipeImageItem(null);
      setPendingOriginalImageUri(photo.uri);
      setPendingOriginalImageSize(
        typeof photo.width === 'number' && typeof photo.height === 'number'
          ? { width: photo.width, height: photo.height }
          : null
      );
      setPendingOpenCropperAfterAddDismiss(false);
      setShowUploadCropper(true);
    } catch (error) {
      console.error('[CacheList] quick camera capture failed:', error);
      Alert.alert('拍照失敗', '請再試一次');
    }
  }, []);

  const createQuickImageCachedItem = React.useCallback(
    async (croppedUri: string, originalUri?: string | null): Promise<CachedItem | null> => {
      const userId = await getCurrentAuthUserId();
      if (!userId) {
        Alert.alert('需要登入', '請先登入後再建立圖片卡片。');
        return null;
      }

      let createdItem: CachedItem | null = null;
      await database.write(async () => {
        const collection = database.get<CachedItem>('cached_items');
        createdItem = await collection.create((item) => {
          item.userId = userId;
          item.contentType = 'image';
          item.type = 'image';
          item.contentText = undefined;
          item.contentUrl = undefined;
          item.mediaUri = originalUri || undefined;
          item.imageStoragePath = croppedUri;
          item.sourceApp = 'Quick Add';
          item.userKeywords = undefined;
          item.aiAnalysisCompleted = false;
          item.convertedToCard = false;
          item.imageAnnotations = undefined;

          const expiresAt = new Date();
          expiresAt.setMinutes(expiresAt.getMinutes() + 10);
          item.expiresAt = expiresAt;
        });
      });
      return createdItem;
    },
    []
  );

  const handleUploadCropCancel = React.useCallback(() => {
    const shouldReopenAddModal = cropperFlowTarget === 'quick-add';
    setShowUploadCropper(false);
    setPendingOriginalImageUri(null);
    setPendingOriginalImageSize(null);
    setPendingSwipeImageItem(null);
    setCropperFlowTarget('quick-add');
    setAddTab('image');
    if (shouldReopenAddModal) {
      setShowAddModal(true);
    }
  }, [cropperFlowTarget]);

  const handleUploadCropConfirm = React.useCallback(
    async (croppedUri: string) => {
      const originalUri = pendingOriginalImageUri;
      setShowUploadCropper(false);
      setPendingOriginalImageUri(null);
      setPendingOriginalImageSize(null);
      setPendingOpenCropperAfterAddDismiss(false);
      if (cropperFlowTarget === 'swipe-image' && pendingSwipeImageItem) {
        navigation.navigate('CreateCard', {
          cachedItem: pendingSwipeImageItem,
          croppedImageUri: croppedUri,
          originalImageUri: originalUri,
          runOcrOnLoad: true,
        });
      } else {
        try {
          const quickItem = await createQuickImageCachedItem(croppedUri, originalUri);
          if (!quickItem) return;
          navigation.navigate('CreateCard', {
            cachedItem: quickItem,
            croppedImageUri: croppedUri,
            originalImageUri: originalUri,
          });
        } catch (error) {
          console.error('[CacheList] create quick image item failed:', error);
          Alert.alert('建立失敗', '無法建立圖片卡片，請稍後再試。');
          return;
        }
      }
      setPendingSwipeImageItem(null);
      setCropperFlowTarget('quick-add');
    },
    [
      createQuickImageCachedItem,
      cropperFlowTarget,
      navigation,
      pendingOriginalImageUri,
      pendingSwipeImageItem,
    ]
  );

  const handleInputModalDismiss = React.useCallback(() => {
    if (pendingOpenCropperAfterAddDismiss && pendingOriginalImageUri) {
      setShowUploadCropper(true);
      setPendingOpenCropperAfterAddDismiss(false);
    }
    if (suppressAddModalAnimation) {
      setSuppressAddModalAnimation(false);
    }
  }, [pendingOpenCropperAfterAddDismiss, pendingOriginalImageUri, suppressAddModalAnimation]);

  const deleteCacheItemPermanently = React.useCallback(async (
    item: CachedItem,
    options?: { silent?: boolean }
  ) => {
    if (deletingItemIdsRef.current.has(item.id)) return;
    deletingItemIdsRef.current.add(item.id);
    try {
      const userId = item.userId || (await getCurrentAuthUserId());
      if (!userId) {
        throw new Error('Missing user id for deletion');
      }

      // Some legacy/local-only rows may use non-UUID ids and cannot exist in Supabase UUID PK.
      // In that case, skip remote delete and only hard-delete locally.
      if (isUuid(item.id)) {
        const { error: remoteDeleteError } = await supabase
          .from('cached_items')
          .delete()
          .eq('id', item.id)
          .eq('user_id', userId);
        if (remoteDeleteError) {
          throw remoteDeleteError;
        }
      }

      await database.write(async () => {
        await item.destroyPermanently();
      });
    } catch (error) {
      console.error('[CacheList] delete cache item failed:', error);
      if (!options?.silent) {
        Alert.alert('刪除失敗', '無法同步刪除到後端，請稍後再試。');
      }
    } finally {
      deletingItemIdsRef.current.delete(item.id);
    }
  }, []);

  useEffect(() => {
    if (cacheItems.length === 0) return;
    if (invalidCleanupRunningRef.current) return;

    let cancelled = false;
    invalidCleanupRunningRef.current = true;
    const runInvalidImageCleanup = async () => {
      try {
        const invalidItems: CachedItem[] = [];

        for (const item of cacheItems) {
          if (item.contentType !== 'image') continue;
          if (deletingItemIdsRef.current.has(item.id)) continue;

          const imageSource =
            item.imageStoragePath?.trim() ||
            item.mediaUri?.trim() ||
            item.contentUrl?.trim() ||
            '';

          if (!imageSource) {
            invalidItems.push(item);
            continue;
          }

          const lower = imageSource.toLowerCase();
          const isHttpRemote = lower.startsWith('http://') || lower.startsWith('https://');
          const isLocalPath =
            lower.startsWith('file://') ||
            imageSource.startsWith('/') ||
            lower.startsWith('content://') ||
            lower.startsWith('ph://');

          if (!isHttpRemote && !isLocalPath) {
            invalidItems.push(item);
            continue;
          }

          const needsLocalExistenceCheck = lower.startsWith('file://') || imageSource.startsWith('/');
          if (!needsLocalExistenceCheck) continue;

          const normalizedLocalPath = imageSource.startsWith('file://')
            ? imageSource
            : `file://${imageSource}`;
          try {
            const info = await FileSystem.getInfoAsync(normalizedLocalPath);
            if (!info.exists) {
              invalidItems.push(item);
            }
          } catch {
            invalidItems.push(item);
          }
        }

        if (cancelled || invalidItems.length === 0) return;
        for (const item of invalidItems) {
          if (cancelled) return;
          // eslint-disable-next-line no-await-in-loop
          await deleteCacheItemPermanently(item, { silent: true });
        }
      } finally {
        invalidCleanupRunningRef.current = false;
      }
    };

    void runInvalidImageCleanup();
    return () => {
      cancelled = true;
    };
  }, [cacheItems, deleteCacheItemPermanently]);

  const handleCardImageError = React.useCallback(
    (itemId: string) => {
      const target = cards.find((card) => card.id === itemId);
      if (!target) return;
      void deleteCacheItemPermanently(target.cachedItem, { silent: true });
    },
    [cards, deleteCacheItemPermanently]
  );

  const handleCardSwipe = React.useCallback(
    (itemId: string, direction: 'left' | 'right') => {
      const target = cards.find((card) => card.id === itemId);
      if (!target) return;

      if (direction === 'right') {
        const isImageCard =
          target.cachedItem.contentType === 'image' ||
          Boolean(target.cachedItem.mediaUri || target.cachedItem.imageStoragePath);

        if (isImageCard) {
          const imageUri =
            target.cachedItem.imageStoragePath ||
            target.cachedItem.mediaUri ||
            target.cachedItem.contentUrl ||
            target.imageUri ||
            null;
          if (!imageUri) {
            Alert.alert('找不到圖片', '這張圖片卡沒有可裁切的圖片來源。');
            return;
          }
          setCropperFlowTarget('swipe-image');
          setPendingSwipeImageItem(target.cachedItem);
          setPendingOriginalImageUri(imageUri);
          setPendingOriginalImageSize(null);
          setShowUploadCropper(true);
          return;
        }

        navigation.navigate('CreateCard', { cachedItem: target.cachedItem });
        return;
      }

      void deleteCacheItemPermanently(target.cachedItem);
    },
    [cards, deleteCacheItemPermanently, navigation]
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* 底層：深邃的午夜藍到純黑 */}
        <LinearGradient
          colors={['#0F1322', '#0A0B10', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* 新增：跨平台相容的底部溫潤光暈 (Orb) */}
        <View style={styles.glowCenter}>
          <View style={[styles.orbLayer, { width: 400, height: 400, borderRadius: 200, opacity: 0.04 }]} />
          <View style={[styles.orbLayer, { width: 300, height: 300, borderRadius: 150, opacity: 0.08 }]} />
          <View style={[styles.orbLayer, { width: 200, height: 200, borderRadius: 100, opacity: 0.12 }]} />
          <View style={[styles.orbLayer, { width: 100, height: 100, borderRadius: 50, opacity: 0.15 }]} />
        </View>
      </View>

      <View pointerEvents="none" style={[styles.brandWrap, { top: insets.top + 6 }]}>
        <Text style={styles.brandText}>Nuances</Text>
      </View>

      <CacheStackUI
        cards={stackCards}
        animationSeed={animationSeed}
        restoreSeed={restoreSeed}
        onCardSwipe={handleCardSwipe}
        onCardImageError={handleCardImageError}
      />

      <CacheInputModalUI
        visible={showAddModal}
        suppressAnimation={suppressAddModalAnimation}
        addTab={addTab}
        manualText={manualText}
        creatingImage={creatingImage}
        onClose={() => setShowAddModal(false)}
        onDismiss={handleInputModalDismiss}
        onTabChange={setAddTab}
        onManualTextChange={setManualText}
        onSubmitText={handleQuickAddText}
        onUploadImage={() => void handleUploadImageDirect()}
        onCaptureImage={handleCaptureImage}
      />

      <ImageCropperModal
        visible={showUploadCropper}
        imageUri={pendingOriginalImageUri}
        initialImageSize={pendingOriginalImageSize}
        modalAnimationType="slide"
        onCancel={handleUploadCropCancel}
        onConfirm={handleUploadCropConfirm}
      />

      <CameraModalUI
        visible={showQuickCamera}
        hasPermission={Boolean(quickCameraPermission?.granted)}
        cameraRef={quickCameraRef}
        facing={quickCameraFacing}
        onClose={closeQuickCamera}
        onToggleFacing={toggleQuickCameraFacing}
        onCapture={() => void captureQuickPhoto()}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  brandWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 12,
    alignItems: 'center',
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  // --- 新增的 Orb 樣式 ---
  glowCenter: {
    position: 'absolute',
    bottom: -80, // 控制光暈在螢幕底部的位置
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbLayer: {
    position: 'absolute',
    backgroundColor: '#5882FF', // 溫潤的藍紫色光芒
    shadowColor: '#5882FF',
    shadowOpacity: 0.5,
    shadowRadius: 30, // 讓 iOS 表現更好，Android 則靠著 opacity 疊加來過渡
  },
});
