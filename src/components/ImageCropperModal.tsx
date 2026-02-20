import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

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

type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';

type Props = {
  visible: boolean;
  imageUri: string | null;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
};

const MIN_EDGE = 60;
const HANDLE_SIZE = 24;
const HANDLE_HITBOX_SIZE = 44;

export default function ImageCropperModal({
  visible,
  imageUri,
  onCancel,
  onConfirm,
}: Props) {
  const [imageSize, setImageSize] = React.useState<Size | null>(null);
  const [containerSize, setContainerSize] = React.useState<Size>({ width: 0, height: 0 });
  const [cropRect, setCropRect] = React.useState<Rect | null>(null);
  const [processing, setProcessing] = React.useState(false);

  const cropRectRef = React.useRef<Rect | null>(null);
  const displayMetricsRef = React.useRef<{
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);

  React.useEffect(() => {
    if (!visible || !imageUri) return;

    Image.getSize(
      imageUri,
      (width, height) => setImageSize({ width, height }),
      () => {
        Alert.alert('錯誤', '無法讀取圖片尺寸');
        onCancel();
      }
    );
  }, [visible, imageUri, onCancel]);

  const displayMetrics = React.useMemo(() => {
    if (!imageSize || !containerSize.width || !containerSize.height) return null;
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

  React.useEffect(() => {
    if (!displayMetrics) return;
    setCropRect((prev) => {
      if (prev) return prev;
      const marginX = Math.max(16, displayMetrics.width * 0.1);
      const marginY = Math.max(16, displayMetrics.height * 0.1);
      return {
        x: marginX,
        y: marginY,
        width: Math.max(MIN_EDGE, displayMetrics.width - marginX * 2),
        height: Math.max(MIN_EDGE, displayMetrics.height - marginY * 2),
      };
    });
  }, [displayMetrics]);

  React.useEffect(() => {
    if (!visible) {
      setCropRect(null);
      setImageSize(null);
      setProcessing(false);
    }
  }, [visible]);

  React.useEffect(() => {
    cropRectRef.current = cropRect;
  }, [cropRect]);

  React.useEffect(() => {
    displayMetricsRef.current = displayMetrics;
  }, [displayMetrics]);

  const clamp = React.useCallback((value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max);
  }, []);

  const createHandleResponder = React.useCallback(
    (corner: CornerKey) => {
      let startRect: Rect | null = null;

      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          const rect = cropRectRef.current;
          if (!rect) return;
          startRect = rect;
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
            const x = clamp(startRect.x + dx, 0, right - MIN_EDGE);
            const y = clamp(startRect.y + dy, 0, bottom - MIN_EDGE);
            next = {
              x,
              y,
              width: right - x,
              height: bottom - y,
            };
          } else if (corner === 'topRight') {
            const newRight = clamp(right + dx, startRect.x + MIN_EDGE, metrics.width);
            const y = clamp(startRect.y + dy, 0, bottom - MIN_EDGE);
            next = {
              x: startRect.x,
              y,
              width: newRight - startRect.x,
              height: bottom - y,
            };
          } else if (corner === 'bottomRight') {
            const newRight = clamp(right + dx, startRect.x + MIN_EDGE, metrics.width);
            const newBottom = clamp(bottom + dy, startRect.y + MIN_EDGE, metrics.height);
            next = {
              x: startRect.x,
              y: startRect.y,
              width: newRight - startRect.x,
              height: newBottom - startRect.y,
            };
          } else {
            const x = clamp(startRect.x + dx, 0, right - MIN_EDGE);
            const newBottom = clamp(bottom + dy, startRect.y + MIN_EDGE, metrics.height);
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
    [clamp]
  );

  const topLeftResponder = React.useRef(createHandleResponder('topLeft')).current;
  const topRightResponder = React.useRef(createHandleResponder('topRight')).current;
  const bottomRightResponder = React.useRef(createHandleResponder('bottomRight')).current;
  const bottomLeftResponder = React.useRef(createHandleResponder('bottomLeft')).current;

  const handleConfirm = React.useCallback(async () => {
    if (!imageUri || !cropRect || !imageSize || !displayMetrics) return;

    try {
      setProcessing(true);
      const originX = Math.max(0, Math.round((cropRect.x / displayMetrics.width) * imageSize.width));
      const originY = Math.max(0, Math.round((cropRect.y / displayMetrics.height) * imageSize.height));
      const width = Math.max(1, Math.round((cropRect.width / displayMetrics.width) * imageSize.width));
      const height = Math.max(1, Math.round((cropRect.height / displayMetrics.height) * imageSize.height));

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ crop: { originX, originY, width, height } }],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );

      onConfirm(result.uri);
    } catch (error) {
      console.error('[ImageCropper] crop failed:', error);
      Alert.alert('裁切失敗', '請重試');
    } finally {
      setProcessing(false);
    }
  }, [cropRect, displayMetrics, imageSize, imageUri, onConfirm]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.headerButton} disabled={processing}>
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.title}>裁切圖片</Text>
          <TouchableOpacity onPress={handleConfirm} style={styles.headerButton} disabled={processing || !cropRect}>
            <Text style={styles.confirmText}>{processing ? '處理中...' : '完成'}</Text>
          </TouchableOpacity>
        </View>

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
                style={{
                  position: 'absolute',
                  left: displayMetrics.left,
                  top: displayMetrics.top,
                  width: displayMetrics.width,
                  height: displayMetrics.height,
                }}
                resizeMode="contain"
              />

              <View
                style={[
                  styles.mask,
                  {
                    left: displayMetrics.left,
                    top: displayMetrics.top,
                    width: displayMetrics.width,
                    height: cropRect.y,
                  },
                ]}
              />
              <View
                style={[
                  styles.mask,
                  {
                    left: displayMetrics.left,
                    top: displayMetrics.top + cropRect.y + cropRect.height,
                    width: displayMetrics.width,
                    height: Math.max(0, displayMetrics.height - (cropRect.y + cropRect.height)),
                  },
                ]}
              />
              <View
                style={[
                  styles.mask,
                  {
                    left: displayMetrics.left,
                    top: displayMetrics.top + cropRect.y,
                    width: cropRect.x,
                    height: cropRect.height,
                  },
                ]}
              />
              <View
                style={[
                  styles.mask,
                  {
                    left: displayMetrics.left + cropRect.x + cropRect.width,
                    top: displayMetrics.top + cropRect.y,
                    width: Math.max(0, displayMetrics.width - (cropRect.x + cropRect.width)),
                    height: cropRect.height,
                  },
                ]}
              />

              <View
                style={[
                  styles.cropRect,
                  {
                    left: displayMetrics.left + cropRect.x,
                    top: displayMetrics.top + cropRect.y,
                    width: cropRect.width,
                    height: cropRect.height,
                  },
                ]}
              />

              <View
                style={[
                  styles.cornerHitbox,
                  {
                    left: displayMetrics.left + cropRect.x - HANDLE_HITBOX_SIZE / 2,
                    top: displayMetrics.top + cropRect.y - HANDLE_HITBOX_SIZE / 2,
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
                    left: displayMetrics.left + cropRect.x + cropRect.width - HANDLE_HITBOX_SIZE / 2,
                    top: displayMetrics.top + cropRect.y - HANDLE_HITBOX_SIZE / 2,
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
                    left: displayMetrics.left + cropRect.x + cropRect.width - HANDLE_HITBOX_SIZE / 2,
                    top: displayMetrics.top + cropRect.y + cropRect.height - HANDLE_HITBOX_SIZE / 2,
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
                    left: displayMetrics.left + cropRect.x - HANDLE_HITBOX_SIZE / 2,
                    top: displayMetrics.top + cropRect.y + cropRect.height - HANDLE_HITBOX_SIZE / 2,
                  },
                ]}
                {...bottomLeftResponder.panHandlers}
              >
                <View style={styles.cornerHandle} />
              </View>
            </View>
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4CAF50" />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1b1b1b',
  },
  headerButton: {
    minWidth: 56,
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmText: {
    color: '#80e27e',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  editorArea: {
    flex: 1,
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  cropRect: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#7CFF7A',
    backgroundColor: 'transparent',
  },
  cornerHandle: {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: '#7CFF7A',
    borderWidth: 2,
    borderColor: '#ffffff',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
