import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Animated,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Q } from '@nozbe/watermelondb';
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
  runOnJS,
  withRepeat,
  withSpring, // 新增此行
  withTiming,
  useFrameCallback,
  type SharedValue,
} from 'react-native-reanimated';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { useAppTour } from '../../../contexts/AppTourContext';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import ReminderNotificationService from '@services/notifications/ReminderNotificationService';
import { getRemainingCacheCapacity } from '@services/cache/cacheLimitService';
import ImageCropperModal from '../../../components/ImageCropperModal';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import CacheStackUI from '../../../components/UI/CacheScreenUI/CacheStackUI';
import CacheInputModalUI from '../../../components/UI/CacheScreenUI/CacheInputModalUI';
import CameraModalUI from '../../../components/UI/CacheScreenUI/CameraModalUI';
import { useCacheOcrBackfill } from './hooks/useCacheOcrBackfill';
import { useCacheItemCleanup } from './hooks/useCacheItemCleanup';
import { useCacheQuickAddFlow } from './hooks/useCacheQuickAddFlow';
import { useCacheListDataSource } from './hooks/useCacheListDataSource';
import { useCacheSwipeActions } from './hooks/useCacheSwipeActions';
import type { TodayUploadSticker } from './hooks/useCacheListDataSource';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import { DEFAULT_STICKER_FONT_KEY, resolveStickerFont, type StickerFontKey } from '../../../theme/stickerFonts';
import {
  DEFAULT_USER_SETTINGS,
  getInitialUserSettings,
  loadUserSettings,
  subscribeUserSettings,
  type UserAppSettings,
  type UILanguage,
} from '@services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';
import {
  CONTAINER_NEON_OUTLINE,
  CONTAINER_NEON_GLOW,
  TEXT_ON_CTA,
  UPLOAD_CACHE_CTA_COLOR,
  UPLOAD_CACHE_CTA_COLOR_BORDER,
  CONTAINER_BG,
  SCREEN_BG,
  resolveThemeColors,
} from '../../../theme/colors';

const MAX_RENDERED_CACHE_CARDS = 8;

type Props = {
  navigation: any;
  onRequestClose?: () => void;
  entryAnimationToken?: number;
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
const EMPTY_UPLOAD_STICKER_WIDTH = 104;
const EMPTY_UPLOAD_STICKER_HEIGHT = 84;
const EMPTY_UPLOAD_STICKER_KEY = 'empty-upload';
const EMPTY_UPLOAD_STICKER_IMAGE = require('../../../../assets/app_icons/icon_cutout2.png');
const STICKER_GRID_MIN_HEIGHT = 188;
const STICKER_GRID_MAX_HEIGHT = 320;
const STICKER_MAX_VISIBLE_COUNT = 18;
const STICKER_MIN_WIDTH = 36;
const STICKER_MAX_WIDTH = 420;
const STICKER_OUTLINE_SAFETY_PAD = 6;
const STICKER_HORIZONTAL_PAD = 4;
const STICKER_FONT_WIDTH_SCALE = 0.68;
const STICKER_SVG_BLEED = 10;
const STICKER_VERTICAL_BLEED = 8;
const STICKER_COL_CENTER_ANCHORS = [18, 50, 82];
const STICKER_ROW_TOP_STEP = 34;
const STICKER_VERTICAL_OFFSETS = [0, 8, 3, 12, 5, 15, 2, 10, 6, 14, 4, 11];

function getStickerGridHeightForCount(count: number): number {
  const visibleCount = Math.max(1, Math.min(count, STICKER_MAX_VISIBLE_COUNT));
  const rows = Math.ceil(visibleCount / 3);
  const extraRows = Math.max(0, rows - 2);
  return Math.min(STICKER_GRID_MAX_HEIGHT, STICKER_GRID_MIN_HEIGHT + extraRows * 28);
}

function getStickerFontSize(textLength: number): number {
  return Math.max(16, 23 - Math.max(0, textLength - 8) * 0.55);
}

function estimateStickerWidth(label: string): number {
  const text = normalizeStickerText(label);
  let units = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) {
      units += 0.28;
    } else if (/[ilI1|'`.,:;]/.test(ch)) {
      units += 0.24;
    } else if (/[mwMW@#%&]/.test(ch)) {
      units += 0.74;
    } else if (/[A-Z0-9]/.test(ch)) {
      units += 0.62;
    } else if (/[a-z]/.test(ch)) {
      units += 0.52;
    } else {
      // CJK / emoji / symbols tend to occupy wider visual space.
      units += 1.0;
    }
  }
  const fontSize = getStickerFontSize(text.length);
  const widthUnit = fontSize * STICKER_FONT_WIDTH_SCALE;
  const estimated = Math.ceil(
    units * widthUnit + STICKER_HORIZONTAL_PAD * 2 + STICKER_OUTLINE_SAFETY_PAD * 2
  );
  return Math.max(STICKER_MIN_WIDTH, Math.min(STICKER_MAX_WIDTH, estimated));
}

function getStickerCenterAnchorPct(index: number): number {
  'worklet';
  const row = Math.floor(index / 3);
  const col = index % 3;
  return STICKER_COL_CENTER_ANCHORS[col] + (row % 2 === 0 ? -1.5 : 1.5);
}

function getStickerBaseTop(index: number): number {
  'worklet';
  const row = Math.floor(index / 3);
  return row * STICKER_ROW_TOP_STEP + STICKER_VERTICAL_OFFSETS[index % STICKER_VERTICAL_OFFSETS.length];
}

function isEmptyUploadSticker(item: TodayUploadSticker): boolean {
  return item.key === EMPTY_UPLOAD_STICKER_KEY && !item.cardId;
}

function getStickerStartX(
  index: number,
  containerWidth: number,
  stickerWidth: number,
  edgeInsetX: number
): number {
  'worklet';
  const rawCenterX = (containerWidth * getStickerCenterAnchorPct(index)) / 100;
  const rawStartX = rawCenterX - stickerWidth / 2;
  const maxStartX = Math.max(edgeInsetX, containerWidth - stickerWidth - edgeInsetX);
  return Math.max(edgeInsetX, Math.min(maxStartX, rawStartX));
}

function TiltSticker({
  item,
  index,
  baseLeftPct,
  baseTop,
  stickerWidth,
  stickerHeight,
  posXList,
  posYList,
  onPress,
  disabled = false,
  obscured = false,
  stickerFontKey,
  stickerFontScalePercent,
}: {
  item: TodayUploadSticker;
  index: number;
  baseLeftPct: number;
  baseTop: number;
  stickerWidth: number;
  stickerHeight: number;
  posXList: SharedValue<number[]>;
  posYList: SharedValue<number[]>;
  onPress?: () => void;
  disabled?: boolean;
  obscured?: boolean;
  stickerFontKey: StickerFontKey;
  stickerFontScalePercent: number;
}) {
  const stickerTiltDeg = ((index % 5) - 2) * 1.2;
  const stickerFont = resolveStickerFont(stickerFontKey);
  const labelText = normalizeStickerText(item.label);
  const isEmptyUpload = isEmptyUploadSticker(item);
  const isLightMode = useColorScheme() !== 'dark';
  const dynamicFontSize = getStickerFontSize(labelText.length) * (stickerFontScalePercent / 100);
  const dynamicLineHeight = Math.round(dynamicFontSize * 1.16);
  const svgHeight = Math.max(34, dynamicLineHeight + 10);
  const strokeWidth = Math.max(3.4, Math.min(5.2, dynamicFontSize * 0.22));
  const textY = Math.round(svgHeight * 0.72);
  const textX = Math.round(stickerWidth / 2);
  const svgRenderWidth = stickerWidth + STICKER_SVG_BLEED * 2;

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
          height: stickerHeight,
          left: `${baseLeftPct}%`,
          top: baseTop,
        },
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        style={[styles.stickerPressArea, { height: stickerHeight }]}
        activeOpacity={0.85}
        onPress={onPress}
        disabled={disabled}
        accessible={isEmptyUpload}
        accessibilityRole={isEmptyUpload ? 'image' : undefined}
        accessibilityLabel={isEmptyUpload ? item.label : undefined}
      >
        {isEmptyUpload ? (
          <Image
            source={EMPTY_UPLOAD_STICKER_IMAGE}
            resizeMode="contain"
            style={[styles.emptyUploadStickerImage, obscured ? styles.emptyUploadStickerImageObscured : null]}
          />
        ) : (
          <View style={styles.stickerWordWrap} pointerEvents="none">
            <Svg
              width={svgRenderWidth}
              height={svgHeight}
              viewBox={`${-STICKER_SVG_BLEED} 0 ${svgRenderWidth} ${svgHeight}`}
              style={[
                styles.stickerWordSvg,
                { marginHorizontal: -STICKER_SVG_BLEED },
                obscured ? styles.stickerWordSvgObscured : null,
              ]}
            >
              {isLightMode ? (
                <SvgText
                  x={textX + 1.2}
                  y={textY + 2}
                  fill="none"
                  stroke="rgba(0, 0, 0, 0.28)"
                  strokeWidth={strokeWidth + 2.2}
                  strokeLinejoin="round"
                  fontSize={dynamicFontSize}
                  fontWeight="900"
                  fontFamily={stickerFont.fontFamily}
                  textAnchor="middle"
                  letterSpacing={stickerFont.letterSpacing}
                >
                  {labelText}
                </SvgText>
              ) : null}
              <SvgText
                x={textX}
                y={textY}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                fontSize={dynamicFontSize}
                fontWeight="900"
                fontFamily={stickerFont.fontFamily}
                textAnchor="middle"
                letterSpacing={stickerFont.letterSpacing}
              >
                {labelText}
              </SvgText>
              <SvgText
                x={textX}
                y={textY}
                fill="#050505"
                fontSize={dynamicFontSize}
                fontWeight="900"
                fontFamily={stickerFont.fontFamily}
                textAnchor="middle"
                letterSpacing={stickerFont.letterSpacing}
              >
                {labelText}
              </SvgText>
            </Svg>
            {obscured ? (
              <BlurView
                pointerEvents="none"
                style={styles.stickerWordBlurOverlay}
                intensity={44}
                tint={isLightMode ? 'light' : 'dark'}
              />
            ) : null}
          </View>
        )}
      </TouchableOpacity>
    </Reanimated.View>
  );
}
function VocabStickerCloud({
  items,
  emptyLabel,
  onPressSticker,
  stickerFontKey,
  stickerFontScalePercent,
  gridHeight,
  hapticsEnabled = true,
  disabled = false,
  obscured = false,
}: {
  items: TodayUploadSticker[];
  emptyLabel: string;
  onPressSticker?: (item: TodayUploadSticker) => void;
  stickerFontKey: StickerFontKey;
  stickerFontScalePercent: number;
  gridHeight: number;
  hapticsEnabled?: boolean;
  disabled?: boolean;
  obscured?: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);
  const sensor = useAnimatedSensor(SensorType.GRAVITY, {
    interval: 16,
  });
  const stickers =
    items.length > 0
      ? items
      : [
          {
            key: EMPTY_UPLOAD_STICKER_KEY,
            label: emptyLabel,
          },
        ];
  const limitedStickers = stickers.slice(0, STICKER_MAX_VISIBLE_COUNT);
  const containerWidth = Math.max(120, gridWidth || windowWidth - 32);
  const stickerWidths = useMemo(
    () =>
      limitedStickers.map((item) =>
        isEmptyUploadSticker(item)
          ? Math.min(EMPTY_UPLOAD_STICKER_WIDTH, Math.max(STICKER_MIN_WIDTH, containerWidth - 4))
          : Math.min(
              estimateStickerWidth(item.label) * (stickerFontScalePercent / 100),
              Math.max(STICKER_MIN_WIDTH, containerWidth - 4)
            )
      ),
    [containerWidth, limitedStickers, stickerFontScalePercent]
  );
  const stickerHeights = useMemo(
    () => limitedStickers.map((item) => (isEmptyUploadSticker(item) ? EMPTY_UPLOAD_STICKER_HEIGHT : STICKER_HEIGHT)),
    [limitedStickers]
  );

  const posXList = useSharedValue<number[]>([]);
  const posYList = useSharedValue<number[]>([]);
  const velXList = useSharedValue<number[]>([]);
  const velYList = useSharedValue<number[]>([]);
  const borderContactList = useSharedValue<number[]>([]);
  const borderContactInitialized = useSharedValue(false);
  const tiltPeakX = useSharedValue(0);
  const tiltPeakY = useSharedValue(0);
  const hapticsEnabledShared = useSharedValue(hapticsEnabled);
  const lastBorderHapticAt = useRef(0);
  const hapticsEnabledRef = useRef(hapticsEnabled);

  useEffect(() => {
    hapticsEnabledRef.current = hapticsEnabled;
    hapticsEnabledShared.value = hapticsEnabled;
  }, [hapticsEnabled, hapticsEnabledShared]);

  const triggerBorderHaptic = useCallback(() => {
    if (!hapticsEnabledRef.current) return;
    const now = Date.now();
    if (now - lastBorderHapticAt.current < 180) return;
    lastBorderHapticAt.current = now;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  useEffect(() => {
    const count = limitedStickers.length;
    posXList.value = Array.from({ length: count }, (_, i) => (i % 2 === 0 ? -2 : 2));
    posYList.value = Array.from({ length: count }, (_, i) => ((i + 1) % 2 === 0 ? -1 : 1));
    velXList.value = Array.from({ length: count }, () => 0);
    velYList.value = Array.from({ length: count }, () => 0);
    borderContactList.value = Array.from({ length: count }, () => 0);
    borderContactInitialized.value = false;
    tiltPeakX.value = 0;
    tiltPeakY.value = 0;
  }, [
    borderContactInitialized,
    borderContactList,
    limitedStickers.length,
    posXList,
    posYList,
    tiltPeakX,
    tiltPeakY,
    velXList,
    velYList,
  ]);

  const EDGE_INSET_X = 5;
  const BOUNCE = 0.55;
  const COLLISION_BOUNCE = 0.62;
  const FRICTION = 0.93;
  const GRAVITY_MULTIPLIER = 420;
  const TILT_AXIS_TARGET = 0.45;
  const TILT_AXIS_MAX_GAIN = 1.8;
  const TILT_AXIS_DECAY = 0.995;
  const BORDER_CONTACT_EPS = 0.5;
  const BORDER_RELEASE_DISTANCE = 9;
  const BORDER_LEFT = 1;
  const BORDER_RIGHT = 2;
  const BORDER_TOP = 4;
  const BORDER_BOTTOM = 8;

  useFrameCallback((frameInfo) => {
    'worklet';
    if (frameInfo.timeSincePreviousFrame == null) return;
    const dt = frameInfo.timeSincePreviousFrame / 1000;
    const count = limitedStickers.length;
    if (count <= 0) return;

    const rawGx = sensor.sensor.value?.x ?? 0;
    const rawGy = sensor.sensor.value?.y ?? 0;
    tiltPeakX.value = Math.max(Math.abs(rawGx), tiltPeakX.value * TILT_AXIS_DECAY);
    tiltPeakY.value = Math.max(Math.abs(rawGy), tiltPeakY.value * TILT_AXIS_DECAY);
    const gainX = Math.min(
      TILT_AXIS_MAX_GAIN,
      Math.max(1, TILT_AXIS_TARGET / Math.max(tiltPeakX.value, 0.001))
    );
    const gainY = Math.min(
      TILT_AXIS_MAX_GAIN,
      Math.max(1, TILT_AXIS_TARGET / Math.max(tiltPeakY.value, 0.001))
    );
    const gx = rawGx * gainX;
    const gy = rawGy * gainY;
    const ax = gx * GRAVITY_MULTIPLIER;
    const ay = -gy * GRAVITY_MULTIPLIER;

    const px = posXList.value.slice();
    const py = posYList.value.slice();
    const vx = velXList.value.slice();
    const vy = velYList.value.slice();
    const previousBorderContacts = borderContactList.value.slice();
    const nextBorderContacts = previousBorderContacts.slice();
    const hasInitializedBorderContacts = borderContactInitialized.value;
    const impactCandidates = Array.from({ length: count }, () => 0);
    let didEnterBorder = false;

    for (let i = 0; i < count; i += 1) {
      const currentWidth = stickerWidths[i] ?? STICKER_WIDTH;
      const currentHeight = stickerHeights[i] ?? STICKER_HEIGHT;
      const startX = getStickerStartX(i, containerWidth, currentWidth, EDGE_INSET_X);
      const startY = getStickerBaseTop(i);
      const limitLeft = -startX + EDGE_INSET_X;
      const limitRight = containerWidth - currentWidth - startX - EDGE_INSET_X;
      const limitUp = -startY - STICKER_VERTICAL_BLEED;
      const limitDown = gridHeight - currentHeight - startY - 2;

      vx[i] += ax * dt;
      vy[i] += ay * dt;
      vx[i] *= Math.pow(FRICTION, dt * 60);
      vy[i] *= Math.pow(FRICTION, dt * 60);

      let nextX = (px[i] ?? 0) + vx[i] * dt;
      let nextY = (py[i] ?? 0) + vy[i] * dt;
      let impactMask = 0;

      if (nextX <= limitLeft) {
        nextX = limitLeft;
        vx[i] = Math.abs(vx[i]) * BOUNCE;
        impactMask |= BORDER_LEFT;
      } else if (nextX >= limitRight) {
        nextX = limitRight;
        vx[i] = -Math.abs(vx[i]) * BOUNCE;
        impactMask |= BORDER_RIGHT;
      }
      if (nextY <= limitUp) {
        nextY = limitUp;
        vy[i] = Math.abs(vy[i]) * BOUNCE;
        impactMask |= BORDER_TOP;
      } else if (nextY >= limitDown) {
        nextY = limitDown;
        vy[i] = -Math.abs(vy[i]) * BOUNCE;
        impactMask |= BORDER_BOTTOM;
      }

      px[i] = nextX;
      py[i] = nextY;
      impactCandidates[i] = impactMask;
    }

    // 貼紙-貼紙碰撞：分離重疊並交換速度分量，避免互相穿透
    for (let i = 0; i < count; i += 1) {
      const aiWidth = stickerWidths[i] ?? STICKER_WIDTH;
      const aiHeight = stickerHeights[i] ?? STICKER_HEIGHT;
      const aiStartX = getStickerStartX(i, containerWidth, aiWidth, EDGE_INSET_X);
      const aiBaseTop = getStickerBaseTop(i);
      const ax0 = aiStartX + (px[i] ?? 0);
      const ay0 = aiBaseTop + (py[i] ?? 0);
      for (let j = i + 1; j < count; j += 1) {
        const ajWidth = stickerWidths[j] ?? STICKER_WIDTH;
        const ajHeight = stickerHeights[j] ?? STICKER_HEIGHT;
        const ajStartX = getStickerStartX(j, containerWidth, ajWidth, EDGE_INSET_X);
        const ajBaseTop = getStickerBaseTop(j);
        const bx0 = ajStartX + (px[j] ?? 0);
        const by0 = ajBaseTop + (py[j] ?? 0);

        const overlapX = Math.min(ax0 + aiWidth, bx0 + ajWidth) - Math.max(ax0, bx0);
        const overlapY = Math.min(ay0 + aiHeight, by0 + ajHeight) - Math.max(ay0, by0);
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
      const currentWidth = stickerWidths[i] ?? STICKER_WIDTH;
      const currentHeight = stickerHeights[i] ?? STICKER_HEIGHT;
      const startX = getStickerStartX(i, containerWidth, currentWidth, EDGE_INSET_X);
      const startY = getStickerBaseTop(i);
      const limitLeft = -startX + EDGE_INSET_X;
      const limitRight = containerWidth - currentWidth - startX - EDGE_INSET_X;
      const limitUp = -startY - STICKER_VERTICAL_BLEED;
      const limitDown = gridHeight - currentHeight - startY - 2;

      px[i] = Math.max(limitLeft, Math.min(limitRight, px[i] ?? 0));
      py[i] = Math.max(limitUp, Math.min(limitDown, py[i] ?? 0));

      let touchingMask = 0;
      if (px[i] <= limitLeft + BORDER_CONTACT_EPS) touchingMask |= BORDER_LEFT;
      if (px[i] >= limitRight - BORDER_CONTACT_EPS) touchingMask |= BORDER_RIGHT;
      if (py[i] <= limitUp + BORDER_CONTACT_EPS) touchingMask |= BORDER_TOP;
      if (py[i] >= limitDown - BORDER_CONTACT_EPS) touchingMask |= BORDER_BOTTOM;

      const previousMask = previousBorderContacts[i] ?? 0;
      const newImpactMask = impactCandidates[i] & touchingMask & ~previousMask;
      if (hasInitializedBorderContacts && newImpactMask !== 0) {
        didEnterBorder = true;
      }

      let nextMask = previousMask | touchingMask;
      if (px[i] > limitLeft + BORDER_RELEASE_DISTANCE) nextMask &= ~BORDER_LEFT;
      if (px[i] < limitRight - BORDER_RELEASE_DISTANCE) nextMask &= ~BORDER_RIGHT;
      if (py[i] > limitUp + BORDER_RELEASE_DISTANCE) nextMask &= ~BORDER_TOP;
      if (py[i] < limitDown - BORDER_RELEASE_DISTANCE) nextMask &= ~BORDER_BOTTOM;
      nextBorderContacts[i] = nextMask;
    }

    posXList.value = px;
    posYList.value = py;
    velXList.value = vx;
    velYList.value = vy;
    borderContactList.value = nextBorderContacts;
    borderContactInitialized.value = true;

    if (didEnterBorder && hapticsEnabledShared.value) {
      runOnJS(triggerBorderHaptic)();
    }
  });

  return (
    <View
      style={[styles.stickerGrid, { height: gridHeight }]}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setGridWidth((prev) => (prev === nextWidth ? prev : nextWidth));
      }}
    >
      {limitedStickers.map((item, index) => {
        const currentWidth = stickerWidths[index] ?? STICKER_WIDTH;
        const currentHeight = stickerHeights[index] ?? STICKER_HEIGHT;
        const baseTop = getStickerBaseTop(index);
        const safeStartX = getStickerStartX(index, containerWidth, currentWidth, EDGE_INSET_X);
        const safeBaseLeftPct = (safeStartX / containerWidth) * 100;
        return (
          <TiltSticker
            key={item.key}
            item={item}
            index={index}
            baseLeftPct={safeBaseLeftPct}
            baseTop={baseTop}
            stickerWidth={currentWidth}
            stickerHeight={currentHeight}
            posXList={posXList}
            posYList={posYList}
            stickerFontKey={stickerFontKey}
            stickerFontScalePercent={stickerFontScalePercent}
            onPress={() => onPressSticker?.(item)}
            disabled={disabled || !item.cardId}
            obscured={obscured}
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

export default function CacheScreenFlow({ navigation, onRequestClose }: Props) {
  const colorScheme = useColorScheme();
  const palette = useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const isLight = colorScheme === 'light';
  const insets = useSafeAreaInsets();
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const appTour = useAppTour();
  const addButtonScale = React.useRef(new Animated.Value(1)).current;
  const [animationSeed, setAnimationSeed] = useState(0);
  const [restoreSeed, setRestoreSeed] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'text' | 'image'>('text');
  const [manualText, setManualText] = useState('');
  const [creatingText, setCreatingText] = useState(false);
  const creatingTextRef = useRef(false);
  const [didPasteIntoTextBox, setDidPasteIntoTextBox] = useState(false);
  const [pasteEnabled, setPasteEnabled] = useState(false);
  const [pendingBatchEnterIds, setPendingBatchEnterIds] = useState<string[]>([]);
  const [optimisticallyHiddenCacheIds, setOptimisticallyHiddenCacheIds] = useState<Set<string>>(
    () => new Set()
  );
  const [enteringCardIds, setEnteringCardIds] = useState<string[]>([]);
  const [visibleCacheIds, setVisibleCacheIds] = useState<string[]>([]);

  const hideCacheCardFromStack = React.useCallback((itemId: string) => {
    setVisibleCacheIds((prev) => prev.filter((id) => id !== itemId));
  }, []);

  const restoreCacheCardToStack = React.useCallback((itemId: string) => {
    setVisibleCacheIds((prev) => {
      if (prev.includes(itemId)) return prev;
      return [...prev, itemId];
    });
    setRestoreSeed((prev) => prev + 1);
  }, []);

  const {
    creatingImage,
    showQuickCamera,
    quickCameraFacing,
    showUploadCropper,
    pendingOriginalImageUri,
    pendingOriginalImageSize,
    showConfirmTutorialArrow,
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
    onBatchQuickAddCreated: (createdItemIds) => {
      setPendingBatchEnterIds(createdItemIds);
    },
    onSwipeImageCropCancel: restoreCacheCardToStack,
  });
  const [isCacheFocused, setIsCacheFocused] = useState<boolean>(navigation?.isFocused?.() ?? true);
  const [stickerFontKey, setStickerFontKey] = useState<StickerFontKey>(DEFAULT_STICKER_FONT_KEY);
  const [stickerFontScalePercent, setStickerFontScalePercent] = useState(
    DEFAULT_USER_SETTINGS.stickerFontScalePercent
  );
  const [uiLanguage, setUiLanguage] = useState<UILanguage>(
    () => getInitialUserSettings().uiLanguage
  );
  const applyCacheSettings = useCallback((settings: UserAppSettings) => {
    setStickerFontKey(settings.stickerFontKey);
    setStickerFontScalePercent(settings.stickerFontScalePercent);
    setUiLanguage(settings.uiLanguage);
  }, []);
  const previousCardCountRef = React.useRef<number | null>(null);
  const hasSeenCacheOnceRef = React.useRef(false);
  const lastSeenStackCardIdsRef = React.useRef<string[]>([]);
  const openAddModal = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    if (!navigation?.addListener) return;
    const offFocus = navigation.addListener('focus', () => {
      setIsCacheFocused(true);
      void loadUserSettings()
        .then(applyCacheSettings)
        .catch((error) => console.error('[CacheList] load sticker font failed:', error));
    });
    const offBlur = navigation.addListener('blur', () => {
      setIsCacheFocused(false);
    });
    return () => {
      offFocus?.();
      offBlur?.();
    };
  }, [applyCacheSettings, navigation]);

  useEffect(() => {
    void loadUserSettings()
      .then(applyCacheSettings)
      .catch((error) => console.error('[CacheList] load sticker font failed:', error));
  }, [applyCacheSettings]);

  useEffect(
    () =>
      subscribeUserSettings((settings) => {
        applyCacheSettings(settings);
      }),
    [applyCacheSettings]
  );

  const { cards: rawCards, todayStickerWords, todayUploadedCardIds, cacheItems } = useCacheListDataSource({
    getDetectedPreview,
    toSourceLabel,
    toRelativeImportTime,
    normalizeStickerText,
    toDayKey,
    optimisticallyHiddenCacheIds,
  });
  const todayUploadGridHeight = useMemo(
    () => getStickerGridHeightForCount(todayStickerWords.length),
    [todayStickerWords.length]
  );
  const todayUploadSectionOffset = useMemo(
    () => -(todayUploadGridHeight / 2 + 24),
    [todayUploadGridHeight]
  );
  const { liveDetectedPreviewById } = useCacheOcrBackfill({
    cacheItems,
    getDetectedPreview,
  });

  useEffect(() => {
    void ReminderNotificationService.evaluateAndSchedule({ allowSoftPrompt: false }).catch((error) => {
      console.warn('[Reminders] schedule after cache change failed:', error);
    });
  }, [cacheItems.length]);

  const cards = useMemo(
    () =>
      rawCards.map((item) => ({
        ...item,
        detectedPreview: item.imageUri ? liveDetectedPreviewById[item.id] ?? item.detectedPreview : item.detectedPreview,
      })),
    [liveDetectedPreviewById, rawCards]
  );
  const { deleteCacheItemPermanently, deleteAllCacheItemsPermanently } =
    useCacheItemCleanup({
      cacheItems,
      deletionLocked: appTour.isActive,
    });

  useEffect(() => {
    if (optimisticallyHiddenCacheIds.size === 0) return;
    const activeIds = new Set(cacheItems.map((item) => item.id));
    setOptimisticallyHiddenCacheIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (activeIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [cacheItems, optimisticallyHiddenCacheIds.size]);

  const stackCards = useMemo(() => {
    const visibleIdSet = new Set(visibleCacheIds);
    return cards
      .filter((item) => visibleIdSet.has(item.id))
      .slice(-MAX_RENDERED_CACHE_CARDS)
      .map((item) => ({
        id: item.id,
        imageUri: item.imageUri,
        text: item.text,
        detectedPreview: item.detectedPreview,
        sourceLabel: item.sourceLabel,
        importedAtLabel: item.importedAtLabel,
        isDefaultExperienceCard: item.isDefaultExperienceCard,
      }));
  }, [cards, visibleCacheIds]);
  React.useEffect(() => {
    console.log(
      `[FirstRunTrace] cache_stack.render isCacheFocused=${isCacheFocused} visibleIds=${visibleCacheIds.length} stackCards=${stackCards.length} defaultInStack=${stackCards.some((c) => c.isDefaultExperienceCard)} topIsDefault=${stackCards[stackCards.length - 1]?.isDefaultExperienceCard ?? false}`
    );
  }, [isCacheFocused, stackCards, visibleCacheIds.length]);
  const isTodayUploadObscured = cards.length > 0;

  useEffect(() => {
    if (!isCacheFocused) return;

    const currentIds = cards.map((card) => card.id);
    const seenIds = lastSeenStackCardIdsRef.current;
    const pendingBatchIds = pendingBatchEnterIds;

    if (enteringCardIds.length > 0) {
      lastSeenStackCardIdsRef.current = currentIds;
      return;
    }

    if (pendingBatchIds.length > 0) {
      if (showAddModal) return;

      const readyIds = pendingBatchIds.filter((id) => currentIds.includes(id));
      if (readyIds.length !== pendingBatchIds.length) return;

      setPendingBatchEnterIds([]);
      setVisibleCacheIds(currentIds);
      setEnteringCardIds(readyIds);
      setAnimationSeed((prev) => prev + 1);
      hasSeenCacheOnceRef.current = true;
      lastSeenStackCardIdsRef.current = currentIds;
      return;
    }

    if (!hasSeenCacheOnceRef.current) {
      if (currentIds.length > 0) {
        setVisibleCacheIds(currentIds);
        setEnteringCardIds(currentIds);
        setAnimationSeed((prev) => prev + 1);
      } else {
        setVisibleCacheIds([]);
      }
      hasSeenCacheOnceRef.current = true;
      lastSeenStackCardIdsRef.current = currentIds;
      return;
    }

    const seenSet = new Set(seenIds);
    const newlyAdded = currentIds.filter((id) => !seenSet.has(id));

    if (newlyAdded.length > 0) {
      if (showAddModal) return;
      setVisibleCacheIds(currentIds);
      setEnteringCardIds(newlyAdded);
      setAnimationSeed((prev) => prev + 1);
    } else {
      setVisibleCacheIds(currentIds);
      setRestoreSeed((prev) => prev + 1);
    }

    lastSeenStackCardIdsRef.current = currentIds;
  }, [cards, enteringCardIds.length, isCacheFocused, pendingBatchEnterIds, showAddModal]);

  useEffect(() => {
    if (enteringCardIds.length === 0) return;
    const timer = setTimeout(() => {
      setEnteringCardIds([]);
    }, 1800);
    return () => clearTimeout(timer);
  }, [enteringCardIds]);

  const handlePressTodaySticker = React.useCallback(
    (item: TodayUploadSticker) => {
      if (!item.cardId) return;
      const cardIds = todayUploadedCardIds.length > 0 ? todayUploadedCardIds : [item.cardId];
      navigation.navigate('CardDetail', {
        cardId: item.cardId,
        cardIds,
        headerTitle: tUI(uiLanguage, 'cache.todayUploads'),
      });
    },
    [navigation, todayUploadedCardIds, uiLanguage]
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
    if (!trimmed || creatingTextRef.current) return;
    creatingTextRef.current = true;
    setCreatingText(true);
    try {
      const userId = await getCurrentSessionUserId();
      if (!userId) {
        Alert.alert('需要登入', '請先登入後再使用文字新增。');
        return;
      }
      const collection = database.get<CachedItem>('cached_items');
      if ((await getRemainingCacheCapacity(userId)) <= 0) {
        Alert.alert('暫存區已滿', '請先處理或刪除部分暫存卡片後再新增。');
        return;
      }
      const contentText = trimmed.slice(0, 2000);
      let duplicateFound = false;
      await database.write(async () => {
        const duplicate = await collection
          .query(
            Q.where('user_id', userId),
            Q.where('content_type', 'text'),
            Q.where('content_text', contentText),
            Q.where('deleted_at', null),
            Q.take(1)
          )
          .fetch();
        if (duplicate.length > 0) {
          duplicateFound = true;
          return;
        }
        await collection.create((item) => {
          item.userId = userId;
          item.type = 'text';
          item.contentType = 'text';
          item.contentText = contentText;
          item.sourceApp = 'manual';
          item.aiAnalysisCompleted = false;
          item.convertedToCard = false;
          const expiresAt = new Date();
          expiresAt.setMinutes(expiresAt.getMinutes() + 10);
          item.expiresAt = expiresAt;
        });
      });
      if (duplicateFound) {
        Alert.alert(
          tUI(uiLanguage, 'cache.duplicateTitle'),
          tUI(uiLanguage, 'cache.duplicateMessage')
        );
        return;
      }
      setManualText('');
      setDidPasteIntoTextBox(false);
      setShowAddModal(false);
    } catch (error) {
      console.error('[CacheList] quick add text failed:', error);
      Alert.alert('新增失敗', '無法新增文字快取，請稍後再試。');
    } finally {
      creatingTextRef.current = false;
      setCreatingText(false);
    }
  }, [appTour, manualText, uiLanguage]);

  const handleDeleteAllCacheItems = React.useCallback(() => {
    if (appTour.isActive) return;
    if (cacheItems.length === 0) return;
    Alert.alert(
      tUI(uiLanguage, 'cache.deleteAllTitle'),
      tUI(uiLanguage, 'cache.deleteAllMessage').replace('{count}', String(cacheItems.length)),
      [
        { text: tUI(uiLanguage, 'common.cancel'), style: 'cancel' },
        {
          text: tUI(uiLanguage, 'cache.deleteAllConfirm'),
          style: 'destructive',
          onPress: () => {
            void deleteAllCacheItemsPermanently().then((success) => {
              if (success) {
                setVisibleCacheIds([]);
                setEnteringCardIds([]);
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                return;
              }
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                tUI(uiLanguage, 'cache.deleteAllFailedTitle'),
                tUI(uiLanguage, 'cache.deleteAllFailedMessage')
              );
            });
          },
        },
      ]
    );
  }, [appTour.isActive, cacheItems.length, deleteAllCacheItemsPermanently, uiLanguage]);

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

  const hideCacheCardImmediately = React.useCallback((itemId: string) => {
    hideCacheCardFromStack(itemId);
    setOptimisticallyHiddenCacheIds((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, [hideCacheCardFromStack]);

  const { handleCardImageError, handleCardSwipeStart, handleCardSwipe } = useCacheSwipeActions({
    cards,
    navigation,
    appTour,
    hideCacheCardFromStack,
    restoreCacheCardToStack,
    hideCacheCardImmediately,
    deleteCacheItemPermanently,
    openCropperForSwipeImage,
  });

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
      <View style={[styles.vocabSection, { transform: [{ translateY: todayUploadSectionOffset }] }]}>
        <Text
          style={[
            styles.vocabTitleOutside,
            { color: isLight ? '#64748B' : '#FBFBFB' },
            isTodayUploadObscured ? styles.vocabTitleObscured : null,
          ]}
        >
          {tUI(uiLanguage, 'cache.todayUploads')}
        </Text>
        <View
          style={[
            styles.vocabContainer,
            { height: todayUploadGridHeight },
            isLight
              ? {
                  backgroundColor: palette.containerBg,
                  borderColor: palette.borderSubtle,
                  shadowOpacity: 0.05,
                }
              : null,
          ]}
        >
          <VocabStickerCloud
            items={todayStickerWords}
            emptyLabel={tUI(uiLanguage, 'cache.noUploadsToday')}
            stickerFontKey={stickerFontKey}
            stickerFontScalePercent={stickerFontScalePercent}
            gridHeight={todayUploadGridHeight}
            onPressSticker={handlePressTodaySticker}
            hapticsEnabled={isCacheFocused && !isTodayUploadObscured}
            disabled={isTodayUploadObscured}
            obscured={isTodayUploadObscured}
          />
          {isTodayUploadObscured ? (
            <BlurView pointerEvents="none" style={styles.vocabBlurOverlay} intensity={65} tint={isLight ? 'light' : 'dark'} />
          ) : null}
        </View>
      </View>

      <View style={styles.stackLayer} pointerEvents="box-none">
        <CacheStackUI
          cards={stackCards}
          animationSeed={animationSeed}
          restoreSeed={restoreSeed}
          enteringCardIds={enteringCardIds}
          onCardSwipeStart={handleCardSwipeStart}
          onCardSwipe={handleCardSwipe}
          onCardImageError={handleCardImageError}
          onDeleteAll={handleDeleteAllCacheItems}
          uiLanguage={uiLanguage}
          deletionLocked={appTour.isActive}
          tourCreateActive={appTour.step === 'STEP_5_PROCESS_CACHE_CARD'}
        />
      </View>

      <View style={[styles.uploadBarButtonWrap, { bottom: Math.max(insets.bottom, 8) + 60 }]}>
        <Animated.View
          style={[
            { transform: [{ scale: addButtonScale }] },
          ]}
        >
          <TouchableOpacity
            style={styles.uploadBarButton}
            activeOpacity={0.9}
            onPressIn={() => animateAddButtonPress(0.95)}
            onPressOut={() => animateAddButtonPress(1)}
            onPress={openAddModal}
          >
            <Text style={styles.uploadBarButtonLabel}>＋ {tUI(uiLanguage, 'cache.upload')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <CacheInputModalUI
        visible={showAddModal}
        suppressAnimation={suppressAddModalAnimation}
        addTab={addTab}
        manualText={manualText}
        creatingImage={creatingImage}
        creatingText={creatingText}
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
        uiLanguage={uiLanguage}
      />

      <ImageCropperModal
        visible={showUploadCropper}
        imageUri={pendingOriginalImageUri}
        initialImageSize={pendingOriginalImageSize}
        modalAnimationType="slide"
        uiLanguage={uiLanguage}
        showConfirmTutorialArrow={showConfirmTutorialArrow}
        onCancel={handleUploadCropCancel}
        onConfirm={handleUploadCropConfirm}
      />

      <CameraModalUI
        visible={showQuickCamera}
        hasPermission={Boolean(quickCameraPermission?.granted)}
        cameraRef={quickCameraRef}
        facing={quickCameraFacing}
        uiLanguage={uiLanguage}
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
    backgroundColor: SCREEN_BG,
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
  vocabTitleObscured: {
    opacity: 0.36,
    textShadowColor: 'rgba(148, 163, 184, 0.86)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 7,
  },
  vocabContainer: {
    minHeight: 188,
    borderRadius: 16,
    backgroundColor: CONTAINER_BG,
    borderWidth: 1,
    borderColor: CONTAINER_NEON_OUTLINE,
    shadowColor: CONTAINER_NEON_GLOW,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
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
    position: 'relative',
  },
  stickerWordSvg: {
    overflow: 'visible',
  },
  stickerWordSvgObscured: {
    opacity: 0.34,
  },
  emptyUploadStickerImage: {
    width: EMPTY_UPLOAD_STICKER_WIDTH,
    height: EMPTY_UPLOAD_STICKER_HEIGHT,
  },
  emptyUploadStickerImageObscured: {
    opacity: 0.34,
  },
  stickerWordBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },
  vocabBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    zIndex: 5,
  },
  stackLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  uploadBarButton: {
    height: BUTTON_TOKENS.height.prominent,
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: UPLOAD_CACHE_CTA_COLOR,
    borderWidth: 1,
    borderColor: UPLOAD_CACHE_CTA_COLOR_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00E5FF',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  uploadBarButtonLabel: {
    color: TEXT_ON_CTA,
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
    letterSpacing: 0.2,
  },
});
