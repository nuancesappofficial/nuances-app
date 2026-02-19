// src/services/ocr/ocrService.ts
// OCR Service - Tech Stack v1.5.0: Pure Text Strategy
// Uses Google ML Kit for 100% local text extraction
// NO images are uploaded to AI servers

import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import * as FileSystem from 'expo-file-system/legacy';
import { isOpenAIConfigured } from '../ai/openaiService';
import { callAIAction } from '../ai/edgeAiClient';

// ============================================================
// Interfaces
// ============================================================

/**
 * OCR 識別的單一文字塊
 */
export interface OCRBlock {
  id: string;
  text: string;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
}

/**
 * 完整的 OCR 結果
 */
export interface OCRResult {
  blocks: OCRBlock[];
  fullText: string;
  processingTime?: number;
}

/**
 * AI 分析的上下文數據（Tech Stack v1.5.0 第 146-150 行）
 */
export interface ContextPayload {
  target_text: string;      // 用戶選擇的文字
  context_text: string;     // 前後文字
  original_sentence: string; // 完整句子
}

/**
 * AI 分析結果
 */
export interface AIAnalysisResult {
  keyword: string;
  definition: string;
  example: string;
  tags: string[];
  pronunciation?: string;
}

// ============================================================
// Core Functions
// ============================================================

/**
 * 使用 Google ML Kit 進行本地 OCR
 * ⚠️ 重要：此函數 100% 在本地執行，不需要網路連接
 * 
 * @param imageUri - 圖片的本地 URI
 * @returns OCR 識別結果（包含文字塊和座標）
 */
export async function extractTextFromImage(imageUri: string): Promise<OCRResult> {
  console.log('[OCR] Starting ML Kit text recognition (LOCAL)...');
  const startTime = Date.now();
  
  try {
    // 驗證圖片路徑（避免傳空值或過期路徑到 native 導致閃退）
    if (!imageUri) {
      throw new Error('OCR failed: empty image URI');
    }
    
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      throw new Error(`OCR failed: image file not found (${imageUri})`);
    }
    
    // 調用 Google ML Kit（完全本地處理）
    // 使用 CHINESE 腳本以支援繁體中文、簡體中文識別
    const result = await TextRecognition.recognize(imageUri, TextRecognitionScript.CHINESE);
    
    console.log('[OCR] ML Kit raw result (Chinese script):', {
      blockCount: result.blocks?.length || 0,
      hasText: !!result.text,
    });
    
    // 以「單字 (word / element)」為單位收集（ML Kit: blocks → lines → elements）
    const blocks: OCRBlock[] = [];
    let globalIndex = 0;
    (result.blocks || []).forEach((block: any) => {
      (block.lines || []).forEach((line: any) => {
        (line.elements || []).forEach((element: any) => {
          const frame = element.frame || element.boundingBox || {};
          // ML Kit Frame 使用 left, top, width, height
          const left = frame.left ?? frame.x ?? 0;
          const top = frame.top ?? frame.y ?? 0;
          const width = frame.width ?? (frame.right != null && frame.left != null ? frame.right - frame.left : 0);
          const height = frame.height ?? (frame.bottom != null && frame.top != null ? frame.bottom - frame.top : 0);
          blocks.push({
            id: `word_${globalIndex}_${Date.now()}`,
            text: element.text ?? '',
            frame: { x: left, y: top, width, height },
            confidence: (element as any).confidence ?? 0.95,
          });
          globalIndex += 1;
        });
      });
    });

    const fullText = blocks.map(b => b.text).join(' ');
    const processingTime = Date.now() - startTime;
    
    console.log(`[OCR] ✅ Success: Found ${blocks.length} words in ${processingTime}ms`);
    console.log(`[OCR] Full text preview: "${fullText.substring(0, 100)}..."`);
    
    return { blocks, fullText, processingTime };
    
  } catch (error) {
    console.error('[OCR] ❌ Error during ML Kit recognition:', error);
    throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * 構建智能上下文（7 個單字：前 3 + 關鍵字 + 後 3）
 * 
 * 規則：
 * 1. 總共 7 個單字（前 3 + target + 後 3）
 * 2. 遇到標點符號（. , ! ? ; :）就停止
 * 
 * @param blocks - 所有 OCR 文字塊
 * @param selectedIndex - 用戶選擇的文字塊索引
 * @returns 包含目標文字和上下文的分析數據
 */
export function buildContextPayload(
  blocks: OCRBlock[], 
  selectedIndex: number
): ContextPayload {
  if (selectedIndex < 0 || selectedIndex >= blocks.length) {
    throw new Error(`Invalid block index: ${selectedIndex} (total blocks: ${blocks.length})`);
  }
  
  const targetText = blocks[selectedIndex].text;
  const punctuation = /[.,!?;:]/;
  
  // 收集前 3 個單字（遇標點就停）
  const prevWords: string[] = [];
  for (let i = selectedIndex - 1; i >= 0 && prevWords.length < 3; i--) {
    const word = blocks[i].text;
    if (punctuation.test(word)) break;
    prevWords.unshift(word);
  }
  
  // 收集後 3 個單字（遇標點就停）
  const nextWords: string[] = [];
  for (let i = selectedIndex + 1; i < blocks.length && nextWords.length < 3; i++) {
    const word = blocks[i].text;
    if (punctuation.test(word)) break;
    nextWords.push(word);
  }
  
  const contextText = `${prevWords.join(' ')} ${nextWords.join(' ')}`.trim();
  const originalSentence = `${prevWords.join(' ')} ${targetText} ${nextWords.join(' ')}`.trim();
  
  console.log('[OCR] Built context (7 words):', {
    target: targetText,
    prev: prevWords.length,
    next: nextWords.length,
    sentence: originalSentence,
  });
  
  return {
    target_text: targetText,
    context_text: contextText,
    original_sentence: originalSentence,
  };
}

/**
 * 發送純文字到 AI 進行分析
 * ⚠️ 重要：只發送文字，不上傳圖片（符合 Tech Stack v1.5.0 第 106-109 行）
 * 
 * @param payload - 上下文數據（純文字）
 * @returns AI 分析結果
 */
export async function analyzeTextWithAI(payload: ContextPayload): Promise<AIAnalysisResult> {
  console.log('[OCR] Analyzing text with AI (TEXT ONLY, NO IMAGE)...');
  
  // 如果未配置 OpenAI，返回 Mock 數據
  if (!isOpenAIConfigured()) {
    console.log('[OCR] OpenAI not configured, using mock analysis');
    return {
      keyword: payload.target_text,
      definition: '(Mock) AI 分析功能需要配置 OpenAI API Key',
      example: `Example: ${payload.original_sentence}`,
      tags: ['mock', 'unconfigured'],
    };
  }
  
  try {
    const result = await callAIAction<
      {
        targetText: string;
        originalSentence: string;
        contextText: string;
      },
      AIAnalysisResult
    >('analyze_context', {
      targetText: payload.target_text,
      originalSentence: payload.original_sentence,
      contextText: payload.context_text,
    });

    console.log('[OCR] ✅ AI analysis completed:', result.keyword);
    return result;
  } catch (error) {
    console.error('[OCR] ❌ AI analysis error:', error);

    // 返回基礎分析結果
    return {
      keyword: payload.target_text,
      definition: '無法生成定義（請檢查 API 配置）',
      example: payload.original_sentence,
      tags: ['error'],
    };
  }
}

// ============================================================
// Legacy Compatibility (Optional)
// ============================================================

/**
 * 是否可使用 OCR。ML Kit 為本地辨識，無需 API key，視為永遠可用。
 */
export function isOCRAvailable(): boolean {
  return true;
}

/**
 * @deprecated 舊版接口，保留用於向後兼容
 * 新代碼應使用 extractTextFromImage()
 */
export async function extractTextFromRegion(
  imageUri: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  boundingBox?: unknown,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  containerSize?: unknown
): Promise<string> {
  console.warn('[OCR] extractTextFromRegion is deprecated. Use extractTextFromImage() instead.');
  const result = await extractTextFromImage(imageUri);
  return result.fullText;
}

/**
 * @deprecated 舊版接口，保留用於向後兼容
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * @deprecated 舊版接口，保留用於向後兼容
 */
export async function extractTextFromAnnotations(
  imageUri: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  annotations: Array<BoundingBox & { id: string }>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  containerSize?: unknown
): Promise<Array<{ id: string; text: string }>> {
  console.warn('[OCR] extractTextFromAnnotations is deprecated. Use extractTextFromImage() instead.');
  const result = await extractTextFromImage(imageUri);
  
  // 返回模擬數據以保持兼容性
  return annotations.map((ann, i) => ({
    id: ann.id,
    text: result.blocks[i]?.text || '',
  }));
}
