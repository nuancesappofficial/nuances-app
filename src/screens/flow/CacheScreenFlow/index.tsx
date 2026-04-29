import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  AppState,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
  type AppStateStatus,
} from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  Extrapolation,
  SensorType,
  interpolate,
  useAnimatedSensor,
  useAnimatedStyle,
  useSharedValue,
  useDerivedValue, // <-- 新增此行
  withRepeat,
  withSpring, // 新增此行
  withTiming,
  useFrameCallback,
  type SharedValue,
} from 'react-native-reanimated';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { pasteTextFromClipboard } from '@services/clipboard/clipboardService';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';
import ImageCropperModal from '../../../components/ImageCropperModal';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type CachedItem from '@database/models/CachedItem';
import CacheStackUI from '../../../components/UI/CacheScreenUI/CacheStackUI';
import CacheInputModalUI from '../../../components/UI/CacheScreenUI/CacheInputModalUI';
import CameraModalUI from '../../../components/UI/CacheScreenUI/CameraModalUI';
import { useCacheOcrBackfill } from './hooks/useCacheOcrBackfill';
import { useCacheItemCleanup } from './hooks/useCacheItemCleanup';
import { useCacheQuickAddFlow } from './hooks/useCacheQuickAddFlow';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  type AppThemeName,
} from '@services/settings/userSettings';
import { getAppThemePalette } from '../../../theme/appTheme';

type Props = {
  navigation: any;
  onRequestClose?: () => void;
  entryAnimationToken?: number;
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

type TodayUploadSticker = {
  key: string;
  cardId?: string;
  label: string;
};

function toDayKey(input: Date | string): string {
  const date = new Date(input);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeStickerText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
const STICKER_WIDTH = 118;
const STICKER_HEIGHT = 32;
const STICKER_GRID_HEIGHT = 188;
const STICKER_MIN_WIDTH = 36;
const STICKER_MAX_WIDTH = 420;
const STICKER_OUTLINE_SAFETY_PAD = 12;

function estimateStickerWidth(label: string): number {
  const text = normalizeStickerText(label);
  let units = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) {
      units += 0.42;
    } else if (/[A-Za-z0-9]/.test(ch)) {
      units += 0.58;
    } else {
      // CJK / emoji / symbols tend to occupy wider visual space.
      units += 1.0;
    }
  }
  // 字母會重疊，寬度要比一般字寬更緊
  // Include extra space for thick white outline so right edge won't be clipped.
  const estimated = Math.ceil(units * 13.6 + 24 + STICKER_OUTLINE_SAFETY_PAD);
  return Math.max(STICKER_MIN_WIDTH, Math.min(STICKER_MAX_WIDTH, estimated));
}

function getStickerAnchor(index: number): { baseLeftPct: number; baseTop: number } {
  const colAnchors = [6, 38, 70];
  const row = Math.floor(index / 3);
  const col = index % 3;
  return {
    baseLeftPct: colAnchors[col] + (row % 2 === 0 ? -2 : 2),
    baseTop: row * 34,
  };
}

function TiltSticker({
  item,
  index,
  baseLeftPct,
  baseTop,
  stickerWidth,
  posXList,
  posYList,
  onPress,
  disabled = false,
}: {
  item: TodayUploadSticker;
  index: number;
  baseLeftPct: number;
  baseTop: number;
  stickerWidth: number;
  posXList: SharedValue<number[]>;
  posYList: SharedValue<number[]>;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const stickerTiltDeg = ((index % 5) - 2) * 1.2;
  const labelText = normalizeStickerText(item.label);
  const dynamicFontSize = Math.max(16, 23 - Math.max(0, labelText.length - 8) * 0.55);
  const dynamicLineHeight = Math.round(dynamicFontSize * 1.16);
  const svgHeight = Math.max(34, dynamicLineHeight + 10);
  const strokeWidth = Math.max(3.4, Math.min(5.2, dynamicFontSize * 0.22));
  const textY = Math.round(svgHeight * 0.72);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: posXList.value[index] ?? 0 },
        { translateY: posYList.value[index] ?? 0 },
        { rotateZ: `${stickerTiltDeg}deg` },
      ],
    };
  });

  return (
    <Reanimated.View
      style={[
        styles.stickerItem,
        {
          width: stickerWidth,
          left: `${baseLeftPct}%`,
          top: baseTop,
        },
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        style={styles.stickerPressArea}
        activeOpacity={0.85}
        onPress={onPress}
        disabled={disabled}
      >
        <View style={styles.stickerWordWrap} pointerEvents="none">
          <Svg
            width={stickerWidth}
            height={svgHeight}
            viewBox={`0 0 ${stickerWidth} ${svgHeight}`}
            style={styles.stickerWordSvg}
          >
            <SvgText
              x={strokeWidth + 1}
              y={textY}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              fontSize={dynamicFontSize}
              fontWeight="900"
              fontFamily="MarkerFelt-Wide"
              letterSpacing={-0.8}
            >
              {labelText}
            </SvgText>
            <SvgText
              x={strokeWidth + 1}
              y={textY}
              fill="#050505"
              fontSize={dynamicFontSize}
              fontWeight="900"
              fontFamily="MarkerFelt-Wide"
              letterSpacing={-0.8}
            >
              {labelText}
            </SvgText>
          </Svg>
        </View>
      </TouchableOpacity>
    </Reanimated.View>
  );
}
function VocabStickerCloud({
  items,
  onPressSticker,
}: {
  items: TodayUploadSticker[];
  onPressSticker?: (item: TodayUploadSticker) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const sensor = useAnimatedSensor(SensorType.GRAVITY, {
    interval: 16,
  });
  const stickers =
    items.length > 0
      ? items
      : [
          {
            key: 'empty-upload',
            label: 'No uploads today',
          },
        ];
  const limitedStickers = stickers.slice(0, 12);
  const containerWidth = Math.max(120, windowWidth - 32);
  const stickerWidths = useMemo(
    () =>
      limitedStickers.map((item) =>
        Math.min(estimateStickerWidth(item.label), Math.max(STICKER_MIN_WIDTH, containerWidth - 4))
      ),
    [containerWidth, limitedStickers]
  );

  const posXList = useSharedValue<number[]>([]);
  const posYList = useSharedValue<number[]>([]);
  const velXList = useSharedValue<number[]>([]);
  const velYList = useSharedValue<number[]>([]);

  useEffect(() => {
    const count = limitedStickers.length;
    posXList.value = Array.from({ length: count }, (_, i) => (i % 2 === 0 ? -2 : 2));
    posYList.value = Array.from({ length: count }, (_, i) => ((i + 1) % 2 === 0 ? -1 : 1));
    velXList.value = Array.from({ length: count }, () => 0);
    velYList.value = Array.from({ length: count }, () => 0);
  }, [limitedStickers.length, posXList, posYList, velXList, velYList]);

  const EDGE_INSET_X = 1;
  const BOUNCE = 0.55;
  const COLLISION_BOUNCE = 0.62;
  const FRICTION = 0.93;
  const GRAVITY_MULTIPLIER = 400;
  const COL_ANCHORS = [6, 38, 70];

  useFrameCallback((frameInfo) => {
    'worklet';
    if (frameInfo.timeSincePreviousFrame == null) return;
    const dt = frameInfo.timeSincePreviousFrame / 1000;
    const count = limitedStickers.length;
    if (count <= 0) return;

    const gx = sensor.sensor.value?.x ?? 0;
    const gy = sensor.sensor.value?.y ?? 0;
    const ax = gx * GRAVITY_MULTIPLIER;
    const ay = -gy * GRAVITY_MULTIPLIER;

    const px = posXList.value.slice();
    const py = posYList.value.slice();
    const vx = velXList.value.slice();
    const vy = velYList.value.slice();

    for (let i = 0; i < count; i += 1) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const rawBaseLeftPct = COL_ANCHORS[col] + (row % 2 === 0 ? -2 : 2);
      const baseTop = row * 34;
      const currentWidth = stickerWidths[i] ?? STICKER_WIDTH;
      const rawStartX = (containerWidth * rawBaseLeftPct) / 100;
      const maxStartX = Math.max(EDGE_INSET_X, containerWidth - currentWidth - EDGE_INSET_X);
      const startX = Math.max(EDGE_INSET_X, Math.min(maxStartX, rawStartX));
      const startY = baseTop;
      const limitLeft = -startX + EDGE_INSET_X;
      const limitRight = containerWidth - currentWidth - startX - EDGE_INSET_X;
      const limitUp = -startY + 1;
      const limitDown = STICKER_GRID_HEIGHT - STICKER_HEIGHT - startY - 2;

      vx[i] += ax * dt;
      vy[i] += ay * dt;
      vx[i] *= Math.pow(FRICTION, dt * 60);
      vy[i] *= Math.pow(FRICTION, dt * 60);

      let nextX = (px[i] ?? 0) + vx[i] * dt;
      let nextY = (py[i] ?? 0) + vy[i] * dt;

      if (nextX <= limitLeft) {
        nextX = limitLeft;
        vx[i] = Math.abs(vx[i]) * BOUNCE;
      } else if (nextX >= limitRight) {
        nextX = limitRight;
        vx[i] = -Math.abs(vx[i]) * BOUNCE;
      }
      if (nextY <= limitUp) {
        nextY = limitUp;
        vy[i] = Math.abs(vy[i]) * BOUNCE;
      } else if (nextY >= limitDown) {
        nextY = limitDown;
        vy[i] = -Math.abs(vy[i]) * BOUNCE;
      }

      px[i] = nextX;
      py[i] = nextY;
    }

    // 貼紙-貼紙碰撞：分離重疊並交換速度分量，避免互相穿透
    for (let i = 0; i < count; i += 1) {
      const aiRow = Math.floor(i / 3);
      const aiCol = i % 3;
      const aiRawBaseLeftPct = COL_ANCHORS[aiCol] + (aiRow % 2 === 0 ? -2 : 2);
      const aiBaseTop = aiRow * 34;
      const aiWidth = stickerWidths[i] ?? STICKER_WIDTH;
      const aiRawStartX = (containerWidth * aiRawBaseLeftPct) / 100;
      const aiMaxStartX = Math.max(EDGE_INSET_X, containerWidth - aiWidth - EDGE_INSET_X);
      const aiStartX = Math.max(EDGE_INSET_X, Math.min(aiMaxStartX, aiRawStartX));
      const ax0 = aiStartX + (px[i] ?? 0);
      const ay0 = aiBaseTop + (py[i] ?? 0);
      for (let j = i + 1; j < count; j += 1) {
        const ajRow = Math.floor(j / 3);
        const ajCol = j % 3;
        const ajRawBaseLeftPct = COL_ANCHORS[ajCol] + (ajRow % 2 === 0 ? -2 : 2);
        const ajBaseTop = ajRow * 34;
        const ajWidth = stickerWidths[j] ?? STICKER_WIDTH;
        const ajRawStartX = (containerWidth * ajRawBaseLeftPct) / 100;
        const ajMaxStartX = Math.max(EDGE_INSET_X, containerWidth - ajWidth - EDGE_INSET_X);
        const ajStartX = Math.max(EDGE_INSET_X, Math.min(ajMaxStartX, ajRawStartX));
        const bx0 = ajStartX + (px[j] ?? 0);
        const by0 = ajBaseTop + (py[j] ?? 0);

        const overlapX = Math.min(ax0 + aiWidth, bx0 + ajWidth) - Math.max(ax0, bx0);
        const overlapY = Math.min(ay0 + STICKER_HEIGHT, by0 + STICKER_HEIGHT) - Math.max(ay0, by0);
        if (overlapX <= 0 || overlapY <= 0) continue;

        if (overlapX < overlapY) {
          const push = overlapX / 2 + 0.01;
          const iLeft = ax0 <= bx0;
          px[i] -= iLeft ? push : -push;
          px[j] += iLeft ? push : -push;
          const iv = vx[i];
          vx[i] = vx[j] * COLLISION_BOUNCE;
          vx[j] = iv * COLLISION_BOUNCE;
        } else {
          const push = overlapY / 2 + 0.01;
          const iUp = ay0 <= by0;
          py[i] -= iUp ? push : -push;
          py[j] += iUp ? push : -push;
          const iv = vy[i];
          vy[i] = vy[j] * COLLISION_BOUNCE;
          vy[j] = iv * COLLISION_BOUNCE;
        }
      }
    }

    // 碰撞後再次套用邊界夾制
    for (let i = 0; i < count; i += 1) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const rawBaseLeftPct = COL_ANCHORS[col] + (row % 2 === 0 ? -2 : 2);
      const baseTop = row * 34;
      const currentWidth = stickerWidths[i] ?? STICKER_WIDTH;
      const rawStartX = (containerWidth * rawBaseLeftPct) / 100;
      const maxStartX = Math.max(EDGE_INSET_X, containerWidth - currentWidth - EDGE_INSET_X);
      const startX = Math.max(EDGE_INSET_X, Math.min(maxStartX, rawStartX));
      const startY = baseTop;
      const limitLeft = -startX + EDGE_INSET_X;
      const limitRight = containerWidth - currentWidth - startX - EDGE_INSET_X;
      const limitUp = -startY + 1;
      const limitDown = STICKER_GRID_HEIGHT - STICKER_HEIGHT - startY - 2;

      px[i] = Math.max(limitLeft, Math.min(limitRight, px[i] ?? 0));
      py[i] = Math.max(limitUp, Math.min(limitDown, py[i] ?? 0));
    }

    posXList.value = px;
    posYList.value = py;
    velXList.value = vx;
    velYList.value = vy;
  });

  return (
    <View style={styles.stickerGrid}>
      {limitedStickers.map((item, index) => {
        const { baseLeftPct: rawBaseLeftPct, baseTop } = getStickerAnchor(index);
        const currentWidth = stickerWidths[index] ?? STICKER_WIDTH;
        const rawStartX = (containerWidth * rawBaseLeftPct) / 100;
        const maxStartX = Math.max(EDGE_INSET_X, containerWidth - currentWidth - EDGE_INSET_X);
        const safeStartX = Math.max(EDGE_INSET_X, Math.min(maxStartX, rawStartX));
        const safeBaseLeftPct = (safeStartX / containerWidth) * 100;
        return (
          <TiltSticker
            key={item.key}
            item={item}
            index={index}
            baseLeftPct={safeBaseLeftPct}
            baseTop={baseTop}
            stickerWidth={currentWidth}
            posXList={posXList}
            posYList={posYList}
            onPress={() => onPressSticker?.(item)}
            disabled={!item.cardId}
          />
        );
      })}
    </View>
  );
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
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim())
    .filter(Boolean);

  if (words.length === 0) return 'No text recognized';
  const compact = Array.from(new Set(words.map((word) => word.toLowerCase()))).slice(0, 4);
  const display = compact.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return `${display.join(', ')}${words.length > compact.length ? '...' : ''}`;
}

export default function CacheScreenFlow({ navigation, onRequestClose, entryAnimationToken }: Props) {
  const insets = useSafeAreaInsets();
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const addButtonScale = React.useRef(new Animated.Value(1)).current;
  const [cacheItems, setCacheItems] = useState<CachedItem[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [animationSeed, setAnimationSeed] = useState(0);
  const [restoreSeed, setRestoreSeed] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'text' | 'image'>('text');
  const [manualText, setManualText] = useState('');
  const [didPasteIntoTextBox, setDidPasteIntoTextBox] = useState(false);
  const [pasteEnabled, setPasteEnabled] = useState(false);
  const {
    creatingImage,
    showQuickCamera,
    quickCameraFacing,
    showUploadCropper,
    pendingOriginalImageUri,
    pendingOriginalImageSize,
    suppressAddModalAnimation,
    quickCameraRef,
    quickCameraPermission,
    handleUploadImageDirect,
    handleCaptureImage,
    closeQuickCamera,
    toggleQuickCameraFacing,
    captureQuickPhoto,
    handleUploadCropCancel,
    handleUploadCropConfirm,
    handleInputModalDismiss,
    queueQuickAddCropperAfterModalDismiss,
    openCropperForSwipeImage,
  } = useCacheQuickAddFlow({
    navigation,
    setShowAddModal,
    setAddTab,
  });
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const hasFocusedOnceRef = React.useRef(false);
  const handledOverlayTokenRef = React.useRef<number | null>(null);
  const overlayAnimationTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousCardCountRef = React.useRef<number | null>(null);
  const [appTheme, setAppTheme] = useState<AppThemeName>(DEFAULT_USER_SETTINGS.theme);
  const palette = useMemo(() => getAppThemePalette(appTheme), [appTheme]);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const hydrateTheme = async () => {
        try {
          const settings = await loadUserSettings();
          if (active) setAppTheme(settings.theme);
        } catch (error) {
          console.warn('[Cache] load theme failed:', error);
          if (active) setAppTheme(DEFAULT_USER_SETTINGS.theme);
        }
      };
      void hydrateTheme();
      return () => {
        active = false;
      };
    }, [])
  );

  const openAddModal = React.useCallback(() => {
    void Haptics.selectionAsync();
    setShowAddModal(true);
  }, []);

  const refreshPasteEnabled = React.useCallback(async () => {
    try {
      const clipboard = Clipboard as any;
      const hasImage =
        typeof clipboard?.hasImageAsync === 'function' ? await clipboard.hasImageAsync() : false;
      const text = await Clipboard.getStringAsync();
      setPasteEnabled(Boolean(hasImage || text.trim().length > 0));
    } catch {
      setPasteEnabled(false);
    }
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

  useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const load = async () => {
      try {
        const data = await queryCards.fetch();
        setAllCards(data);
      } catch (error) {
        console.error('[CacheList] load cards failed:', error);
        setAllCards([]);
      }
    };

    void load();
    const sub = queryCards.observe().subscribe((data) => setAllCards(data));
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const handleFocused = () => {
      const currentCount = cacheItems.length;
      const prevCount = previousCardCountRef.current;

      if (prevCount == null) {
        // First time entering cache: play once if there are cards.
        if (currentCount > 0) {
          setAnimationSeed((prev) => prev + 1);
        }
        hasFocusedOnceRef.current = true;
        previousCardCountRef.current = currentCount;
        return;
      }

      const hasNewCards = currentCount > prevCount;
      if (hasNewCards) {
        setAnimationSeed((prev) => prev + 1);
      } else if (hasFocusedOnceRef.current) {
        // Existing stack only: keep layout stable without entry replay.
        setRestoreSeed((prev) => prev + 1);
      }

      hasFocusedOnceRef.current = true;
      previousCardCountRef.current = currentCount;
    };

    if (navigation?.isFocused?.() ?? true) {
      handleFocused();
    }

    if (!navigation?.addListener) {
      return;
    }

    const unsubscribe = navigation.addListener('focus', handleFocused);
    return () => {
      unsubscribe?.();
    };
  }, [cacheItems.length, navigation]);

  useEffect(() => {
    if (entryAnimationToken == null) return;
    if (handledOverlayTokenRef.current === entryAnimationToken) return;

    const play = () => {
      if (overlayAnimationTimerRef.current) {
        clearTimeout(overlayAnimationTimerRef.current);
      }
      overlayAnimationTimerRef.current = setTimeout(() => {
        setAnimationSeed((prev) => prev + 1);
        handledOverlayTokenRef.current = entryAnimationToken;
        overlayAnimationTimerRef.current = null;
      }, 420);
    };

    if (cacheItems.length > 0) {
      play();
      return;
    }

    return () => {
      if (overlayAnimationTimerRef.current) {
        clearTimeout(overlayAnimationTimerRef.current);
        overlayAnimationTimerRef.current = null;
      }
    };
  }, [cacheItems.length, entryAnimationToken]);

  useEffect(() => {
    return () => {
      if (overlayAnimationTimerRef.current) {
        clearTimeout(overlayAnimationTimerRef.current);
        overlayAnimationTimerRef.current = null;
      }
    };
  }, []);

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

  const { liveDetectedPreviewById } = useCacheOcrBackfill({
    cacheItems,
    getDetectedPreview,
  });
  const { deleteCacheItemPermanently } = useCacheItemCleanup({ cacheItems });

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

  const todayStickerWords = useMemo(() => {
    const todayKey = toDayKey(new Date());
    const seen = new Set<string>();
    const output: TodayUploadSticker[] = [];

    allCards.forEach((card) => {
      if (!card.createdAt) return;
      if (toDayKey(card.createdAt) !== todayKey) return;
      const raw = normalizeStickerText(card.targetPhrase || card.targetWord || '');
      const value = raw.length > 26 ? `${raw.slice(0, 26)}…` : raw;
      if (!value) return;
      const dedupeKey = value.toLowerCase();
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      output.push({
        key: card.id,
        cardId: card.id,
        label: value,
      });
    });

    return output;
  }, [allCards]);

  const todayUploadedCardIds = useMemo(() => {
    const todayKey = toDayKey(new Date());
    return allCards
      .filter((card) => !!card.createdAt && toDayKey(card.createdAt) === todayKey)
      .map((card) => card.id);
  }, [allCards]);

  const handlePressTodaySticker = React.useCallback(
    (item: TodayUploadSticker) => {
      if (!item.cardId) return;
      const cardIds = todayUploadedCardIds.length > 0 ? todayUploadedCardIds : [item.cardId];
      navigation.navigate('CardDetail', {
        cardId: item.cardId,
        cardIds,
        headerTitle: "Today's Uploads",
      });
    },
    [navigation, todayUploadedCardIds]
  );

  useEffect(() => {
    if (!onRequestClose) return;
    const prev = previousCardCountRef.current;
    if (prev !== null && prev > 0 && cards.length === 0) {
      onRequestClose();
    }
    previousCardCountRef.current = cards.length;
  }, [cards.length, onRequestClose]);

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
      setDidPasteIntoTextBox(false);
      setShowAddModal(false);
    } catch (error) {
      console.error('[CacheList] quick add text failed:', error);
      Alert.alert('新增失敗', '無法新增文字快取，請稍後再試。');
    }
  }, [manualText]);

  const handlePasteFromNativeClipboard = React.useCallback(async () => {
    try {
      const clipboard = Clipboard as any;
      const canReadImage =
        typeof clipboard?.hasImageAsync === 'function' && typeof clipboard?.getImageAsync === 'function';

      if (canReadImage) {
        const hasImage = await clipboard.hasImageAsync();
        if (hasImage) {
          const imagePayload = await clipboard.getImageAsync({ format: 'png' });
          if (imagePayload?.data) {
            const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
            if (!baseDir) {
              Alert.alert('貼上失敗', '無法存取暫存空間。');
              return;
            }

            const clipboardUri = `${baseDir}clipboard-image-${Date.now()}.png`;
            await FileSystem.writeAsStringAsync(clipboardUri, imagePayload.data, {
              encoding: FileSystem.EncodingType.Base64,
            });

            queueQuickAddCropperAfterModalDismiss({
              imageUri: clipboardUri,
              imageSize:
                imagePayload.size &&
                typeof imagePayload.size.width === 'number' &&
                typeof imagePayload.size.height === 'number'
                  ? { width: imagePayload.size.width, height: imagePayload.size.height }
                  : null,
            });
            return;
          }
        }
      }

      const text = (await Clipboard.getStringAsync()).trim();
      if (text.length > 0) {
        setManualText(text);
        setDidPasteIntoTextBox(true);
        return;
      }
      Alert.alert('剪貼簿是空的', '請先複製文字或圖片再貼上。');
    } catch (error) {
      console.error('[CacheList] paste from native clipboard failed:', error);
      Alert.alert('貼上失敗', '無法讀取剪貼簿內容，請稍後再試。');
    }
  }, []);

  const handleManualTextChange = React.useCallback((value: string) => {
    setManualText(value);
    if (!value.trim()) {
      setDidPasteIntoTextBox(false);
    }
  }, []);

  const handleClearManualText = React.useCallback(() => {
    setManualText('');
    setDidPasteIntoTextBox(false);
  }, []);

  useEffect(() => {
    if (!showAddModal) return;
    void refreshPasteEnabled();
  }, [refreshPasteEnabled, showAddModal]);

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
          openCropperForSwipeImage({
            item: target.cachedItem,
            imageUri,
            imageSize: null,
          });
          return;
        }

        navigation.navigate('CreateCard', { cachedItem: target.cachedItem });
        return;
      }

      void deleteCacheItemPermanently(target.cachedItem);
    },
    [cards, deleteCacheItemPermanently, navigation, openCropperForSwipeImage]
  );

  const animateAddButtonPress = React.useCallback(
    (toValue: number) => {
      Animated.spring(addButtonScale, {
        toValue,
        useNativeDriver: true,
        speed: 24,
        bounciness: 4,
      }).start();
    },
    [addButtonScale]
  );

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: palette.screenBg }]}>
      <View style={styles.vocabSection}>
        <Text style={styles.vocabTitleOutside}>Today&apos;s Uploads</Text>
        <View style={[styles.vocabContainer, { backgroundColor: palette.containerBg }]}>
          <VocabStickerCloud items={todayStickerWords} onPressSticker={handlePressTodaySticker} />
          {stackCards.length > 0 ? (
            <BlurView pointerEvents="none" style={styles.vocabBlurOverlay} intensity={65} tint="light" />
          ) : null}
        </View>
      </View>

      <View style={styles.stackLayer} pointerEvents="box-none">
        <CacheStackUI
          cards={stackCards}
          animationSeed={animationSeed}
          restoreSeed={restoreSeed}
          onCardSwipe={handleCardSwipe}
          onCardImageError={handleCardImageError}
        />
      </View>

      <Animated.View
        style={[
          styles.uploadBarButtonWrap,
          { bottom: Math.max(insets.bottom, 8) + 60, transform: [{ scale: addButtonScale }] },
        ]}
      >
        <TouchableOpacity
          style={styles.uploadBarButton}
          activeOpacity={0.9}
          onPressIn={() => animateAddButtonPress(0.95)}
          onPressOut={() => animateAddButtonPress(1)}
          onPress={openAddModal}
        >
          <Text style={styles.uploadBarButtonLabel}>＋ Upload Cache</Text>
        </TouchableOpacity>
      </Animated.View>

      <CacheInputModalUI
        visible={showAddModal}
        suppressAnimation={suppressAddModalAnimation}
        addTab={addTab}
        manualText={manualText}
        creatingImage={creatingImage}
        pasteEnabled={pasteEnabled}
        onClose={() => setShowAddModal(false)}
        onDismiss={handleInputModalDismiss}
        onTabChange={setAddTab}
        onManualTextChange={handleManualTextChange}
        onSubmitText={handleQuickAddText}
        textPrimaryAction={didPasteIntoTextBox && manualText.trim().length > 0 ? 'clear' : 'paste'}
        onPressPaste={() => void handlePasteFromNativeClipboard()}
        onPressClearText={handleClearManualText}
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
    backgroundColor: '#02213D',
  },
  uploadBarButtonWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 200,
    elevation: 200,
  },
  vocabSection: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '50%',
    transform: [{ translateY: -116 }],
    zIndex: 1,
  },
  vocabTitleOutside: {
    color: '#FBFBFB',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginLeft: 4,
    marginBottom: 8,
  },
  vocabContainer: {
    minHeight: 188,
    borderRadius: 24,
    backgroundColor: '#4EAFF4',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  stickerGrid: {
    flex: 1,
    position: 'relative',
  },
  stickerItem: {
    position: 'absolute',
    width: 118,
    minHeight: 30,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowColor: 'transparent',
    elevation: 0,
  },
  stickerPressArea: {
    minHeight: 30,
    paddingHorizontal: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerWordWrap: {
    minHeight: 30,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerWordSvg: {
    overflow: 'visible',
  },
  vocabBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    zIndex: 5,
  },
  stackLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  uploadBarButton: {
    height: BUTTON_TOKENS.height.prominent,
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: '#F56B6B',
    borderWidth: 1,
    borderColor: 'rgba(251,251,251,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BUTTON_TOKENS.shadow.color,
    shadowOpacity: BUTTON_TOKENS.shadow.opacity,
    shadowRadius: BUTTON_TOKENS.shadow.radius,
    shadowOffset: { width: 0, height: BUTTON_TOKENS.shadow.offsetY },
    elevation: BUTTON_TOKENS.shadow.elevation,
  },
  uploadBarButtonLabel: {
    color: '#FBFBFB',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
    letterSpacing: 0.2,
  },
});
