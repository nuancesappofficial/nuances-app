import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Image,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  Text,
  Alert,
  PanResponderInstance,
} from 'react-native';

export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

interface Props {
  imageUri: string;
  onAnnotationsChange: (boxes: BoundingBox[]) => void;
  initialAnnotations?: BoundingBox[];
  onOCRPreview?: (text: string) => void; // 新增：OCR 預覽回調
}

export default function ImageAnnotation({
  imageUri,
  onAnnotationsChange,
  initialAnnotations = [],
  onOCRPreview,
}: Props) {
  // --- State ---
  const [annotations, setAnnotations] = useState<BoundingBox[]>(initialAnnotations);
  const [currentBox, setCurrentBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [ocrPreviewText, setOCRPreviewText] = useState<string>(''); // OCR 預覽
  const [isOCRProcessing, setIsOCRProcessing] = useState(false); // OCR 處理中
  
  // 用於 Debug 顯示觸控狀態
  const [debugTouch, setDebugTouch] = useState({ x: 0, y: 0, state: 'IDLE' });

  // --- Refs (解決閉包問題的核心) ---
  const isDrawingRef = useRef(isDrawing);
  const containerSizeRef = useRef(containerSize);
  const startPosRef = useRef({ x: 0, y: 0 });

  // 同步 State 到 Ref
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);
  useEffect(() => { containerSizeRef.current = containerSize; }, [containerSize]);

  // --- PanResponder ---
  const panResponder = useRef<PanResponderInstance>(
    PanResponder.create({
      // 只有在 drawing 模式下才攔截
      onStartShouldSetPanResponder: () => isDrawingRef.current,
      onMoveShouldSetPanResponder: () => isDrawingRef.current,

      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        startPosRef.current = { x: locationX, y: locationY };
        
        // Debug 更新
        setDebugTouch({ x: locationX, y: locationY, state: 'START' });

        setCurrentBox({
          startX: locationX,
          startY: locationY,
          currentX: locationX,
          currentY: locationY,
        });
      },

      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const { x: startX, y: startY } = startPosRef.current;

        // Debug 更新
        setDebugTouch({ x: locationX, y: locationY, state: 'MOVING' });

        setCurrentBox({
          startX: startX, // 保持起點不變
          startY: startY,
          currentX: locationX,
          currentY: locationY,
        });
      },

      onPanResponderRelease: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const { x: startX, y: startY } = startPosRef.current;
        const { width: cWidth, height: cHeight } = containerSizeRef.current;

        setDebugTouch({ x: locationX, y: locationY, state: 'RELEASE' });

        if (cWidth === 0 || cHeight === 0) {
          console.warn('[ImageAnnotation] Container size is 0!');
          setCurrentBox(null);
          return;
        }

        const absWidth = Math.abs(locationX - startX);
        const absHeight = Math.abs(locationY - startY);

        // 防誤觸 (移動小於 5px 忽略)
        if (absWidth < 5 || absHeight < 5) {
          setCurrentBox(null);
          return;
        }

        const relativeBox: BoundingBox = {
          id: Date.now().toString(),
          x: Math.min(startX, locationX) / cWidth,
          y: Math.min(startY, locationY) / cHeight,
          width: absWidth / cWidth,
          height: absHeight / cHeight,
        };

        if (relativeBox.width > 0.01 && relativeBox.height > 0.01) {
          const newAnnotations = [...annotations, relativeBox];
          setAnnotations(newAnnotations);
          
          // 使用 setTimeout 避免在 render 中更新父組件
          setTimeout(async () => {
            onAnnotationsChange(newAnnotations);
            console.log('[ImageAnnotation] Total annotations:', newAnnotations.length);
            
            // 立即觸發 OCR 預覽（如果提供了回調）
            // 傳遞最新的標註 (relativeBox)，只 OCR 這個區域
            if (onOCRPreview) {
              await performQuickOCR(imageUri, relativeBox);
            }
          }, 0);
        }
        setCurrentBox(null);
      },

      onPanResponderTerminate: () => {
        setDebugTouch(prev => ({ ...prev, state: 'TERMINATED' }));
        setCurrentBox(null);
      },
    })
  ).current;

  // --- 刪除與清除 ---
  const deleteAnnotation = (id: string) => {
    const newAnnotations = annotations.filter((box) => box.id !== id);
    setAnnotations(newAnnotations);
    
    // 使用 setTimeout 避免更新衝突
    setTimeout(() => {
      onAnnotationsChange(newAnnotations);
    }, 0);
  };

  const clearAll = () => {
    setAnnotations([]);
    setOCRPreviewText('');
    
    // 使用 setTimeout 避免更新衝突
    setTimeout(() => {
      onAnnotationsChange([]);
    }, 0);
  };

  // --- 快速 OCR 預覽（標註後立即執行）---
  const performQuickOCR = async (uri: string, latestAnnotation: BoundingBox) => {
    setIsOCRProcessing(true);
    setOCRPreviewText('🔍 識別圈選區域中...');
    
    try {
      console.log('[ImageAnnotation] 🎯 Starting quick OCR for annotation:', latestAnnotation.id);
      console.log('[ImageAnnotation] Container size:', containerSize);
      
      // 使用 extractTextFromRegion 只識別圈選的區域
      const { extractTextFromRegion } = await import('../services/ocr');
      const regionText = await extractTextFromRegion(
        uri,
        {
          x: latestAnnotation.x,
          y: latestAnnotation.y,
          width: latestAnnotation.width,
          height: latestAnnotation.height,
        },
        containerSize // ← 傳入 Container 尺寸用於座標修正
      );
      
      console.log('[ImageAnnotation] ✅ Quick OCR result:', regionText);
      setOCRPreviewText(regionText || '未識別到文字');
      
      // 回傳給父組件（自動填入 Keywords）
      if (onOCRPreview && regionText) {
        onOCRPreview(regionText);
      }
    } catch (error) {
      console.error('[ImageAnnotation] ❌ Quick OCR failed:', error);
      setOCRPreviewText('識別失敗');
    } finally {
      setIsOCRProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. 工具列 */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.toolButton, isDrawing && styles.toolButtonActive]}
          onPress={() => setIsDrawing(!isDrawing)}
        >
          <Text style={[styles.toolButtonText, isDrawing && styles.toolButtonTextActive]}>
            {isDrawing ? '✏️ 標註中' : '✏️ 開始標註'}
          </Text>
        </TouchableOpacity>

        {annotations.length > 0 && (
          <TouchableOpacity style={[styles.toolButton, styles.toolButtonClear]} onPress={clearAll}>
            <Text style={styles.toolButtonText}>🗑️ 清除全部</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* OCR 預覽面板 */}
      {ocrPreviewText && (
        <View style={styles.ocrPreview}>
          {isOCRProcessing ? (
            <Text style={styles.ocrPreviewText}>🔍 識別中...</Text>
          ) : (
            <>
              <Text style={styles.ocrPreviewLabel}>📝 識別結果：</Text>
              <Text style={styles.ocrPreviewText} numberOfLines={2}>
                {ocrPreviewText}
              </Text>
            </>
          )}
        </View>
      )}

      {/* 2. 圖片容器 */}
      <View
        style={styles.imageContainer}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          console.log('[ImageAnnotation] Layout:', width, height);
          setContainerSize({ width, height });
        }}
      >
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="contain"
        />

        {/* 3. 標註覆蓋層 (Overlay) */}
        <View
          style={styles.annotationOverlay}
          {...panResponder.panHandlers}
          pointerEvents={isDrawing ? 'auto' : 'box-none'} // 關鍵：非繪圖模式讓點擊穿透
        >
          {/* 已完成標註 */}
          {containerSize.width > 0 && annotations.map((box, index) => (
            <View
              key={box.id}
              style={[
                styles.boundingBox,
                {
                  left: box.x * containerSize.width,
                  top: box.y * containerSize.height,
                  width: box.width * containerSize.width,
                  height: box.height * containerSize.height,
                }
              ]}
            >
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => deleteAnnotation(box.id)}
              >
                <Text style={styles.deleteButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* 正在繪製的框 */}
          {currentBox && isDrawing && (
            <View
              style={[
                styles.drawingBox,
                {
                  left: Math.min(currentBox.startX, currentBox.currentX),
                  top: Math.min(currentBox.startY, currentBox.currentY),
                  width: Math.abs(currentBox.currentX - currentBox.startX),
                  height: Math.abs(currentBox.currentY - currentBox.startY),
                },
              ]}
            />
          )}
        </View>

        {/* 4. 調試資訊面板 (放在這裡確保在圖片上方) */}
        <View style={styles.debugInfo}>
          <Text style={styles.debugText}>Drawing: {isDrawing ? 'YES' : 'NO'}</Text>
          <Text style={styles.debugText}>Annotations: {annotations.length}</Text>
          <Text style={styles.debugText}>
            Container: {Math.round(containerSize.width)} x {Math.round(containerSize.height)}
          </Text>
          <Text style={styles.debugText}>
            Touch: {Math.round(debugTouch.x)}, {Math.round(debugTouch.y)} ({debugTouch.state})
          </Text>
          <Text style={styles.debugText}>
            CurrentBox: {currentBox ? 'ACTIVE' : 'NULL'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  toolbar: {
    flexDirection: 'row', padding: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderColor: '#e0e0e0', gap: 8,
  },
  toolButton: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#4CAF50', backgroundColor: '#fff',
  },
  toolButtonActive: { backgroundColor: '#4CAF50' },
  toolButtonClear: { borderColor: '#F44336' },
  toolButtonText: { fontSize: 14, fontWeight: '600', color: '#4CAF50' },
  toolButtonTextActive: { color: '#fff' },
  
  imageContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#333', // 深色背景方便看邊界
  },
  image: { width: '100%', height: '100%' },
  
  annotationOverlay: {
    ...StyleSheet.absoluteFillObject, // 絕對定位撐滿
    zIndex: 10,
    elevation: 10,
  },
  
  boundingBox: {
    position: 'absolute',
    borderWidth: 2, borderColor: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.3)', // 加深顏色
    zIndex: 20,
  },
  
  drawingBox: {
    position: 'absolute',
    borderWidth: 2, borderColor: '#2196F3',
    backgroundColor: 'rgba(33, 150, 243, 0.3)', // 加深顏色
    zIndex: 20,
  },
  
  deleteButton: {
    position: 'absolute', top: -10, right: -10,
    backgroundColor: 'red', width: 20, height: 20,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  deleteButtonText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  
  // Debug 樣式
  debugInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fff',
    zIndex: 999, // 確保在最上層
  },
  debugText: {
    color: '#00FF00',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 2,
  },
  ocrPreview: {
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderBottomWidth: 1,
    borderBottomColor: '#2196F3',
  },
  ocrPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 4,
  },
  ocrPreviewText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
});
