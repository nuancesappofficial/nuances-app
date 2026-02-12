// src/services/ocr/ocrService.ts
// OCR Service - 包含座標自動修正功能

import { isOpenAIConfigured, callOpenAI } from '../ai/openaiService';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

// ------------------------------------------------------------------
// Interfaces
// ------------------------------------------------------------------

export interface OCRResult {
  fullText: string;
  confidence?: number;
}

export interface BoundingBox {
  x: number;      // 0-1 (相對位置)
  y: number;      // 0-1
  width: number;  // 0-1
  height: number; // 0-1
}

export interface Size {
  width: number;
  height: number;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * 獲取圖片原始尺寸
 */
const getImageDimensions = async (uri: string): Promise<Size> => {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
};

/**
 * ★ 核心修復：將螢幕上的框 (Container Coords) 轉換為 圖片上的框 (Image Coords)
 * 解決 resizeMode="contain" 導致的座標偏移問題
 */
function fixCoordinates(
  box: BoundingBox,
  containerSize: Size,
  imageSize: Size
): ImageManipulator.ActionCrop['crop'] {
  // 1. 計算圖片在螢幕上的實際顯示尺寸 (等比縮放)
  const scale = Math.min(
    containerSize.width / imageSize.width,
    containerSize.height / imageSize.height
  );

  const displayedWidth = imageSize.width * scale;
  const displayedHeight = imageSize.height * scale;

  // 2. 計算黑邊 (Offset)
  const offsetX = (containerSize.width - displayedWidth) / 2;
  const offsetY = (containerSize.height - displayedHeight) / 2;

  console.log('[OCR Coord] Display Scale:', scale);
  console.log('[OCR Coord] Offsets (Black Bars):', { offsetX, offsetY });

  // 3. 將相對座標 (0-1) 還原為 螢幕像素座標 (0-402, 0-642)
  const screenPx = {
    x: box.x * containerSize.width,
    y: box.y * containerSize.height,
    w: box.width * containerSize.width,
    h: box.height * containerSize.height,
  };

  // 4. 扣除黑邊，並除以縮放比例，找回原始圖片像素
  // 這裡使用 Math.max/min 確保不會切出圖片範圍
  const imageOriginX = Math.max(0, (screenPx.x - offsetX) / scale);
  const imageOriginY = Math.max(0, (screenPx.y - offsetY) / scale);
  
  // 計算寬高 (注意：如果畫框超出圖片範圍，這裡會自動修正)
  const imageWidthRaw = screenPx.w / scale;
  const imageHeightRaw = screenPx.h / scale;

  // 確保最終裁切區域不超出原始圖片邊界
  const finalOriginX = Math.min(imageOriginX, imageSize.width);
  const finalOriginY = Math.min(imageOriginY, imageSize.height);
  const finalWidth = Math.min(imageWidthRaw, imageSize.width - finalOriginX);
  const finalHeight = Math.min(imageHeightRaw, imageSize.height - finalOriginY);

  return {
    originX: finalOriginX,
    originY: finalOriginY,
    width: finalWidth,
    height: finalHeight,
  };
}

// ------------------------------------------------------------------
// Core Functions
// ------------------------------------------------------------------

/**
 * 提取圖片中特定區域的文字 (已修復座標問題)
 * * @param imageUri 圖片路徑
 * @param boundingBox 標註框 (0-1)
 * @param containerSize (選填，強烈建議傳入) 螢幕顯示容器的尺寸 {width: 402, height: 642}
 */
export async function extractTextFromRegion(
  imageUri: string,
  boundingBox: BoundingBox,
  containerSize?: Size 
): Promise<string> {
  console.log('[OCR Region] Starting extraction...');
  console.log('[OCR Region] Input Box:', JSON.stringify(boundingBox));

  if (!isOpenAIConfigured()) {
    console.warn('[OCR] No OpenAI config, using mock');
    return 'Sample text';
  }

  try {
    // 1. 獲取原始圖片尺寸
    const imgDims = await getImageDimensions(imageUri);
    console.log('[OCR Region] Original Image Size:', imgDims);

    let cropRegion: ImageManipulator.ActionCrop['crop'];

    // 2. 計算裁切區域
    if (containerSize) {
      // 如果有傳入容器尺寸，使用智能修正算法
      console.log('[OCR Region] Using Smart Coordinate Correction with container:', containerSize);
      cropRegion = fixCoordinates(boundingBox, containerSize, imgDims);
    } else {
      // 舊邏輯 (假設沒有黑邊，直接乘百分比)
      // 如果你的圖片是 cover 滿版，或你已經自己算過座標，會走這裡
      console.warn('[OCR Region] No containerSize provided. Assuming coordinates map directly to image.');
      cropRegion = {
        originX: boundingBox.x * imgDims.width,
        originY: boundingBox.y * imgDims.height,
        width: boundingBox.width * imgDims.width,
        height: boundingBox.height * imgDims.height,
      };
    }

    console.log('[OCR Region] Final Crop Region (Pixels):', JSON.stringify(cropRegion));

    // 防呆：如果裁切區域無效 (例如寬度為 0)
    if (cropRegion.width <= 0 || cropRegion.height <= 0) {
      console.error('[OCR Region] Invalid crop region calculated. User might have drawn on black bars.');
      return '';
    }

    // 3. 執行裁切 (Crop)
    const manipulatedResult = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ crop: cropRegion }],
      { base64: true, compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );

    // 4. 發送給 AI
    const response = await callOpenAI(
      [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Read the text in this image exactly as it appears. Return ONLY a JSON object:
{
  "fullText": "extracted text"
}
If cut off, complete based on context. If empty, return empty string.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${manipulatedResult.base64}`,
              },
            },
          ],
        },
      ],
      { model: 'gpt-4o-mini', temperature: 0.1, maxTokens: 300 }
    );

    const result = JSON.parse(response.replace(/^```json|```$/g, '').trim());
    console.log('[OCR Region] ✅ Extracted text:', result.fullText);
    
    return result.fullText || '';

  } catch (error) {
    console.error('[OCR Region] ❌ Error:', error);
    return '';
  }
}

/**
 * 批量提取多個標註區域的文字
 * @param imageUri 圖片路徑
 * @param annotations 標註列表
 * @param containerSize 容器尺寸（用於座標修正）
 */
export async function extractTextFromAnnotations(
  imageUri: string,
  annotations: Array<BoundingBox & { id: string }>,
  containerSize?: Size
): Promise<Array<{ id: string; text: string }>> {
  console.log(`[OCR] Extracting text from ${annotations.length} annotations`);
  if (containerSize) {
    console.log('[OCR] Using containerSize for coordinate correction:', containerSize);
  }

  const results = await Promise.all(
    annotations.map(async (annotation) => {
      const text = await extractTextFromRegion(imageUri, annotation, containerSize);
      return {
        id: annotation.id,
        text,
      };
    })
  );

  return results;
}

// ------------------------------------------------------------------
// Legacy Support / Other Exports
// ------------------------------------------------------------------

export async function extractTextFromImage(imageUri: string): Promise<OCRResult> {
  console.log('[OCR] Extracting text from full image:', imageUri);

  if (!isOpenAIConfigured()) {
    console.warn('[OCR] OpenAI not configured, using mock OCR');
    return mockOCR();
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: 'base64',
    });

    const response = await callOpenAI(
      [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract ALL text from this image. Return ONLY a JSON object:
{
  "fullText": "all text extracted from the image",
  "confidence": 0.95
}

Extract text in its original language. Include ALL visible text.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
              },
            },
          ],
        },
      ],
      {
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 1000,
      }
    );

    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const result = JSON.parse(cleanedResponse);
    return {
      fullText: result.fullText || '',
      confidence: result.confidence || 0.9,
    };
  } catch (error) {
    console.error('[OCR] Error extracting text:', error);
    return mockOCR();
  }
}

export function isOCRAvailable(): boolean {
  return isOpenAIConfigured();
}

function mockOCR(): OCRResult {
  return {
    fullText: 'This is a sample text extracted from the image.',
    confidence: 0.85,
  };
}