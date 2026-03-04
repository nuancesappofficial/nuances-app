// src/components/ImageOCRViewer.tsx
// Tech Stack v1.5.0: Tap-to-Select OCR Interface
// 自動 OCR → 顯示可點擊文字框 → 用戶點擊選擇

import React from 'react';
import {
  View,
  Image,
  StyleSheet,
  Text,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import LocalAiKeywordSuggestions from './LocalAiKeywordSuggestions';
import { extractTextFromImage, OCRBlock } from '../services/ocr/ocrService';

interface Props {
  imageUri: string;
  onSelectionChange: (selectedIndexes: number[], blocks: OCRBlock[]) => void;
  onOCRComplete?: (blocks: OCRBlock[]) => void;
  initialSelectedIndexes?: number[];
  learningGoal?: 'ielts' | 'casual' | 'professional';
  keywords: string;
  onKeywordsChange: (nextKeywords: string) => void;
}

const CONTAINER_WIDTH = Dimensions.get('window').width - 32;
const CONTAINER_HEIGHT = 400;

function parseKeywordsInput(raw: string): string[] {
  if (!raw.trim()) return [];
  return Array.from(
    new Map(
      raw
        .split(/[,\u3001\n]+/)
        .map((term) => term.trim())
        .filter(Boolean)
        .map((term) => [term.toLowerCase(), term])
    ).values()
  );
}

function areEqualIndexes(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export default function ImageOCRViewer({ 
  imageUri, 
  onSelectionChange,
  onOCRComplete,
  initialSelectedIndexes,
  learningGoal,
  keywords,
  onKeywordsChange,
}: Props) {
  void learningGoal;
  // State
  const [ocrBlocks, setOCRBlocks] = React.useState<OCRBlock[]>([]);
  const [selectedIndexes, setSelectedIndexes] = React.useState<number[]>(
    initialSelectedIndexes ?? []
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [containerLayout, setContainerLayout] = React.useState({ width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT });
  const [originalImageSize, setOriginalImageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // 取得原始圖片尺寸（用於座標縮放）
  React.useEffect(() => {
    if (!imageUri) return;
    Image.getSize(
      imageUri,
      (width, height) => setOriginalImageSize({ width, height }),
      () => setOriginalImageSize(null)
    );
  }, [imageUri]);

  // 自動執行 OCR（符合 Tech Stack v1.5.0 第 145 行）
  React.useEffect(() => {
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
      } else {
        const initial =
          (initialSelectedIndexes ?? []).length > 0
            ? (initialSelectedIndexes ?? [])
                .filter((index) => Number.isInteger(index) && index >= 0 && index < result.blocks.length)
                .sort((a, b) => a - b)
            : [];
        setSelectedIndexes(initial);
        // 通知父組件 OCR 完成
        onOCRComplete?.(result.blocks);
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
  const handleBlockPress = (index: number) => {
    setSelectedIndexes((prev) => {
      const next = prev.includes(index)
        ? prev.filter((value) => value !== index)
        : [...prev, index].sort((a, b) => a - b);
      const block = ocrBlocks[index];
      console.log('[ImageOCRViewer] Toggle block selection:', {
        index,
        text: block?.text,
        selectedCount: next.length,
      });
      return next;
    });
  };

  React.useEffect(() => {
    if (ocrBlocks.length === 0) return;
    onSelectionChange(selectedIndexes, ocrBlocks);
  }, [ocrBlocks, onSelectionChange, selectedIndexes]);

  React.useEffect(() => {
    if (ocrBlocks.length === 0) return;
    const keywordSet = new Set(parseKeywordsInput(keywords).map((term) => term.toLowerCase()));
    const nextIndexes = ocrBlocks
      .map((block, index) => ({
        index,
        normalized: block.text.trim().toLowerCase(),
      }))
      .filter((item) => item.normalized && keywordSet.has(item.normalized))
      .map((item) => item.index);

    setSelectedIndexes((prev) => (areEqualIndexes(prev, nextIndexes) ? prev : nextIndexes));
  }, [keywords, ocrBlocks]);

  /**
   * 渲染 OCR 結果預覽列表
   */
  const renderTextBlocksList = () => {
    if (ocrBlocks.length === 0) return null;

    return (
      <View style={styles.blocksList}>
        <Text style={styles.blocksTitle}>✨ 識別到的單字（點擊選擇）：</Text>
        <View style={styles.blocksGrid}>
          {ocrBlocks.map((block, index) => (
            <TouchableOpacity
              key={block.id}
              style={[
                styles.blockChip,
                selectedIndexes.includes(index) && styles.blockChipSelected,
              ]}
              onPress={() => handleBlockPress(index)}
            >
              <Text
                style={[
                  styles.blockChipText,
                  selectedIndexes.includes(index) && styles.blockChipTextSelected,
                ]}
                numberOfLines={1}
              >
                {block.text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* 提示文字 */}
      <Text style={styles.instructions}>
        {isLoading
          ? '🔍 正在識別圖片中的文字...'
          : error
          ? `⚠️ ${error}`
          : `💡 已識別 ${ocrBlocks.length} 個單字，已選 ${selectedIndexes.length} 個`}
      </Text>

      {/* 圖片 + SVG 覆蓋層 */}
      <View
        style={styles.imageContainer}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setContainerLayout({ width, height });
        }}
      >
        {/* 底層：原始圖片 */}
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, { width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT }]}
          resizeMode="contain"
        />

        {/* Loading 覆蓋層 */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Apple Vision 正在處理...</Text>
          </View>
        )}

        {/* SVG 覆蓋層：座標依「原始圖 → 顯示區」縮放對齊（resizeMode=contain）*/}
        {!isLoading && !error && originalImageSize && containerLayout.width > 0 && (
          <Svg
            style={StyleSheet.absoluteFill}
            width={containerLayout.width}
            height={containerLayout.height}
          >
            {(() => {
              const { width: origW, height: origH } = originalImageSize;
              const cw = containerLayout.width;
              const ch = containerLayout.height;
              const scale = Math.min(cw / origW, ch / origH);
              const offsetX = (cw - origW * scale) / 2;
              const offsetY = (ch - origH * scale) / 2;
              return ocrBlocks.map((block, index) => (
                <Rect
                  key={block.id}
                  x={block.frame.x * scale + offsetX}
                  y={block.frame.y * scale + offsetY}
                  width={block.frame.width * scale}
                  height={block.frame.height * scale}
                  fill={
                    selectedIndexes.includes(index)
                      ? 'rgba(255, 152, 0, 0.35)'
                      : 'rgba(76, 175, 80, 0.2)'
                  }
                  stroke={selectedIndexes.includes(index) ? '#FF9800' : '#4CAF50'}
                  strokeWidth={selectedIndexes.includes(index) ? 3 : 2}
                  onPress={() => handleBlockPress(index)}
                />
              ));
            })()}
          </Svg>
        )}
      </View>

      {!isLoading && !error && (
        <View style={styles.suggestionContainer}>
          <LocalAiKeywordSuggestions
            keywords={keywords}
            sourceText={ocrBlocks.map((block) => block.text?.trim() || '').filter(Boolean).join(' ')}
            onKeywordsChange={onKeywordsChange}
          />
        </View>
      )}

      {/* 文字塊預覽列表 */}
      {renderTextBlocksList()}

      {/* Debug 信息（僅開發模式） */}
      {__DEV__ && !isLoading && (
        <Text style={styles.debugText}>
          🔧 Debug: {ocrBlocks.length} words | Selected: {selectedIndexes.join(',') || 'none'}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 16,
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
  suggestionContainer: {
    marginTop: 4,
    paddingHorizontal: 4,
  },
  blocksTitle: {
    fontSize: 13,
    color: '#555',
    marginBottom: 8,
    fontWeight: '600',
  },
  blocksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  blockChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8f5e9',
    borderRadius: 16,
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
