// src/components/ImageOCRViewer.tsx
// Tech Stack v1.5.0: Tap-to-Select OCR Interface
// 自動 OCR → 顯示可點擊文字框 → 用戶點擊選擇

import React, { useState, useEffect } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Text,
  ActivityIndicator,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { extractTextFromImage, OCRBlock } from '../services/ocr/ocrService';

interface Props {
  imageUri: string;
  onTextBlockSelect: (block: OCRBlock, index: number) => void;
  initialSelectedIndex?: number;
}

export default function ImageOCRViewer({ 
  imageUri, 
  onTextBlockSelect,
  initialSelectedIndex,
}: Props) {
  // State
  const [ocrBlocks, setOCRBlocks] = useState<OCRBlock[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(initialSelectedIndex ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);

  const screenWidth = Dimensions.get('window').width - 32; // 扣除 padding
  const imageHeight = 400; // 固定高度

  // 自動執行 OCR（符合 Tech Stack v1.5.0 第 145 行）
  useEffect(() => {
    performOCR();
  }, [imageUri]);

  /**
   * 執行本地 OCR
   */
  const performOCR = async () => {
    console.log('[ImageOCRViewer] Starting OCR for:', imageUri);
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await extractTextFromImage(imageUri);
      setOCRBlocks(result.blocks);
      
      console.log(`[ImageOCRViewer] ✅ OCR completed: ${result.blocks.length} blocks, ${result.processingTime}ms`);
      
      if (result.blocks.length === 0) {
        setError('圖片中未識別到文字');
      }
      
    } catch (err) {
      console.error('[ImageOCRViewer] ❌ OCR failed:', err);
      setError('OCR 處理失敗');
      Alert.alert('OCR 失敗', '無法識別圖片中的文字，請確認圖片清晰度');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 處理文字塊點擊（符合 Tech Stack v1.5.0 第 150 行）
   */
  const handleBlockPress = (block: OCRBlock, index: number) => {
    console.log(`[ImageOCRViewer] User selected block ${index}: "${block.text}"`);
    setSelectedIndex(index);
    onTextBlockSelect(block, index);
  };

  /**
   * 渲染 OCR 結果預覽列表
   */
  const renderTextBlocksList = () => {
    if (ocrBlocks.length === 0) return null;

    return (
      <View style={styles.blocksList}>
        <Text style={styles.blocksTitle}>✨ 識別到的文字（點擊圖片上的框選擇）：</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {ocrBlocks.map((block, index) => (
            <View
              key={block.id}
              style={[
                styles.blockChip,
                selectedIndex === index && styles.blockChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.blockChipText,
                  selectedIndex === index && styles.blockChipTextSelected,
                ]}
                numberOfLines={1}
              >
                {block.text}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 提示文字 */}
      <Text style={styles.instructions}>
        {isLoading
          ? '🔍 正在識別圖片中的文字...'
          : error
          ? `⚠️ ${error}`
          : `💡 已識別 ${ocrBlocks.length} 個文字區域，點擊任何區域來學習`}
      </Text>

      {/* 圖片 + SVG 覆蓋層 */}
      <View
        style={styles.imageContainer}
        onLayout={(e) => {
          setImageSize({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          });
        }}
      >
        {/* 底層：原始圖片 */}
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, { width: screenWidth, height: imageHeight }]}
          resizeMode="contain"
        />

        {/* Loading 覆蓋層 */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Google ML Kit 正在處理...</Text>
          </View>
        )}

        {/* SVG 覆蓋層：可點擊的文字框（符合 Tech Stack v1.5.0 第 150 行）*/}
        {!isLoading && !error && imageSize.width > 0 && (
          <Svg
            style={StyleSheet.absoluteFill}
            width={screenWidth}
            height={imageHeight}
          >
            {ocrBlocks.map((block, index) => (
              <Rect
                key={block.id}
                x={block.frame.x}
                y={block.frame.y}
                width={block.frame.width}
                height={block.frame.height}
                // 視覺狀態：未選中（綠色）→ 選中（橙色）
                fill={
                  selectedIndex === index
                    ? 'rgba(255, 152, 0, 0.35)' // 橙色高亮
                    : 'rgba(76, 175, 80, 0.2)'  // 綠色半透明
                }
                stroke={selectedIndex === index ? '#FF9800' : '#4CAF50'}
                strokeWidth={selectedIndex === index ? 3 : 2}
                onPress={() => handleBlockPress(block, index)}
              />
            ))}
          </Svg>
        )}
      </View>

      {/* 文字塊預覽列表 */}
      {renderTextBlocksList()}

      {/* Debug 信息（僅開發模式） */}
      {__DEV__ && !isLoading && (
        <Text style={styles.debugText}>
          🔧 Debug: {ocrBlocks.length} blocks | Selected: {selectedIndex ?? 'none'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  instructions: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  imageContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  image: {
    backgroundColor: '#fafafa',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  blocksList: {
    marginTop: 16,
    paddingHorizontal: 4,
  },
  blocksTitle: {
    fontSize: 13,
    color: '#555',
    marginBottom: 8,
    fontWeight: '600',
  },
  blockChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8f5e9',
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  blockChipSelected: {
    backgroundColor: '#fff3e0',
    borderColor: '#FF9800',
    borderWidth: 2,
  },
  blockChipText: {
    fontSize: 12,
    color: '#2e7d32',
    maxWidth: 120,
  },
  blockChipTextSelected: {
    color: '#e65100',
    fontWeight: '600',
  },
  debugText: {
    marginTop: 8,
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});
