import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import Svg, { Path } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_USER_SETTINGS,
  type UILanguage,
} from '../services/settings/userSettings';
import { tUI } from '../i18n/uiLanguage';
import MovingTutorialArrow from './UI/shared/MovingTutorialArrow';

type Size = {
  width: number;
  height: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ImageTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';
type EdgeKey = 'top' | 'right' | 'bottom' | 'left';

type Props = {
  visible: boolean;
  imageUri: string | null;
  initialImageSize?: Size | null;
  cropShape?: 'rect' | 'circle' | 'album';
  fixedCropSize?: number;
  modalAnimationType?: 'none' | 'slide' | 'fade';
  uiLanguage?: UILanguage;
  showConfirmTutorialArrow?: boolean;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
};

const MIN_EDGE = 60;
const HANDLE_SIZE = 24;
const HANDLE_HITBOX_SIZE = 44;
const EDGE_HITBOX_SIZE = 28;
const MOVE_HITBOX_INSET = 20;
const ALBUM_CROP_RADIUS = 28;
const CROP_GUIDE_CORNER_LENGTH = 42;
const CROP_GUIDE_CORNER_THICKNESS = 8;

function createRoundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return [
    `M ${x + r} ${y}`,
    `H ${x + width - r}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `V ${y + height - r}`,
    `Q ${x + width} ${y + height} ${x + width - r} ${y + height}`,
    `H ${x + r}`,
    `Q ${x} ${y + height} ${x} ${y + height - r}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

export default function ImageCropperModal({
  visible,
  imageUri,
  initialImageSize,
  cropShape = 'rect',
  fixedCropSize,
  modalAnimationType = 'slide',
  uiLanguage = DEFAULT_USER_SETTINGS.uiLanguage,
  showConfirmTutorialArrow = false,
  onCancel,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const isFixedCropShape = cropShape === 'circle' || cropShape === 'album';
  const [imageSize, setImageSize] = React.useState<Size | null>(null);
  const [containerSize, setContainerSize] = React.useState<Size>({
    width: 0,
    height: 0,
  });
  const [cropRect, setCropRect] = React.useState<Rect | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [imageTransform, setImageTransform] = React.useState<ImageTransform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  const cropRectRef = React.useRef<Rect | null>(null);
  const imageTransformRef = React.useRef<ImageTransform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const displayMetricsRef = React.useRef<{
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);
  const reservedTopInset = React.useMemo(
    () => insets.top + (isFixedCropShape ? 104 : 88),
    [insets.top, isFixedCropShape]
  );

  const commitImageTransform = React.useCallback(
    (nextTransform: ImageTransform) => {
      const current = imageTransformRef.current;
      const hasMeaningfulChange =
        Math.abs(current.scale - nextTransform.scale) > 0.002 ||
        Math.abs(current.translateX - nextTransform.translateX) > 0.35 ||
        Math.abs(current.translateY - nextTransform.translateY) > 0.35;
      if (!hasMeaningfulChange) {
        return;
      }
      imageTransformRef.current = nextTransform;
      setImageTransform(nextTransform);
    },
    []
  );

  React.useEffect(() => {
    if (!visible || !imageUri) return;
    if (
      initialImageSize &&
      initialImageSize.width > 0 &&
      initialImageSize.height > 0
    ) {
      setImageSize(initialImageSize);
      return;
    }

    Image.getSize(
      imageUri,
      (width, height) => setImageSize({ width, height }),
      () => {
        Alert.alert(
          tUI(uiLanguage, 'cropper.failedTitle'),
          tUI(uiLanguage, 'cropper.failedBody')
        );
        onCancel();
      }
    );
  }, [visible, imageUri, initialImageSize, onCancel, uiLanguage]);

  const displayMetrics = React.useMemo(() => {
    if (!imageSize || !containerSize.width || !containerSize.height)
      return null;
    const scale = Math.min(
      containerSize.width / imageSize.width,
      containerSize.height / imageSize.height
    );
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;
    const left = (containerSize.width - width) / 2;
    const top = (containerSize.height - height) / 2;
    return { width, height, left, top };
  }, [containerSize, imageSize]);

  const clamp = React.useCallback((value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max);
  }, []);

  React.useEffect(() => {
    if (!displayMetrics) return;

    if (isFixedCropShape) {
      const preferredSize = fixedCropSize ?? 200;
      const maxHeightWithoutHeader = Math.max(
        MIN_EDGE,
        containerSize.height - reservedTopInset - 28
      );
      const size = Math.max(
        MIN_EDGE,
        Math.min(
          preferredSize,
          displayMetrics.width,
          displayMetrics.height,
          maxHeightWithoutHeader
        )
      );
      const left = (containerSize.width - size) / 2;
      const centeredTop = (containerSize.height - size) / 2;
      const maxTop = Math.max(
        reservedTopInset,
        containerSize.height - size - 28
      );
      const top = clamp(
        Math.max(centeredTop, reservedTopInset),
        reservedTopInset,
        maxTop
      );
      setCropRect({ x: left, y: top, width: size, height: size });
      return;
    }

    setCropRect((prev) => {
      if (prev) return prev;
      const marginX = Math.max(16, displayMetrics.width * 0.1);
      const marginY = Math.max(16, displayMetrics.height * 0.1);
      const preferredY = displayMetrics.top + marginY;
      const y = clamp(
        Math.max(preferredY, reservedTopInset),
        displayMetrics.top,
        Math.max(
          displayMetrics.top,
          displayMetrics.top + displayMetrics.height - MIN_EDGE
        )
      );
      const availableBottom = displayMetrics.top + displayMetrics.height;
      return {
        x: displayMetrics.left + marginX,
        y,
        width: Math.max(MIN_EDGE, displayMetrics.width - marginX * 2),
        height: Math.max(MIN_EDGE, availableBottom - y - marginY),
      };
    });
  }, [
    clamp,
    containerSize.height,
    containerSize.width,
    cropShape,
    displayMetrics,
    fixedCropSize,
    isFixedCropShape,
    reservedTopInset,
  ]);

  React.useEffect(() => {
    if (!visible) {
      setCropRect(null);
      setImageSize(null);
      setProcessing(false);
      setImageTransform({
        scale: 1,
        translateX: 0,
        translateY: 0,
      });
    }
  }, [visible]);

  React.useEffect(() => {
    cropRectRef.current = cropRect;
  }, [cropRect]);

  React.useEffect(() => {
    displayMetricsRef.current = displayMetrics;
  }, [displayMetrics]);

  React.useEffect(() => {
    imageTransformRef.current = imageTransform;
  }, [imageTransform]);

  const circleScaleBounds = React.useMemo(() => {
    if (!displayMetrics || !cropRect || !isFixedCropShape) {
      return { minScale: 1, maxScale: 4 };
    }
    // Let users pinch inward as long as the image still fully covers the fixed crop mask.
    const minScale = Math.max(
      cropRect.width / displayMetrics.width,
      cropRect.height / displayMetrics.height
    );
    return {
      minScale,
      maxScale: Math.max(minScale, 4),
    };
  }, [cropRect, displayMetrics, isFixedCropShape]);

  const clampCircleTransform = React.useCallback(
    (transform: ImageTransform) => {
      if (!displayMetrics || !cropRect) return transform;

      const width = displayMetrics.width * transform.scale;
      const height = displayMetrics.height * transform.scale;
      const baseLeft = displayMetrics.left + (displayMetrics.width - width) / 2;
      const baseTop = displayMetrics.top + (displayMetrics.height - height) / 2;

      const minTranslateX = cropRect.x + cropRect.width - (baseLeft + width);
      const maxTranslateX = cropRect.x - baseLeft;
      const minTranslateY = cropRect.y + cropRect.height - (baseTop + height);
      const maxTranslateY = cropRect.y - baseTop;

      return {
        scale: transform.scale,
        translateX: clamp(transform.translateX, minTranslateX, maxTranslateX),
        translateY: clamp(transform.translateY, minTranslateY, maxTranslateY),
      };
    },
    [clamp, cropRect, displayMetrics]
  );

  React.useEffect(() => {
    if (!visible || !isFixedCropShape || !displayMetrics || !cropRect) return;
    commitImageTransform(
      clampCircleTransform({
        scale: circleScaleBounds.minScale,
        translateX: 0,
        translateY: 0,
      })
    );
  }, [
    clampCircleTransform,
    circleScaleBounds.minScale,
    commitImageTransform,
    cropRect,
    displayMetrics,
    isFixedCropShape,
    visible,
  ]);

  const createHandleResponder = React.useCallback(
    (corner: CornerKey) => {
      let startRect: Rect | null = null;

      return PanResponder.create({
        onStartShouldSetPanResponder: () => !isFixedCropShape,
        onMoveShouldSetPanResponder: () => !isFixedCropShape,
        onStartShouldSetPanResponderCapture: () => !isFixedCropShape,
        onMoveShouldSetPanResponderCapture: () => !isFixedCropShape,
        onPanResponderGrant: () => {
          startRect = cropRectRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const metrics = displayMetricsRef.current;
          if (!startRect || !metrics) return;
          const dx = gestureState.dx;
          const dy = gestureState.dy;

          const right = startRect.x + startRect.width;
          const bottom = startRect.y + startRect.height;
          let next: Rect = startRect;

          if (corner === 'topLeft') {
            const x = clamp(startRect.x + dx, metrics.left, right - MIN_EDGE);
            const y = clamp(startRect.y + dy, metrics.top, bottom - MIN_EDGE);
            next = { x, y, width: right - x, height: bottom - y };
          } else if (corner === 'topRight') {
            const newRight = clamp(
              right + dx,
              startRect.x + MIN_EDGE,
              metrics.left + metrics.width
            );
            const y = clamp(startRect.y + dy, metrics.top, bottom - MIN_EDGE);
            next = {
              x: startRect.x,
              y,
              width: newRight - startRect.x,
              height: bottom - y,
            };
          } else if (corner === 'bottomRight') {
            const newRight = clamp(
              right + dx,
              startRect.x + MIN_EDGE,
              metrics.left + metrics.width
            );
            const newBottom = clamp(
              bottom + dy,
              startRect.y + MIN_EDGE,
              metrics.top + metrics.height
            );
            next = {
              x: startRect.x,
              y: startRect.y,
              width: newRight - startRect.x,
              height: newBottom - startRect.y,
            };
          } else {
            const x = clamp(startRect.x + dx, metrics.left, right - MIN_EDGE);
            const newBottom = clamp(
              bottom + dy,
              startRect.y + MIN_EDGE,
              metrics.top + metrics.height
            );
            next = {
              x,
              y: startRect.y,
              width: right - x,
              height: newBottom - startRect.y,
            };
          }

          setCropRect(next);
        },
      });
    },
    [clamp, isFixedCropShape]
  );

  const createEdgeResponder = React.useCallback(
    (edge: EdgeKey) => {
      let startRect: Rect | null = null;

      return PanResponder.create({
        onStartShouldSetPanResponder: () => !isFixedCropShape,
        onMoveShouldSetPanResponder: () => !isFixedCropShape,
        onStartShouldSetPanResponderCapture: () => !isFixedCropShape,
        onMoveShouldSetPanResponderCapture: () => !isFixedCropShape,
        onPanResponderGrant: () => {
          startRect = cropRectRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const metrics = displayMetricsRef.current;
          if (!startRect || !metrics) return;
          const dx = gestureState.dx;
          const dy = gestureState.dy;
          const right = startRect.x + startRect.width;
          const bottom = startRect.y + startRect.height;

          if (edge === 'top') {
            const y = clamp(startRect.y + dy, metrics.top, bottom - MIN_EDGE);
            setCropRect({
              x: startRect.x,
              y,
              width: startRect.width,
              height: bottom - y,
            });
          } else if (edge === 'right') {
            const newRight = clamp(
              right + dx,
              startRect.x + MIN_EDGE,
              metrics.left + metrics.width
            );
            setCropRect({
              x: startRect.x,
              y: startRect.y,
              width: newRight - startRect.x,
              height: startRect.height,
            });
          } else if (edge === 'bottom') {
            const newBottom = clamp(
              bottom + dy,
              startRect.y + MIN_EDGE,
              metrics.top + metrics.height
            );
            setCropRect({
              x: startRect.x,
              y: startRect.y,
              width: startRect.width,
              height: newBottom - startRect.y,
            });
          } else {
            const x = clamp(startRect.x + dx, metrics.left, right - MIN_EDGE);
            setCropRect({
              x,
              y: startRect.y,
              width: right - x,
              height: startRect.height,
            });
          }
        },
      });
    },
    [clamp, isFixedCropShape]
  );

  const moveRectResponder = React.useRef(
    (() => {
      let startRect: Rect | null = null;
      return PanResponder.create({
        onStartShouldSetPanResponder: () => !isFixedCropShape,
        onMoveShouldSetPanResponder: () => !isFixedCropShape,
        onStartShouldSetPanResponderCapture: () => !isFixedCropShape,
        onMoveShouldSetPanResponderCapture: () => !isFixedCropShape,
        onPanResponderGrant: () => {
          startRect = cropRectRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const metrics = displayMetricsRef.current;
          if (!metrics || !startRect) return;

          const minX = metrics.left;
          const maxX = metrics.left + metrics.width - startRect.width;
          const minY = metrics.top;
          const maxY = metrics.top + metrics.height - startRect.height;

          setCropRect({
            x: clamp(startRect.x + gestureState.dx, minX, maxX),
            y: clamp(startRect.y + gestureState.dy, minY, maxY),
            width: startRect.width,
            height: startRect.height,
          });
        },
      });
    })()
  ).current;

  const topLeftResponder = React.useRef(
    createHandleResponder('topLeft')
  ).current;
  const topRightResponder = React.useRef(
    createHandleResponder('topRight')
  ).current;
  const bottomRightResponder = React.useRef(
    createHandleResponder('bottomRight')
  ).current;
  const bottomLeftResponder = React.useRef(
    createHandleResponder('bottomLeft')
  ).current;
  const topEdgeResponder = React.useRef(createEdgeResponder('top')).current;
  const rightEdgeResponder = React.useRef(createEdgeResponder('right')).current;
  const bottomEdgeResponder = React.useRef(
    createEdgeResponder('bottom')
  ).current;
  const leftEdgeResponder = React.useRef(createEdgeResponder('left')).current;

  const circleImageFrame = React.useMemo(() => {
    if (!displayMetrics || !isFixedCropShape) return null;
    const width = displayMetrics.width * imageTransform.scale;
    const height = displayMetrics.height * imageTransform.scale;
    return {
      left:
        displayMetrics.left +
        (displayMetrics.width - width) / 2 +
        imageTransform.translateX,
      top:
        displayMetrics.top +
        (displayMetrics.height - height) / 2 +
        imageTransform.translateY,
      width,
      height,
    };
  }, [displayMetrics, imageTransform, isFixedCropShape]);

  const cropRectStyle = React.useMemo(() => {
    if (!cropRect) return null;
    return {
      left: cropRect.x,
      top: cropRect.y,
      width: cropRect.width,
      height: cropRect.height,
    };
  }, [cropRect]);

  const fixedGestureStartRef = React.useRef<ImageTransform | null>(null);

  const beginFixedGesture = React.useCallback(() => {
    fixedGestureStartRef.current = imageTransformRef.current;
  }, []);

  const updateFixedPan = React.useCallback(
    (translationX: number, translationY: number) => {
      const startTransform =
        fixedGestureStartRef.current ?? imageTransformRef.current;
      commitImageTransform(
        clampCircleTransform({
          scale: startTransform.scale,
          translateX: startTransform.translateX + translationX,
          translateY: startTransform.translateY + translationY,
        })
      );
    },
    [clampCircleTransform, commitImageTransform]
  );

  const updateFixedPinch = React.useCallback(
    (gestureScale: number) => {
      const startTransform =
        fixedGestureStartRef.current ?? imageTransformRef.current;
      const nextScale = clamp(
        startTransform.scale * gestureScale,
        circleScaleBounds.minScale,
        circleScaleBounds.maxScale
      );
      commitImageTransform(
        clampCircleTransform({
          scale: nextScale,
          translateX: startTransform.translateX,
          translateY: startTransform.translateY,
        })
      );
    },
    [
      clamp,
      clampCircleTransform,
      circleScaleBounds.maxScale,
      circleScaleBounds.minScale,
      commitImageTransform,
    ]
  );

  const resetFixedGesture = React.useCallback(() => {
    fixedGestureStartRef.current = imageTransformRef.current;
  }, []);

  const fixedCropGesture = React.useMemo(() => {
    if (!isFixedCropShape) {
      return null;
    }

    const pan = Gesture.Pan()
      .runOnJS(true)
      .minPointers(1)
      .maxPointers(1)
      .onBegin(() => {
        beginFixedGesture();
      })
      .onUpdate((event) => {
        updateFixedPan(event.translationX, event.translationY);
      })
      .onEnd(() => {
        resetFixedGesture();
      })
      .onFinalize(() => {
        resetFixedGesture();
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onBegin(() => {
        beginFixedGesture();
      })
      .onUpdate((event) => {
        updateFixedPinch(event.scale);
      })
      .onEnd(() => {
        resetFixedGesture();
      })
      .onFinalize(() => {
        resetFixedGesture();
      });

    return Gesture.Simultaneous(pan, pinch);
  }, [
    beginFixedGesture,
    isFixedCropShape,
    resetFixedGesture,
    updateFixedPan,
    updateFixedPinch,
  ]);

  const handleConfirm = React.useCallback(async () => {
    if (!imageUri || !cropRect || !imageSize || !displayMetrics) return;

    try {
      setProcessing(true);

      let originX = 0;
      let originY = 0;
      let width = 1;
      let height = 1;

      if (isFixedCropShape && circleImageFrame) {
        originX = Math.max(
          0,
          Math.round(
            ((cropRect.x - circleImageFrame.left) / circleImageFrame.width) *
              imageSize.width
          )
        );
        originY = Math.max(
          0,
          Math.round(
            ((cropRect.y - circleImageFrame.top) / circleImageFrame.height) *
              imageSize.height
          )
        );
        width = Math.max(
          1,
          Math.round(
            (cropRect.width / circleImageFrame.width) * imageSize.width
          )
        );
        height = Math.max(
          1,
          Math.round(
            (cropRect.height / circleImageFrame.height) * imageSize.height
          )
        );
      } else {
        originX = Math.max(
          0,
          Math.round(
            ((cropRect.x - displayMetrics.left) / displayMetrics.width) *
              imageSize.width
          )
        );
        originY = Math.max(
          0,
          Math.round(
            ((cropRect.y - displayMetrics.top) / displayMetrics.height) *
              imageSize.height
          )
        );
        width = Math.max(
          1,
          Math.round((cropRect.width / displayMetrics.width) * imageSize.width)
        );
        height = Math.max(
          1,
          Math.round(
            (cropRect.height / displayMetrics.height) * imageSize.height
          )
        );
      }

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ crop: { originX, originY, width, height } }],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );

      onConfirm(result.uri);
    } catch (error) {
      console.error('[ImageCropper] crop failed:', error);
      Alert.alert(
        tUI(uiLanguage, 'cropper.failedTitle'),
        tUI(uiLanguage, 'cropper.failedBody')
      );
    } finally {
      setProcessing(false);
    }
  }, [
    circleImageFrame,
    cropRect,
    displayMetrics,
    imageSize,
    imageUri,
    isFixedCropShape,
    onConfirm,
    uiLanguage,
  ]);

  return (
    <Modal
      visible={visible}
      animationType={modalAnimationType}
      presentationStyle="overFullScreen"
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        <View
          style={styles.editorArea}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setContainerSize({ width, height });
          }}
        >
          {imageUri && displayMetrics && cropRect ? (
            <View style={styles.absoluteFill}>
              <Image
                source={{ uri: imageUri }}
                style={
                  isFixedCropShape && circleImageFrame
                    ? [styles.absoluteImage, circleImageFrame]
                    : [
                        styles.absoluteImage,
                        {
                          left: displayMetrics.left,
                          top: displayMetrics.top,
                          width: displayMetrics.width,
                          height: displayMetrics.height,
                        },
                      ]
                }
                resizeMode="contain"
              />

              {isFixedCropShape ? (
                <View pointerEvents="none" style={styles.absoluteFill}>
                  <Svg width="100%" height="100%">
                    <Path
                      d={
                        cropShape === 'circle'
                          ? `M 0 0 H ${containerSize.width} V ${containerSize.height} H 0 Z M ${cropRect.x + cropRect.width / 2} ${cropRect.y + cropRect.height / 2} m -${cropRect.width / 2} 0 a ${cropRect.width / 2} ${cropRect.height / 2} 0 1 0 ${cropRect.width} 0 a ${cropRect.width / 2} ${cropRect.height / 2} 0 1 0 -${cropRect.width} 0`
                          : `M 0 0 H ${containerSize.width} V ${containerSize.height} H 0 Z M ${createRoundedRectPath(
                              cropRect.x,
                              cropRect.y,
                              cropRect.width,
                              cropRect.height,
                              ALBUM_CROP_RADIUS
                            )}`
                      }
                      fill="rgba(8, 12, 20, 0.58)"
                      fillRule="evenodd"
                    />
                  </Svg>
                </View>
              ) : (
                <>
                  <View
                    style={[
                      styles.mask,
                      {
                        left: 0,
                        top: 0,
                        width: containerSize.width,
                        height: cropRect.y,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.mask,
                      {
                        left: 0,
                        top: cropRect.y + cropRect.height,
                        width: containerSize.width,
                        height: Math.max(
                          0,
                          containerSize.height - (cropRect.y + cropRect.height)
                        ),
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.mask,
                      {
                        left: 0,
                        top: cropRect.y,
                        width: cropRect.x,
                        height: cropRect.height,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.mask,
                      {
                        left: cropRect.x + cropRect.width,
                        top: cropRect.y,
                        width: Math.max(
                          0,
                          containerSize.width - (cropRect.x + cropRect.width)
                        ),
                        height: cropRect.height,
                      },
                    ]}
                  />
                </>
              )}

              <View
                style={[
                  styles.cropRect,
                  cropShape === 'circle' ? styles.cropRectCircle : null,
                  cropShape === 'album' ? styles.cropRectAlbum : null,
                  cropRectStyle,
                ]}
              />
              {cropShape === 'album' ? (
                <View
                  pointerEvents="none"
                  style={[styles.albumCropSilhouette, cropRectStyle]}
                >
                  <View style={styles.albumCropNameBand} />
                </View>
              ) : (
                <View
                  pointerEvents="none"
                  style={[styles.cropGuide, cropRectStyle]}
                >
                  <View
                    style={[
                      styles.cropGuideCornerHorizontal,
                      styles.cropGuideTopLeftHorizontal,
                    ]}
                  />
                  <View
                    style={[
                      styles.cropGuideCornerVertical,
                      styles.cropGuideTopLeftVertical,
                    ]}
                  />
                  <View
                    style={[
                      styles.cropGuideCornerHorizontal,
                      styles.cropGuideTopRightHorizontal,
                    ]}
                  />
                  <View
                    style={[
                      styles.cropGuideCornerVertical,
                      styles.cropGuideTopRightVertical,
                    ]}
                  />
                  <View
                    style={[
                      styles.cropGuideCornerHorizontal,
                      styles.cropGuideBottomRightHorizontal,
                    ]}
                  />
                  <View
                    style={[
                      styles.cropGuideCornerVertical,
                      styles.cropGuideBottomRightVertical,
                    ]}
                  />
                  <View
                    style={[
                      styles.cropGuideCornerHorizontal,
                      styles.cropGuideBottomLeftHorizontal,
                    ]}
                  />
                  <View
                    style={[
                      styles.cropGuideCornerVertical,
                      styles.cropGuideBottomLeftVertical,
                    ]}
                  />
                </View>
              )}

              {isFixedCropShape && fixedCropGesture ? (
                <GestureDetector gesture={fixedCropGesture}>
                  <View
                    style={[
                      styles.moveHitbox,
                      cropShape === 'circle' ? styles.moveHitboxCircle : null,
                      cropShape === 'album' ? styles.moveHitboxAlbum : null,
                      cropRectStyle,
                    ]}
                  />
                </GestureDetector>
              ) : (
                <View
                  style={[
                    styles.moveHitbox,
                    {
                      left: cropRect.x + MOVE_HITBOX_INSET,
                      top: cropRect.y + MOVE_HITBOX_INSET,
                      width: Math.max(
                        0,
                        cropRect.width - MOVE_HITBOX_INSET * 2
                      ),
                      height: Math.max(
                        0,
                        cropRect.height - MOVE_HITBOX_INSET * 2
                      ),
                    },
                  ]}
                  {...moveRectResponder.panHandlers}
                />
              )}

              {isFixedCropShape ? null : (
                <>
                  <View
                    style={[
                      styles.edgeHitboxHorizontal,
                      {
                        left: cropRect.x + HANDLE_HITBOX_SIZE / 2,
                        top: cropRect.y - EDGE_HITBOX_SIZE / 2,
                        width: Math.max(0, cropRect.width - HANDLE_HITBOX_SIZE),
                      },
                    ]}
                    {...topEdgeResponder.panHandlers}
                  />
                  <View
                    style={[
                      styles.edgeHitboxVertical,
                      {
                        left:
                          cropRect.x + cropRect.width - EDGE_HITBOX_SIZE / 2,
                        top: cropRect.y + HANDLE_HITBOX_SIZE / 2,
                        height: Math.max(
                          0,
                          cropRect.height - HANDLE_HITBOX_SIZE
                        ),
                      },
                    ]}
                    {...rightEdgeResponder.panHandlers}
                  />
                  <View
                    style={[
                      styles.edgeHitboxHorizontal,
                      {
                        left: cropRect.x + HANDLE_HITBOX_SIZE / 2,
                        top:
                          cropRect.y + cropRect.height - EDGE_HITBOX_SIZE / 2,
                        width: Math.max(0, cropRect.width - HANDLE_HITBOX_SIZE),
                      },
                    ]}
                    {...bottomEdgeResponder.panHandlers}
                  />
                  <View
                    style={[
                      styles.edgeHitboxVertical,
                      {
                        left: cropRect.x - EDGE_HITBOX_SIZE / 2,
                        top: cropRect.y + HANDLE_HITBOX_SIZE / 2,
                        height: Math.max(
                          0,
                          cropRect.height - HANDLE_HITBOX_SIZE
                        ),
                      },
                    ]}
                    {...leftEdgeResponder.panHandlers}
                  />

                  <View
                    style={[
                      styles.cornerHitbox,
                      {
                        left: cropRect.x - HANDLE_HITBOX_SIZE / 2,
                        top: cropRect.y - HANDLE_HITBOX_SIZE / 2,
                      },
                    ]}
                    {...topLeftResponder.panHandlers}
                  >
                    <View style={styles.cornerHandle} />
                  </View>
                  <View
                    style={[
                      styles.cornerHitbox,
                      {
                        left:
                          cropRect.x + cropRect.width - HANDLE_HITBOX_SIZE / 2,
                        top: cropRect.y - HANDLE_HITBOX_SIZE / 2,
                      },
                    ]}
                    {...topRightResponder.panHandlers}
                  >
                    <View style={styles.cornerHandle} />
                  </View>
                  <View
                    style={[
                      styles.cornerHitbox,
                      {
                        left:
                          cropRect.x + cropRect.width - HANDLE_HITBOX_SIZE / 2,
                        top:
                          cropRect.y + cropRect.height - HANDLE_HITBOX_SIZE / 2,
                      },
                    ]}
                    {...bottomRightResponder.panHandlers}
                  >
                    <View style={styles.cornerHandle} />
                  </View>
                  <View
                    style={[
                      styles.cornerHitbox,
                      {
                        left: cropRect.x - HANDLE_HITBOX_SIZE / 2,
                        top:
                          cropRect.y + cropRect.height - HANDLE_HITBOX_SIZE / 2,
                      },
                    ]}
                    {...bottomLeftResponder.panHandlers}
                  >
                    <View style={styles.cornerHandle} />
                  </View>
                </>
              )}
            </View>
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          )}
        </View>

        <View style={[styles.headerOverlay, { paddingTop: insets.top + 12 }]}>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.headerChip,
              pressed && !processing ? styles.pressableChipPressed : null,
            ]}
            disabled={processing}
          >
            <Text style={styles.cancelText}>
              {tUI(uiLanguage, 'common.cancel')}
            </Text>
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.title}>{tUI(uiLanguage, 'cropper.title')}</Text>
            {isFixedCropShape ? (
              <Text style={styles.helperText}>
                {tUI(uiLanguage, 'cropper.helper')}
              </Text>
            ) : null}
          </View>
          <View style={styles.confirmTutorialTarget}>
            {showConfirmTutorialArrow && !processing ? (
              <MovingTutorialArrow
                direction="right"
                color="#4EAFF4"
                size={28}
                style={styles.confirmTutorialArrow}
              />
            ) : null}
            <Pressable
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.headerChip,
                pressed && !processing && cropRect
                  ? styles.pressableChipPressed
                  : null,
              ]}
              disabled={processing || !cropRect}
            >
              <Text style={styles.confirmText}>
                {processing
                  ? tUI(uiLanguage, 'cropper.processing')
                  : tUI(uiLanguage, 'common.done')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 30,
    elevation: 30,
  },
  headerChip: {
    minWidth: 64,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(12, 18, 30, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTutorialTarget: {
    position: 'relative',
  },
  confirmTutorialArrow: {
    position: 'absolute',
    right: '100%',
    marginRight: 10,
    top: -9,
  },
  pressableChipPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  headerTitleWrap: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  cancelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  helperText: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '600',
  },
  editorArea: {
    flex: 1,
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
  absoluteImage: {
    position: 'absolute',
  },
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(8, 12, 20, 0.58)',
  },
  cropRect: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.82)',
    backgroundColor: 'transparent',
  },
  cropRectCircle: {
    borderRadius: 999,
  },
  cropRectAlbum: {
    borderRadius: ALBUM_CROP_RADIUS,
  },
  albumCropSilhouette: {
    position: 'absolute',
    borderRadius: ALBUM_CROP_RADIUS,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
    zIndex: 18,
    elevation: 18,
  },
  albumCropNameBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '22%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.46)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  cropGuide: {
    position: 'absolute',
    zIndex: 18,
    elevation: 18,
  },
  cropGuideCornerHorizontal: {
    position: 'absolute',
    width: CROP_GUIDE_CORNER_LENGTH,
    height: CROP_GUIDE_CORNER_THICKNESS,
    backgroundColor: '#FFFFFF',
  },
  cropGuideCornerVertical: {
    position: 'absolute',
    width: CROP_GUIDE_CORNER_THICKNESS,
    height: CROP_GUIDE_CORNER_LENGTH,
    backgroundColor: '#FFFFFF',
  },
  cropGuideTopLeftHorizontal: {
    top: -CROP_GUIDE_CORNER_THICKNESS / 2,
    left: -CROP_GUIDE_CORNER_THICKNESS / 2,
  },
  cropGuideTopLeftVertical: {
    top: -CROP_GUIDE_CORNER_THICKNESS / 2,
    left: -CROP_GUIDE_CORNER_THICKNESS / 2,
  },
  cropGuideTopRightHorizontal: {
    top: -CROP_GUIDE_CORNER_THICKNESS / 2,
    right: -CROP_GUIDE_CORNER_THICKNESS / 2,
  },
  cropGuideTopRightVertical: {
    top: -CROP_GUIDE_CORNER_THICKNESS / 2,
    right: -CROP_GUIDE_CORNER_THICKNESS / 2,
  },
  cropGuideBottomRightHorizontal: {
    bottom: -CROP_GUIDE_CORNER_THICKNESS / 2,
    right: -CROP_GUIDE_CORNER_THICKNESS / 2,
  },
  cropGuideBottomRightVertical: {
    bottom: -CROP_GUIDE_CORNER_THICKNESS / 2,
    right: -CROP_GUIDE_CORNER_THICKNESS / 2,
  },
  cropGuideBottomLeftHorizontal: {
    bottom: -CROP_GUIDE_CORNER_THICKNESS / 2,
    left: -CROP_GUIDE_CORNER_THICKNESS / 2,
  },
  cropGuideBottomLeftVertical: {
    bottom: -CROP_GUIDE_CORNER_THICKNESS / 2,
    left: -CROP_GUIDE_CORNER_THICKNESS / 2,
  },
  cornerHandle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
  },
  cornerHitbox: {
    position: 'absolute',
    width: HANDLE_HITBOX_SIZE,
    height: HANDLE_HITBOX_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  edgeHitboxHorizontal: {
    position: 'absolute',
    height: EDGE_HITBOX_SIZE,
    zIndex: 15,
    elevation: 15,
  },
  edgeHitboxVertical: {
    position: 'absolute',
    width: EDGE_HITBOX_SIZE,
    zIndex: 15,
    elevation: 15,
  },
  moveHitbox: {
    position: 'absolute',
    zIndex: 12,
    elevation: 12,
  },
  moveHitboxCircle: {
    borderRadius: 999,
  },
  moveHitboxAlbum: {
    borderRadius: ALBUM_CROP_RADIUS,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
