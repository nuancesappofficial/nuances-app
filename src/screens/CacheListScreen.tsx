import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
  AppState,
  AppStateStatus,
  Animated,
  ScrollView,
  TextInput,
  Modal,
  Pressable,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import { Q } from '@nozbe/watermelondb';
import { pasteTextFromClipboard } from '@services/clipboard/clipboardService';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';
import { getSyncErrorMessage, syncWithRetry } from '@services/sync';
import { loadUserSettings } from '@services/settings/userSettings';
import SubscriptionService from '@services/subscription/SubscriptionService';
import { useShareExtensionSnackbar } from '../contexts/ShareExtensionContext';
import { TabSwipeContext } from '../contexts/TabSwipeContext';
import ImageCropperModal from '../components/ImageCropperModal';
import Card from '../components/Card';

/** WatermelonDB @json 讀出時可能已是陣列，避免對陣列做 JSON.parse 導致閃退 */
function getAnnotationsArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }
  return [];
}

type Props = {
  navigation: any;
};

const SNACKBAR_DURATION = 2500;
const CREATE_CARD_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FREE_CACHE_ITEM_LIMIT = 10;
const FREE_CACHE_TTL_MS = 10 * 60 * 1000;
const PREMIUM_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STACK_OFFSETS = [
  { y: 0, scale: 1, opacity: 1 },
  { y: 24, scale: 0.96, opacity: 0.72 },
  { y: 48, scale: 0.92, opacity: 0.45 },
  { y: 72, scale: 0.88, opacity: 0.25 },
];
const MAX_VISIBLE_STACK = 4;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;

function getDisplayExpiry(item: CachedItem, isPremiumUser: boolean): number {
  const expiresAt = item.expiresAt ? new Date(item.expiresAt).getTime() : NaN;
  if (Number.isFinite(expiresAt)) return expiresAt;
  const createdAt = new Date(item.createdAt).getTime();
  const ttl = isPremiumUser ? PREMIUM_CACHE_TTL_MS : FREE_CACHE_TTL_MS;
  return createdAt + ttl;
}

function formatRemainingTime(targetTs: number, nowTs: number): string {
  const diffMs = targetTs - nowTs;
  if (diffMs <= 0) return '已到期';
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}天 ${hours}小時`;
  if (hours > 0) return `${hours}小時 ${minutes}分`;
  return `${minutes}分`;
}

function formatRelativeTime(input: Date | string): string {
  const now = Date.now();
  const ts = new Date(input).getTime();
  const diff = now - ts;
  if (diff < 60 * 1000) return '剛剛';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分鐘前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小時前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

function toTimestamp(value: Date | string | number | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function getPrimaryText(item: CachedItem): string {
  if (item.contentText?.trim()) return item.contentText.trim();
  if (item.contentType === 'image') return '圖片內容（可進入編輯與 OCR）';
  if (item.contentUrl?.trim()) return item.contentUrl.trim();
  return 'No content';
}

function getSuggested(item: CachedItem): string {
  const kw = (item.userKeywords || '').trim();
  if (kw) return kw.split(/[\n,]/)[0]?.trim() || kw;
  if (Array.isArray(item.aiHighlightedTerms) && item.aiHighlightedTerms.length > 0) {
    const first = item.aiHighlightedTerms[0]?.trim();
    if (first) return first;
  }
  return item.contentType === 'image' ? 'image phrase' : 'key phrase';
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightedText({ text, keyword, style }: { text: string; keyword: string; style?: any }) {
  if (!keyword.trim()) {
    return (
      <Text numberOfLines={5} style={style}>
        {text}
      </Text>
    );
  }

  const safe = escapeRegExp(keyword.trim());
  const reg = new RegExp(`(${safe})`, 'ig');
  const parts = text.split(reg);
  return (
    <Text numberOfLines={5} style={style}>
      {parts.map((part, idx) => {
        if (part.toLowerCase() === keyword.toLowerCase()) {
          return (
            <Text key={`${part}-${idx}`} style={styles.highlightText}>
              {part}
            </Text>
          );
        }
        return <Text key={`${part}-${idx}`}>{part}</Text>;
      })}
    </Text>
  );
}

export default function CacheListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const [refreshing, setRefreshing] = React.useState(false);
  const [cachedItems, setCachedItems] = React.useState<CachedItem[]>([]);
  const [isPremiumUser, setIsPremiumUser] = React.useState(false);
  const [nowTs, setNowTs] = React.useState(Date.now());
  const [snackbarVisible, setSnackbarVisible] = React.useState(false);
  const [clipboardMode, setClipboardMode] = React.useState<'active' | 'passive'>('passive');
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [addTab, setAddTab] = React.useState<'text' | 'image'>('text');
  const [manualText, setManualText] = React.useState('');
  const [creatingImage, setCreatingImage] = React.useState(false);
  const [showQuickCamera, setShowQuickCamera] = React.useState(false);
  const [quickCameraFacing, setQuickCameraFacing] = React.useState<CameraType>('back');
  const [showUploadCropper, setShowUploadCropper] = React.useState(false);
  const [pendingOriginalImageUri, setPendingOriginalImageUri] = React.useState<string | null>(null);
  const [pendingOriginalImageSize, setPendingOriginalImageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [pendingOpenCropperAfterAddDismiss, setPendingOpenCropperAfterAddDismiss] = React.useState(false);
  const [suppressAddModalAnimation, setSuppressAddModalAnimation] = React.useState(false);
  const [gridView, setGridView] = React.useState(false);
  const snackbarOpacity = React.useRef(new Animated.Value(0)).current;
  const lastProcessedClipboard = React.useRef<string>('');
  const appState = React.useRef(AppState.currentState);
  const isScreenFocused = React.useRef(false);
  const isCheckingClipboard = React.useRef(false);
  const lastCheckTime = React.useRef(0);
  const isSyncing = React.useRef(false);
  const { consumeShareSnackbar, snackbarSignal } = useShareExtensionSnackbar();

  const [snackbarMessage, setSnackbarMessage] = React.useState('卡片已建立');
  const dragX = React.useRef(new Animated.Value(0)).current;
  const dragY = React.useRef(new Animated.Value(0)).current;
  const [isDragging, setIsDragging] = React.useState(false);
  const [swipeDecision, setSwipeDecision] = React.useState<null | 'left' | 'right'>(null);
  const stackAreaRef = React.useRef<View | null>(null);
  const quickCameraRef = React.useRef<CameraView | null>(null);
  const [quickCameraPermission, requestQuickCameraPermission] = useCameraPermissions();
  const CONDENSED_HEADER_HEIGHT = 100;
  const TABBAR_HEIGHT = 64;
  const CARD_BOTTOM_OFFSET = TABBAR_HEIGHT + Math.max(insets.bottom, 8) + 20;
  const CARD_HEIGHT = Math.max(280, SCREEN_HEIGHT - CONDENSED_HEADER_HEIGHT - TABBAR_HEIGHT - insets.bottom - 40);
  const SWIPE_THRESHOLD = Math.max(92, CARD_WIDTH * 0.24);
  const CARD_EXIT_X = CARD_WIDTH + 120;
  const ROTATION_RANGE = Math.min(260, CARD_WIDTH * 0.55);

  const displayItems = React.useMemo(() => {
    return [...cachedItems].sort((a, b) => {
      const bTs = toTimestamp((b as any).updatedAt) || toTimestamp((b as any).createdAt);
      const aTs = toTimestamp((a as any).updatedAt) || toTimestamp((a as any).createdAt);
      return bTs - aTs;
    });
  }, [cachedItems]);

  const topCard = displayItems[0];
  const visibleStack = React.useMemo(() => displayItems.slice(0, MAX_VISIBLE_STACK), [displayItems]);
  const usageText = `${cachedItems.length}/${isPremiumUser ? '∞' : FREE_CACHE_ITEM_LIMIT}`;

  const triggerLightHaptic = React.useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  const hasValidCreateCardDraft = React.useCallback(async (item: CachedItem): Promise<boolean> => {
    try {
      const key = `create_card_draft:${item.userId}:${item.id}`;
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { updatedAt?: number };
      if (typeof parsed.updatedAt !== 'number') return false;
      return Date.now() - parsed.updatedAt <= CREATE_CARD_DRAFT_TTL_MS;
    } catch {
      return false;
    }
  }, []);

  const handleOpenCachedItem = React.useCallback(
    async (item: CachedItem) => {
      const isExpired = Date.now() > getDisplayExpiry(item, isPremiumUser);
      if (!isPremiumUser && isExpired) {
        Alert.alert('此快取已到期', '升級訂閱即可重新使用已到期快取。', [
          { text: '稍後', style: 'cancel' },
          {
            text: '前往設定',
            onPress: () => {
              if (tabSwipeContext) {
                tabSwipeContext.goToTab(2);
                return;
              }
              navigation.navigate('Profile');
            },
          },
        ]);
        return;
      }

      const hasDraft = await hasValidCreateCardDraft(item);
      if (hasDraft) {
        navigation.navigate('CreateCard', { cachedItem: item });
        return;
      }

      if (item.contentType === 'image') {
        navigation.navigate('CreateCard', { cachedItem: item });
        return;
      }

      navigation.navigate('CreateCard', { cachedItem: item });
    },
    [hasValidCreateCardDraft, isPremiumUser, navigation]
  );

  const showSnackbar = React.useCallback(
    (message?: string) => {
      setSnackbarMessage(message ?? '卡片已建立');
      setSnackbarVisible(true);
      Animated.sequence([
        Animated.timing(snackbarOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(SNACKBAR_DURATION),
        Animated.timing(snackbarOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setSnackbarVisible(false));
    },
    [snackbarOpacity]
  );

  const checkClipboard = React.useCallback(
    async (interactive = false) => {
      const now = Date.now();
      if (isCheckingClipboard.current || now - lastCheckTime.current < 1000) {
        return;
      }

      isCheckingClipboard.current = true;
      lastCheckTime.current = now;

      try {
        const currentText = await Clipboard.getStringAsync();

        if (!currentText || currentText.trim().length === 0) {
          if (interactive) {
            Alert.alert('剪貼簿是空的', '目前沒有可貼上的文字內容。');
          }
          return;
        }

        if (currentText === lastProcessedClipboard.current) {
          if (interactive) {
            Alert.alert('已是最新內容', '這段文字已經貼上過了。');
          }
          return;
        }

        lastProcessedClipboard.current = currentText;
        const userId = await getCurrentAuthUserId();
        if (!userId) {
          if (interactive) {
            Alert.alert('需要登入', '請先登入後再使用貼上功能。');
          }
          return;
        }
        const result = await pasteTextFromClipboard(userId);

        if (result.success) {
          showSnackbar('已從剪貼簿新增 1 筆快取');
        } else if (interactive) {
          Alert.alert('貼上失敗', result.message || '無法將剪貼簿內容加入快取。');
        }
      } catch (error) {
        console.error('[CacheList] Clipboard error:', error);
        if (interactive) {
          Alert.alert('貼上失敗', '剪貼簿讀取失敗，請稍後再試。');
        }
      } finally {
        setTimeout(() => {
          isCheckingClipboard.current = false;
        }, 1000);
      }
    },
    [showSnackbar]
  );

  const openAddModal = React.useCallback(() => {
    if (!isPremiumUser && cachedItems.length >= FREE_CACHE_ITEM_LIMIT) {
      Alert.alert('訪客方案已達上限', '升級訂閱即可新增更多快取。', [
        { text: '稍後', style: 'cancel' },
        {
          text: '前往設定',
          onPress: () => {
            if (tabSwipeContext) {
              tabSwipeContext.goToTab(2);
              return;
            }
            navigation.navigate('Profile');
          },
        },
      ]);
      return;
    }
    setShowAddModal(true);
  }, [cachedItems.length, isPremiumUser, navigation, tabSwipeContext]);

  const tryShowShareSnackbar = React.useCallback(() => {
    const message = consumeShareSnackbar();
    if (message) showSnackbar(message);
  }, [consumeShareSnackbar, showSnackbar]);

  React.useEffect(() => {
    if (!snackbarSignal) return;
    const message = consumeShareSnackbar();
    if (message) showSnackbar(message);
  }, [consumeShareSnackbar, showSnackbar, snackbarSignal]);

  React.useEffect(() => {
    if (!tabSwipeContext) return;
    tabSwipeContext.setCacheAddActionHandler(openAddModal);
    return () => {
      tabSwipeContext.setCacheAddActionHandler(null);
    };
  }, [openAddModal, tabSwipeContext]);

  const runSync = React.useCallback(async (interactive: boolean): Promise<boolean> => {
    if (isSyncing.current) return false;

    const userId = await getCurrentAuthUserId();
    if (!userId) return false;

    isSyncing.current = true;
    try {
      const result = await syncWithRetry(2);
      if (!result.success && interactive) {
        const readableMessage = getSyncErrorMessage(result.error ?? result.message);
        Alert.alert('同步失敗', readableMessage, [
          { text: '稍後', style: 'cancel' },
          {
            text: '重試',
            onPress: () => {
              void runSync(true);
            },
          },
        ]);
        return false;
      }
      return result.success;
    } finally {
      isSyncing.current = false;
    }
  }, []);

  const shareSnackbarTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshClipboardMode = React.useCallback(async () => {
    const settings = await loadUserSettings();
    setClipboardMode(settings.clipboardMode);
  }, []);

  React.useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshEntitlement = React.useCallback(async () => {
    const userId = await getCurrentAuthUserId();
    if (!userId) {
      setIsPremiumUser(false);
      return;
    }
    try {
      const premium = await SubscriptionService.isPremium(userId);
      setIsPremiumUser(premium);
    } catch (error) {
      console.warn('[CacheList] refresh entitlement failed:', error);
      setIsPremiumUser(false);
    }
  }, []);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        isScreenFocused.current &&
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        void refreshClipboardMode();
        void runSync(false);
        void (async () => {
          const settings = await loadUserSettings();
          if (settings.clipboardMode === 'active') {
            await checkClipboard(false);
          }
        })();
        shareSnackbarTimerRef.current = setTimeout(tryShowShareSnackbar, 1200);
      }
      appState.current = nextAppState;
    });
    return () => {
      if (shareSnackbarTimerRef.current) {
        clearTimeout(shareSnackbarTimerRef.current);
        shareSnackbarTimerRef.current = null;
      }
      subscription.remove();
    };
  }, [checkClipboard, clipboardMode, refreshClipboardMode, runSync, tryShowShareSnackbar]);

  useFocusEffect(
    React.useCallback(() => {
      isScreenFocused.current = true;
      void refreshClipboardMode();
      void refreshEntitlement();
      void (async () => {
        const settings = await loadUserSettings();
        if (settings.clipboardMode === 'active') {
          await checkClipboard(false);
        }
      })();
      const shareTimer = setTimeout(() => {
        const message = consumeShareSnackbar();
        if (message) showSnackbar(message);
      }, 600);
      return () => {
        isScreenFocused.current = false;
        clearTimeout(shareTimer);
      };
    }, [checkClipboard, consumeShareSnackbar, refreshClipboardMode, refreshEntitlement, showSnackbar])
  );

  React.useEffect(() => {
    const query = database
      .get<CachedItem>('cached_items')
      .query(Q.where('deleted_at', null), Q.where('converted_to_card', false), Q.sortBy('created_at', Q.desc));

    const fetchInitial = async () => {
      try {
        const data = await query.fetch();
        setCachedItems(data);
      } catch (error) {
        console.error('Error fetching cached items:', error);
        setCachedItems([]);
      }
    };

    fetchInitial();
    const subscription = query.observe().subscribe((data) => setCachedItems(data));
    return () => subscription.unsubscribe();
  }, []);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await runSync(true);
    } finally {
      setRefreshing(false);
    }
  }, [runSync]);

  const handleDelete = async (item: CachedItem) => {
    Alert.alert('刪除快取', '確定要刪除這個快取項目嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          try {
            await database.write(async () => {
              await item.markAsDeleted();
            });
            void runSync(false);
          } catch (error) {
            console.error('[CacheList] Error deleting item:', error);
            Alert.alert('錯誤', '刪除失敗，請重試');
          }
        },
      },
    ]);
  };

  const deleteItemSilently = React.useCallback(
    async (item: CachedItem) => {
      try {
        await database.write(async () => {
          await item.markAsDeleted();
        });
        showSnackbar('已刪除 1 筆快取');
        void runSync(false);
      } catch (error) {
        console.error('[CacheList] silent delete failed:', error);
        Alert.alert('錯誤', '刪除失敗，請重試');
      }
    },
    [runSync, showSnackbar]
  );

  const handleQuickAddText = React.useCallback(async () => {
    const trimmed = manualText.trim();
    if (!trimmed) return;

    try {
      await Clipboard.setStringAsync(trimmed);
      lastProcessedClipboard.current = '';
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
      showSnackbar('已新增文字快取');
    } catch (error) {
      console.error('[CacheList] quick add text failed:', error);
      Alert.alert('新增失敗', '無法新增文字快取，請稍後再試。');
    }
  }, [manualText, showSnackbar]);

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
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const picked = result.assets[0];
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
  }, [navigation]);

  const handleUploadCropCancel = React.useCallback(() => {
    setShowUploadCropper(false);
    setPendingOriginalImageUri(null);
    setPendingOriginalImageSize(null);
    setAddTab('image');
    setShowAddModal(true);
  }, []);

  const handleUploadCropConfirm = React.useCallback(
    (croppedUri: string) => {
      const originalUri = pendingOriginalImageUri;
      setShowUploadCropper(false);
      setPendingOriginalImageUri(null);
      setPendingOriginalImageSize(null);
      navigation.navigate('AddCacheItem', {
        startMode: 'library',
        initialImageUri: croppedUri,
        originalImageUri: originalUri,
        openOcrOnLoad: true,
      });
    },
    [navigation, pendingOriginalImageUri]
  );

  const handleCaptureImage = React.useCallback(async () => {
    if (!quickCameraPermission?.granted) {
      const permission = await requestQuickCameraPermission();
      if (!permission.granted) {
        Alert.alert('需要相機權限', '請允許相機權限後再拍照。');
        return;
      }
    }
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
      navigation.navigate('AddCacheItem', {
        startMode: 'library',
        initialImageUri: photo.uri,
        originalImageUri: photo.uri,
        autoOpenCropper: true,
      });
    } catch (error) {
      console.error('[CacheList] quick camera capture failed:', error);
      Alert.alert('拍照失敗', '請再試一次');
    }
  }, [navigation]);

  const runTopCardAction = React.useCallback(
    (item: CachedItem, direction: 'left' | 'right') => {
      setSwipeDecision(direction);
      triggerLightHaptic();
      const exitX = direction === 'right' ? CARD_EXIT_X : -CARD_EXIT_X;

      Animated.parallel([
        Animated.timing(dragX, { toValue: exitX, duration: 220, useNativeDriver: true }),
        Animated.timing(dragY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        dragX.setValue(0);
        dragY.setValue(0);
        setSwipeDecision(null);
        if (direction === 'right') {
          void handleOpenCachedItem(item);
          return;
        }
        void deleteItemSilently(item);
      });
    },
    [CARD_EXIT_X, deleteItemSilently, dragX, dragY, handleOpenCachedItem, triggerLightHaptic]
  );

  const handleSkipTopCard = React.useCallback(() => {
    if (!topCard) return;
    runTopCardAction(topCard, 'left');
  }, [runTopCardAction, topCard]);

  const handleCreateTopCard = React.useCallback(() => {
    if (!topCard) return;
    runTopCardAction(topCard, 'right');
  }, [runTopCardAction, topCard]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          return Boolean(topCard);
        },
        onMoveShouldSetPanResponder: () => {
          return Boolean(topCard);
        },
        onPanResponderGrant: () => {
          if (tabSwipeContext) {
            tabSwipeContext.swipeLockRef.current = true;
            tabSwipeContext.setPaginationEnabled(false);
            tabSwipeContext.setPagerScrollEnabled(false);
          }
          setIsDragging(true);
          setSwipeDecision(null);
        },
        onPanResponderMove: (_, gestureState) => {
          dragX.setValue(gestureState.dx);
          dragY.setValue(gestureState.dy * 0.25);
          const decision = gestureState.dx > 30 ? 'right' : gestureState.dx < -30 ? 'left' : null;
          setSwipeDecision(decision);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (tabSwipeContext) {
            tabSwipeContext.swipeLockRef.current = false;
            tabSwipeContext.setPaginationEnabled(true);
            tabSwipeContext.setPagerScrollEnabled(true);
          }
          setIsDragging(false);

          if (Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8) {
            Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
            Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
            setSwipeDecision(null);
            setGridView(true);
            return;
          }

          if (gestureState.dx > SWIPE_THRESHOLD && topCard) {
            runTopCardAction(topCard, 'right');
            return;
          }

          if (gestureState.dx < -SWIPE_THRESHOLD && topCard) {
            runTopCardAction(topCard, 'left');
            return;
          }

          Animated.parallel([
            Animated.spring(dragX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(dragY, { toValue: 0, useNativeDriver: true }),
          ]).start(() => setSwipeDecision(null));
        },
        onPanResponderTerminate: () => {
          if (tabSwipeContext) {
            tabSwipeContext.swipeLockRef.current = false;
            tabSwipeContext.setPaginationEnabled(true);
            tabSwipeContext.setPagerScrollEnabled(true);
          }
          setIsDragging(false);
          setSwipeDecision(null);
          Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [dragX, dragY, runTopCardAction, SWIPE_THRESHOLD, tabSwipeContext, topCard]
  );

  React.useEffect(
    () => () => {
      if (tabSwipeContext) {
        tabSwipeContext.swipeLockRef.current = false;
        tabSwipeContext.setPaginationEnabled(true);
        tabSwipeContext.setPagerScrollEnabled(true);
      }
    },
    [tabSwipeContext]
  );

  const rotation = dragX.interpolate({
    inputRange: [-ROTATION_RANGE, 0, ROTATION_RANGE],
    outputRange: ['-11deg', '0deg', '11deg'],
    extrapolate: 'clamp',
  });

  const renderGridCard = (item: CachedItem) => {
    const text = getPrimaryText(item);
    const suggested = getSuggested(item);

    return (
      <View key={item.id} style={styles.gridCard}>
        <View style={styles.gridCardTop}>
          <Text style={styles.gridSource} numberOfLines={1}>
            {item.sourceApp || item.contentType.toUpperCase()}
          </Text>
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.gridDeleteBtn}>
            <Text style={styles.gridDeleteTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        {item.contentType === 'image' && item.imageStoragePath ? (
          <Image source={{ uri: item.imageStoragePath }} style={styles.gridImage} resizeMode="cover" />
        ) : null}

        <HighlightedText text={text} keyword={suggested} style={styles.gridText} />

        <Text style={styles.gridSuggested} numberOfLines={1}>
          AI: "{suggested}"
        </Text>

        <TouchableOpacity
          style={styles.gridCreateBtn}
          onPress={() => {
            setGridView(false);
            void handleOpenCachedItem(item);
          }}
        >
          <Text style={styles.gridCreateText}>Create</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const updateSwipeExclusionRange = React.useCallback(() => {
    if (!tabSwipeContext) return;
    if (gridView || displayItems.length === 0 || !stackAreaRef.current) {
      tabSwipeContext.setCacheSwipeExclusionRange(null);
      return;
    }

    stackAreaRef.current.measureInWindow((_x, y, _width, height) => {
      if (!Number.isFinite(y) || !Number.isFinite(height) || height <= 0) {
        tabSwipeContext.setCacheSwipeExclusionRange(null);
        return;
      }

      // 只有 stack 卡片區交給 cache process；其他區域保留 tab 翻頁手勢。
      tabSwipeContext.setCacheSwipeExclusionRange({ top: y, bottom: y + height });
    });
  }, [displayItems.length, gridView, tabSwipeContext]);

  React.useEffect(() => {
    updateSwipeExclusionRange();
  }, [updateSwipeExclusionRange]);

  React.useEffect(
    () => () => {
      tabSwipeContext?.setCacheSwipeExclusionRange(null);
    },
    [tabSwipeContext]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {!gridView ? (
        <View style={styles.stackScreen}>
          <View style={styles.minimalHeader}>
            <Text style={styles.minimalHeaderTitle}>Cache</Text>
            <View style={styles.minimalHeaderPill}>
              <Text style={styles.minimalHeaderPillText}>{usageText}</Text>
            </View>
          </View>
          {displayItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>Cache is empty</Text>
              <Text style={styles.emptyText}>從其他 App 分享或使用右上角新增，開始建立詞彙卡片。</Text>
            </View>
          ) : (
            <View style={styles.stackCenterContainer}>
              <View
                ref={stackAreaRef}
                style={[
                  styles.stackArea,
                  { width: CARD_WIDTH, height: CARD_HEIGHT, alignSelf: 'center', bottom: CARD_BOTTOM_OFFSET },
                ]}
                onLayout={() => {
                  requestAnimationFrame(updateSwipeExclusionRange);
                }}
              >
                {visibleStack
                  .slice(1)
                  .reverse()
                  .map((item, revIdx) => {
                    const idx = visibleStack.slice(1).length - 1 - revIdx + 1;
                    const offset = STACK_OFFSETS[Math.min(idx, STACK_OFFSETS.length - 1)];
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.backCard,
                          {
                            top: offset.y,
                            transform: [{ scale: offset.scale }],
                            opacity: offset.opacity,
                            zIndex: visibleStack.length - idx,
                            width: CARD_WIDTH,
                            height: CARD_HEIGHT,
                          },
                        ]}
                      />
                    );
                  })}

                {topCard && (
                  <Card
                    panHandlers={panResponder.panHandlers}
                    width={CARD_WIDTH}
                    height={CARD_HEIGHT}
                    swipeDecision={swipeDecision}
                    sourceText={topCard.sourceApp || topCard.contentType.toUpperCase()}
                    timeText={formatRelativeTime(topCard.createdAt)}
                    suggestedText={getSuggested(topCard)}
                    expiryText={`⏳ ${formatRemainingTime(getDisplayExpiry(topCard, isPremiumUser), nowTs)}`}
                    isExpired={Date.now() > getDisplayExpiry(topCard, isPremiumUser)}
                    imageUri={topCard.contentType === 'image' ? topCard.imageStoragePath : null}
                    onSkipPress={handleSkipTopCard}
                    onCreatePress={handleCreateTopCard}
                    animatedStyle={{
                      transform: [{ translateX: dragX }, { translateY: dragY }, { rotate: rotation }],
                      shadowOpacity: isDragging ? 0.22 : 0.1,
                    }}
                    content={
                      <HighlightedText
                        text={getPrimaryText(topCard)}
                        keyword={getSuggested(topCard)}
                        style={styles.topCardText}
                      />
                    }
                  />
                )}
              </View>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.gridViewContainer}>
          <View style={styles.gridHeader}>
            <TouchableOpacity style={styles.gridBackBtn} onPress={() => setGridView(false)}>
              <Text style={styles.gridBackText}>‹</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.gridTitle}>All Cache</Text>
              <Text style={styles.gridSubtitle}>{displayItems.length} items</Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.gridContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {displayItems.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyTitle}>Cache is empty</Text>
              </View>
            ) : (
              <View style={styles.gridWrap}>{displayItems.map((item) => renderGridCard(item))}</View>
            )}
          </ScrollView>
        </View>
      )}

      <Modal
        visible={showAddModal}
        animationType={suppressAddModalAnimation ? 'none' : 'slide'}
        transparent
        onRequestClose={() => setShowAddModal(false)}
        onDismiss={() => {
          if (pendingOpenCropperAfterAddDismiss && pendingOriginalImageUri) {
            setShowUploadCropper(true);
            setPendingOpenCropperAfterAddDismiss(false);
          }
          if (suppressAddModalAnimation) {
            setSuppressAddModalAnimation(false);
          }
        }}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAddModal(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, addTab === 'text' && styles.tabBtnActive]}
              onPress={() => setAddTab('text')}
            >
              <Text style={[styles.tabText, addTab === 'text' && styles.tabTextActive]}>Text</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, addTab === 'image' && styles.tabBtnActive]}
              onPress={() => setAddTab('image')}
            >
              <Text style={[styles.tabText, addTab === 'image' && styles.tabTextActive]}>Image</Text>
            </TouchableOpacity>
          </View>

          {addTab === 'text' ? (
            <>
              <Text style={styles.inputLabel}>Paste or type text</Text>
              <TextInput
                value={manualText}
                onChangeText={setManualText}
                multiline
                style={styles.textInput}
                placeholder="Paste a sentence containing slang, idioms, or expressions..."
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                style={[styles.primaryAction, !manualText.trim() && styles.primaryActionDisabled]}
                disabled={!manualText.trim()}
                onPress={() => void handleQuickAddText()}
              >
                <Text style={styles.primaryActionText}>Add Card</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.inputLabel}>Capture or upload image</Text>
              <TouchableOpacity
                style={styles.imageUploadPanel}
                activeOpacity={0.9}
                onPress={() => void handleUploadImageDirect()}
                disabled={creatingImage}
              >
                <View style={styles.imageUploadIconWrap}>
                  <Text style={styles.imageUploadIcon}>🖼️</Text>
                </View>
                <Text style={styles.imageUploadText}>
                  {creatingImage ? 'processing image...' : 'upload image'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryAction, styles.imageAction]}
                onPress={handleCaptureImage}
                disabled={creatingImage}
              >
                <Text style={styles.primaryActionText}>Capture Image</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddModal(false)}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <ImageCropperModal
        visible={showUploadCropper}
        imageUri={pendingOriginalImageUri}
        initialImageSize={pendingOriginalImageSize}
        modalAnimationType="slide"
        onCancel={handleUploadCropCancel}
        onConfirm={handleUploadCropConfirm}
      />

      <Modal
        visible={showQuickCamera}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeQuickCamera}
      >
        <View style={styles.cameraContainer}>
          {quickCameraPermission?.granted ? (
            <CameraView
              ref={quickCameraRef}
              style={StyleSheet.absoluteFill}
              facing={quickCameraFacing}
            />
          ) : (
            <View style={styles.cameraPermissionFallback}>
              <Text style={styles.cameraPermissionText}>需要相機權限才能拍照</Text>
            </View>
          )}

          <View style={styles.cameraTopBar}>
            <TouchableOpacity style={styles.cameraTopButton} onPress={closeQuickCamera}>
              <Text style={styles.cameraTopButtonText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cameraTopButton} onPress={toggleQuickCameraFacing}>
              <Text style={styles.cameraTopButtonText}>↺</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cameraBottomBar}>
            <TouchableOpacity
              style={styles.shutterOuter}
              onPress={captureQuickPhoto}
              disabled={!quickCameraPermission?.granted}
            >
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {snackbarVisible && (
        <Animated.View style={[styles.snackbar, { opacity: snackbarOpacity }]} pointerEvents="none">
          <Text style={styles.snackbarText}>✅ {snackbarMessage}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F9',
  },
  stackScreen: {
    flex: 1,
  },
  minimalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 40,
  },
  minimalHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  minimalHeaderPill: {
    backgroundColor: '#E8F5E9',
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimalHeaderPillText: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '700',
  },
  stackCenterContainer: {
    flex: 1,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 110,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#202020',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#8F8FA0',
    textAlign: 'center',
    lineHeight: 20,
  },
  stackArea: {
    position: 'absolute',
  },
  backCard: {
    position: 'absolute',
    left: 0,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  topCardText: {
    fontSize: 17,
    lineHeight: 27,
    color: '#0D0D0D',
  },
  highlightText: {
    backgroundColor: '#E8F4FD',
    color: '#1A6FC4',
    fontWeight: '700',
    borderRadius: 4,
  },
  gridViewContainer: {
    flex: 1,
  },
  gridHeader: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECF0',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gridBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridBackText: {
    color: '#0D0D0D',
    fontSize: 22,
    marginTop: -3,
  },
  gridTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#0D0D0D',
  },
  gridSubtitle: {
    color: '#9A9AAA',
    fontSize: 12,
  },
  gridContent: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  gridCard: {
    width: '48.5%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 10,
    minHeight: 210,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  gridCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  gridSource: {
    fontSize: 10,
    color: '#8A8A9A',
    backgroundColor: '#F0F0F4',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: '75%',
    overflow: 'hidden',
  },
  gridDeleteBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F0F0F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridDeleteTxt: {
    fontSize: 10,
    color: '#9A9AAA',
  },
  gridImage: {
    width: '100%',
    height: 72,
    borderRadius: 10,
    marginBottom: 8,
  },
  gridText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#0D0D0D',
    minHeight: 72,
  },
  gridSuggested: {
    marginTop: 8,
    color: '#9A7FCC',
    fontSize: 10,
    fontWeight: '600',
  },
  gridCreateBtn: {
    marginTop: 8,
    backgroundColor: '#0D0D0D',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  gridCreateText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    minHeight: 420,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#C8C8CD',
    alignSelf: 'center',
    marginBottom: 14,
  },
  tabRow: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    color: '#8E8E93',
    fontWeight: '600',
    fontSize: 15,
  },
  tabTextActive: {
    color: '#101010',
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  textInput: {
    minHeight: 140,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111',
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  primaryAction: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  primaryActionDisabled: {
    opacity: 0.5,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  imagePlaceholder: {
    minHeight: 150,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    paddingHorizontal: 18,
  },
  imagePlaceholderText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  imageUploadPanel: {
    minHeight: 210,
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  imageUploadIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FF9500',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  imageUploadIcon: {
    fontSize: 34,
    color: '#fff',
  },
  imageUploadText: {
    color: '#8E8E93',
    fontSize: 19,
    textAlign: 'center',
  },
  imageAction: {
    backgroundColor: '#FF9500',
  },
  cancelBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  cancelBtnText: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: 16,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPermissionFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  cameraPermissionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraTopBar: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  cameraTopButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTopButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  cameraBottomBar: {
    position: 'absolute',
    bottom: 42,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutterOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  snackbar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  snackbarText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});
