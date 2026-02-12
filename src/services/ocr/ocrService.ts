// src/services/ocr/ocrService.ts
// OCR Service - Tech Stack v1.5.0: Pure Text Strategy
// Uses Google ML Kit for 100% local text extraction
// NO images are uploaded to AI servers

import TextRecognition from '@react-native-ml-kit/text-recognition';
import { isOpenAIConfigured, callOpenAI } from '../ai/openaiService';

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
    // 調用 Google ML Kit（完全本地處理）
    const result = await TextRecognition.recognize(imageUri);
    
    console.log(`[OCR] ML Kit raw result:`, {
      blockCount: result.blocks?.length || 0,
      hasText: !!result.text,
    });
    
    // 轉換為標準格式
    const blocks: OCRBlock[] = (result.blocks || []).map((block: any, index: number) => {
      // ML Kit 的 frame 結構可能因平台而異
      const frame = block.frame || block.boundingBox || {};
      return {
        id: `block_${index}_${Date.now()}`,
        text: block.text,
        frame: {
          x: frame.x !== undefined ? frame.x : (frame.left || 0),
          y: frame.y !== undefined ? frame.y : (frame.top || 0),
          width: frame.width !== undefined ? frame.width : ((frame.right || 0) - (frame.left || 0)),
          height: frame.height !== undefined ? frame.height : ((frame.bottom || 0) - (frame.top || 0)),
        },
        confidence: (block as any).confidence !== undefined ? (block as any).confidence : 0.95,
      };
    });
    
    const fullText = blocks.map(b => b.text).join(' ');
    const processingTime = Date.now() - startTime;
    
    console.log(`[OCR] ✅ Success: Found ${blocks.length} text blocks in ${processingTime}ms`);
    console.log(`[OCR] Full text preview: "${fullText.substring(0, 100)}..."`);
    
    return { blocks, fullText, processingTime };
    
  } catch (error) {
    console.error('[OCR] ❌ Error during ML Kit recognition:', error);
    throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * 構建智能上下文（Tech Stack v1.5.0 第 146-150 行規範）
 * 
 * 當用戶點擊文字塊 i 時：
 * - Target: blocks[i].text
 * - Context: blocks[i-1].text + blocks[i+1].text
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
  const prevText = blocks[selectedIndex - 1]?.text || '';
  const nextText = blocks[selectedIndex + 1]?.text || '';
  
  const contextText = `${prevText} ${nextText}`.trim();
  const originalSentence = `${prevText} ${targetText} ${nextText}`.trim();
  
  console.log('[OCR] Built context payload:', {
    target: targetText,
    hasPrevious: !!prevText,
    hasNext: !!nextText,
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
  
  // 構建純文字 prompt
  const systemPrompt = `你是一個語言學習助手。分析用戶提供的詞彙並返回 JSON 格式的學習卡片。
重要：只返回純 JSON，不要包含 markdown 語法或其他文字。`;

  const userPrompt = `請分析以下詞彙：

目標詞彙: "${payload.target_text}"
上下文: "${payload.context_text}"
完整句子: "${payload.original_sentence}"

返回 JSON 格式：
{
  "keyword": "關鍵詞",
  "definition": "詞義解釋",
  "example": "例句",
  "tags": ["標籤1", "標籤2"],
  "pronunciation": "音標（可選）"
}`;

  try {
    const response = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      {
        temperature: 0.7,
        maxTokens: 500,
      }
    );
    
    // 清理可能的 markdown 語法
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '')
        .trim();
    }
    
    const result = JSON.parse(cleanedResponse) as AIAnalysisResult;
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
