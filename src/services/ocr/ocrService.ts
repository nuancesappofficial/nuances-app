// src/services/ocr/ocrService.ts
// OCR Service - Tech Stack v1.5.0: Pure Text Strategy
// Uses Apple Vision for 100% local text extraction on iOS
// NO images are uploaded to AI servers

import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { isVisionOCRAvailable, recognizeTextWithVision } from '../../native/VisionOCRModule';
import { callAIAction } from '../ai/edgeAiClient';
import type { AIPersonalizationOptions } from '../ai/types';
import { getLocalPhoneticTranscription } from '../pronunciation/localPhonetics';
import { getPreparedOCRVisionLanguages } from './languagePacks';

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
  context_text: string;     // 局部上下文（不含 target）
  original_sentence: string; // 目標句子
  focus_sentence?: string;   // 與 original_sentence 相同，提供後端語意明確欄位
  full_context?: string;     // 整段上下文（僅在需要時提供）
  use_paragraph_mode?: boolean; // 是否啟用段落模式
}

/**
 * AI 分析結果
 */
export interface AIAnalysisResult {
  keyword: string;
  partOfSpeech?: string;
  definition: string;
  contextualExplanation?: string;
  example: string;
  frequentCollocations?: string;
  tags: string[];
  pronunciation?: string;
  confidence?: number;
  alternatives?: string[];
}

// ============================================================
// Core Functions
// ============================================================

/**
 * 使用 Apple Vision 進行本地 OCR（iOS）
 * ⚠️ 重要：此函數 100% 在本地執行，不需要網路連接
 * 
 * @param imageUri - 圖片的本地 URI
 * @returns OCR 識別結果（包含文字塊和座標）
 */
export async function extractTextFromImage(imageUri: string): Promise<OCRResult> {
  console.log('[OCR] Starting Apple Vision text recognition (LOCAL)...');
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

    if (!isOCRAvailable()) {
      throw new Error('Apple Vision OCR is not available on this device');
    }

    const preferredVisionLanguages = await getPreparedOCRVisionLanguages();
    const primaryResult = await recognizeTextWithVision(imageUri, {
      // 混合語系時先偏向 CJK，再補英文，避免只抓到英數。
      languages: preferredVisionLanguages,
      usesLanguageCorrection: false,
      automaticallyDetectsLanguage: true,
    });
    let blocks: OCRBlock[] = mapVisionBlocksToOCRBlocks(primaryResult.blocks || []);
    let fullText = normalizeFullText(primaryResult.fullText, blocks);

    const latinOnly = hasLatin(fullText) && !hasCJK(fullText);
    if (latinOnly) {
      try {
        const cjkResult = await recognizeTextWithVision(imageUri, {
          languages: ['zh-Hant', 'zh-Hans', 'ja-JP', 'ko-KR'],
          usesLanguageCorrection: false,
          automaticallyDetectsLanguage: true,
        });
        const mergedBlocks = mergeOCRBlocks(blocks, mapVisionBlocksToOCRBlocks(cjkResult.blocks || []));
        if (mergedBlocks.length > blocks.length) {
          blocks = mergedBlocks;
          fullText = normalizeFullText(
            [primaryResult.fullText, cjkResult.fullText].filter(Boolean).join('\n'),
            blocks
          );
        }
      } catch (cjkPassError) {
        console.warn('[OCR] CJK fallback pass failed, keep primary result:', cjkPassError);
      }
    }

    const missingJapanese = !hasJapanese(fullText);
    if (missingJapanese) {
      try {
        const japaneseResult = await recognizeTextWithVision(imageUri, {
          languages: ['ja-JP'],
          usesLanguageCorrection: false,
          automaticallyDetectsLanguage: true,
        });
        const mergedBlocks = mergeOCRBlocks(blocks, mapVisionBlocksToOCRBlocks(japaneseResult.blocks || []));
        if (mergedBlocks.length > blocks.length) {
          blocks = mergedBlocks;
          fullText = normalizeFullText(
            [fullText, japaneseResult.fullText].filter(Boolean).join('\n'),
            blocks
          );
        }
      } catch (jaPassError) {
        console.warn('[OCR] Japanese fallback pass failed, keep merged result:', jaPassError);
      }
    }

    const missingKorean = !hasKorean(fullText);
    if (missingKorean) {
      try {
        const koreanResult = await recognizeTextWithVision(imageUri, {
          languages: ['ko-KR'],
          usesLanguageCorrection: false,
          automaticallyDetectsLanguage: true,
        });
        const mergedBlocks = mergeOCRBlocks(blocks, mapVisionBlocksToOCRBlocks(koreanResult.blocks || []));
        if (mergedBlocks.length > blocks.length) {
          blocks = mergedBlocks;
          fullText = normalizeFullText(
            [fullText, koreanResult.fullText].filter(Boolean).join('\n'),
            blocks
          );
        }
      } catch (koPassError) {
        console.warn('[OCR] Korean fallback pass failed, keep merged result:', koPassError);
      }
    }

    const processingTime = Date.now() - startTime;
    
    console.log('[OCR] Vision raw result:', {
      blockCount: blocks.length,
      hasText: !!fullText,
      imageWidth: primaryResult.imageWidth,
      imageHeight: primaryResult.imageHeight,
    });
    console.log(`[OCR] ✅ Success: Found ${blocks.length} blocks in ${processingTime}ms`);
    console.log(`[OCR] Full text preview: "${fullText.substring(0, 100)}..."`);
    
    return { blocks, fullText, processingTime };
    
  } catch (error) {
    console.error('[OCR] ❌ Error during Vision recognition:', error);
    throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function mapVisionBlocksToOCRBlocks(
  visionBlocks: Array<{ text?: string; frame?: { x?: number; y?: number; width?: number; height?: number }; confidence?: number }>
): OCRBlock[] {
  return visionBlocks
    .map((block, index) => {
      const text = (block?.text || '').trim();
      const frame = block?.frame;
      if (!text || !frame) return null;
      return {
        id: `word_${index}`,
        text,
        frame: {
          x: Number(frame.x) || 0,
          y: Number(frame.y) || 0,
          width: Math.max(0, Number(frame.width) || 0),
          height: Math.max(0, Number(frame.height) || 0),
        },
        confidence: typeof block.confidence === 'number' ? block.confidence : undefined,
      } as OCRBlock;
    })
    .filter((block): block is OCRBlock => Boolean(block));
}

function hasCJK(text: string): boolean {
  return /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text);
}

function hasJapanese(text: string): boolean {
  return /[\u3040-\u30FF]/.test(text);
}

function hasKorean(text: string): boolean {
  return /[\uAC00-\uD7AF]/.test(text);
}

function hasLatin(text: string): boolean {
  return /[A-Za-z0-9]/.test(text);
}

function mergeOCRBlocks(primary: OCRBlock[], secondary: OCRBlock[]): OCRBlock[] {
  const merged = [...primary];
  const seen = new Set(
    primary.map((block) => `${block.text}|${Math.round(block.frame.x)}|${Math.round(block.frame.y)}`)
  );
  secondary.forEach((block) => {
    const key = `${block.text}|${Math.round(block.frame.x)}|${Math.round(block.frame.y)}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(block);
  });
  return merged;
}

function normalizeFullText(rawText: string | undefined, blocks: OCRBlock[]): string {
  const trimmedRaw = (rawText || '').trim();
  if (trimmedRaw) {
    return trimmedRaw;
  }

  const tokens = blocks.map((block) => block.text.trim()).filter(Boolean);
  if (tokens.length === 0) return '';

  const containsLatin = tokens.some((token) => hasLatin(token));
  const containsCJK = tokens.some((token) => hasCJK(token));
  if (containsCJK && !containsLatin) {
    return tokens.join('');
  }

  return tokens.join(' ');
}

/**
 * 構建智能上下文（7 個單字：前 3 + 關鍵字 + 後 3）
 * 
 * 規則：
 * 1. 目標視窗為「前 3 + target + 後 3」
 * 2. 遇到標點符號（. , ! ? ; :）該側提前停止
 * 3. 若一側提前停止，剩餘配額會轉給另一側（另一側也遇標點則停止）
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
  
  const targetRaw = blocks[selectedIndex].text;
  const boundaryPunctuation = /[.!?;:]/;
  const trimPunctuation = (word: string) =>
    word.replace(/^[\s"'“”‘’()[\]{}<>.,!?;:]+|[\s"'“”‘’()[\]{}<>.,!?;:]+$/g, '').trim();
  const hasLetterOrNumber = (word: string) => /[A-Za-z0-9]/.test(word);
  const hasTrailingBoundary = (word: string) => /[.!?;:]["'”’)\]}>\s]*$/.test(word);
  const hasLeadingBoundary = (word: string) => /^[\s"'“”‘’([<{]*[.!?;:]/.test(word);
  const targetText = trimPunctuation(targetRaw) || targetRaw.trim();

  // 先收集到標點為止的左右候選詞
  const prevCandidates: string[] = [];
  for (let i = selectedIndex - 1; i >= 0; i--) {
    const rawWord = blocks[i].text;
    const containsBoundary = boundaryPunctuation.test(rawWord);
    const cleanedWord = trimPunctuation(rawWord);

    // 往左回看時，像 "juice." 代表上一句結尾，應直接停止且不納入
    if (hasTrailingBoundary(rawWord)) {
      break;
    }
    if (containsBoundary && !hasLetterOrNumber(cleanedWord)) break;
    if (cleanedWord) {
      prevCandidates.unshift(cleanedWord);
    }
    if (containsBoundary) {
      break;
    }
  }

  const nextCandidates: string[] = [];
  for (let i = selectedIndex + 1; i < blocks.length; i++) {
    const rawWord = blocks[i].text;
    const containsBoundary = boundaryPunctuation.test(rawWord);
    const cleanedWord = trimPunctuation(rawWord);

    if (containsBoundary && !hasLetterOrNumber(cleanedWord)) {
      break;
    }
    // 往右看時，像 "bag." 應保留 "bag" 後停止
    if (hasLeadingBoundary(rawWord)) break;
    if (cleanedWord) {
      nextCandidates.push(cleanedWord);
    }
    if (containsBoundary) {
      break;
    }
  }

  // 基礎配額：前 3 + 後 3；若一側提前被標點截斷，剩餘配額轉給另一側
  const baseQuota = 3;
  let prevTake = Math.min(baseQuota, prevCandidates.length);
  let nextTake = Math.min(baseQuota, nextCandidates.length);

  const prevShortage = baseQuota - prevTake;
  if (prevShortage > 0) {
    const transferable = Math.min(prevShortage, nextCandidates.length - nextTake);
    nextTake += Math.max(0, transferable);
  }

  const nextShortage = baseQuota - nextTake;
  if (nextShortage > 0) {
    const transferable = Math.min(nextShortage, prevCandidates.length - prevTake);
    prevTake += Math.max(0, transferable);
  }

  const prevWords = prevCandidates.slice(-prevTake);
  const nextWords = nextCandidates.slice(0, nextTake);
  
  const contextText = `${prevWords.join(' ')} ${nextWords.join(' ')}`.trim();
  const focusSentence = `${prevCandidates.join(' ')} ${targetText} ${nextCandidates.join(' ')}`.trim();

  const paragraphText = blocks
    .map((block) => trimPunctuation(block.text))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const focusWords = focusSentence.split(/\s+/).filter(Boolean);
  const focusWordCount = focusWords.length;
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const targetPattern = escapeRegExp(targetText);
  const hasObjectAfterTarget = new RegExp(
    `\\b${targetPattern}\\b\\s+(?!for\\b|to\\b|in\\b|on\\b|at\\b|with\\b|of\\b|by\\b)\\w+`,
    'i'
  ).test(focusSentence);
  const shortClauseNoObject = focusWordCount <= 4 && !hasObjectAfterTarget;
  const shortAndAmbiguous = focusWordCount <= 6 && !hasObjectAfterTarget;
  const pronounHeavyStart = /^(it|they|he|she|we|i)\b/i.test(focusSentence);
  const businessCue = /(\$\d+|dollars?|fee|charge|cost|invoice|bill)/i.test(
    `${focusSentence} ${paragraphText}`
  );
  const useParagraphMode = shortClauseNoObject || shortAndAmbiguous || pronounHeavyStart || !businessCue;
  const paragraphModeReason = shortClauseNoObject
    ? 'short_clause_no_object'
    : shortAndAmbiguous
      ? 'short_ambiguous'
      : pronounHeavyStart
        ? 'pronoun_start'
        : !businessCue
          ? 'no_business_cue'
          : 'disabled';
  
  console.log('[OCR] Built context (7 words):', {
    target: targetText,
    prev: prevWords.length,
    next: nextWords.length,
    sentence: focusSentence,
    useParagraphMode,
    paragraphModeReason,
  });
  
  return {
    target_text: targetText,
    context_text: contextText,
    original_sentence: focusSentence,
    focus_sentence: focusSentence,
    full_context: useParagraphMode ? paragraphText : undefined,
    use_paragraph_mode: useParagraphMode,
  };
}

/**
 * 發送純文字到 AI 進行分析
 * ⚠️ 重要：只發送文字，不上傳圖片（符合 Tech Stack v1.5.0 第 106-109 行）
 * 
 * @param payload - 上下文數據（純文字）
 * @returns AI 分析結果
 */
export async function analyzeTextWithAI(
  payload: ContextPayload,
  _personalization?: AIPersonalizationOptions
): Promise<AIAnalysisResult> {
  try {
    const localPronunciation = await getLocalPhoneticTranscription(payload.target_text);
    console.log(
      `[Phonetic] analyze_context target="${payload.target_text}" source=${localPronunciation ? 'local' : 'api_fallback'}`
    );
    const result = await callAIAction<
      {
        targetText: string;
        originalSentence: string;
        contextText: string;
        focusSentence?: string;
        fullContext?: string;
        useParagraphMode?: boolean;
        includePronunciation?: boolean;
      },
      {
        keyword?: string;
        partOfSpeech?: string;
        ['part of speech']?: string;
        definition?: string;
        contextualExplanation?: string;
        example?: string;
        frequentCollocations?: string;
        ['Frequent collocations']?: string;
        tags?: string[];
        pronunciation?: string | null;
        phoneticTranscription?: string | null;
        ipa?: string | null;
        phonetic?: string | null;
        confidence?: number;
        alternatives?: string[];
      }
    >('analyze_context', {
      targetText: payload.target_text,
      originalSentence: payload.original_sentence,
      contextText: payload.context_text,
      focusSentence: payload.focus_sentence,
      fullContext: payload.full_context,
      useParagraphMode: payload.use_paragraph_mode,
      includePronunciation: !localPronunciation,
    });
    console.log(
      `[OCR] analyze_context result keyword="${result.keyword || payload.target_text}" collocation="${String(
        result.frequentCollocations || result['Frequent collocations'] || ''
      )}"`
    );

    return {
      keyword: (result.keyword || payload.target_text).trim(),
      partOfSpeech: (result.partOfSpeech || result['part of speech'] || '').trim(),
      definition: (result.definition || '').trim(),
      contextualExplanation: (result.contextualExplanation || '').trim(),
      example: (result.example || payload.original_sentence).trim(),
      frequentCollocations: (
        result.frequentCollocations || result['Frequent collocations'] || ''
      ).trim(),
      tags: Array.isArray(result.tags) ? result.tags.filter((tag) => typeof tag === 'string') : [],
      pronunciation: (
        localPronunciation ||
        (typeof result.pronunciation === 'string' ? result.pronunciation : null) ||
        (typeof result.phoneticTranscription === 'string'
          ? result.phoneticTranscription
          : null) ||
        (typeof result.ipa === 'string' ? result.ipa : null) ||
        (typeof result.phonetic === 'string' ? result.phonetic : null) ||
        ''
      ).trim() || undefined,
      confidence:
        typeof result.confidence === 'number' ? result.confidence : undefined,
      alternatives: Array.isArray(result.alternatives)
        ? result.alternatives.filter((item) => typeof item === 'string')
        : undefined,
    };
  } catch (error) {
    console.warn('[OCR] analyze_context failed, fallback to local result:', error);
    return {
      keyword: payload.target_text,
      partOfSpeech: '',
      definition: `${payload.target_text}（AI 暫時無法分析，請手動補充定義）`,
      contextualExplanation: '',
      example: payload.original_sentence,
      frequentCollocations: '',
      tags: ['local-fallback'],
    };
  }
}

// ============================================================
// Legacy Compatibility (Optional)
// ============================================================

/**
 * 是否可使用 OCR（iOS + Vision Native Module）
 */
export function isOCRAvailable(): boolean {
  return isVisionOCRAvailable();
}

interface Size {
  width: number;
  height: number;
}

function getImageSize(imageUri: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      imageUri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * @deprecated 舊版接口，保留用於向後兼容
 * 新代碼應使用 extractTextFromImage()
 */
export async function extractTextFromRegion(
  imageUri: string,
  boundingBox?: unknown,
  containerSize?: unknown
): Promise<string> {
  const box = boundingBox as BoundingBox | undefined;
  const container = containerSize as Size | undefined;

  if (!box || !container || container.width <= 0 || container.height <= 0) {
    const result = await extractTextFromImage(imageUri);
    return result.fullText;
  }

  const imageSize = await getImageSize(imageUri);
  const scale = Math.min(container.width / imageSize.width, container.height / imageSize.height);
  const displayWidth = imageSize.width * scale;
  const displayHeight = imageSize.height * scale;
  const offsetX = (container.width - displayWidth) / 2;
  const offsetY = (container.height - displayHeight) / 2;

  const boxX = box.x * container.width;
  const boxY = box.y * container.height;
  const boxWidth = box.width * container.width;
  const boxHeight = box.height * container.height;

  const cropLeft = clamp(Math.max(boxX, offsetX), offsetX, offsetX + displayWidth);
  const cropTop = clamp(Math.max(boxY, offsetY), offsetY, offsetY + displayHeight);
  const cropRight = clamp(
    Math.min(boxX + boxWidth, offsetX + displayWidth),
    offsetX,
    offsetX + displayWidth
  );
  const cropBottom = clamp(
    Math.min(boxY + boxHeight, offsetY + displayHeight),
    offsetY,
    offsetY + displayHeight
  );

  const visibleWidth = cropRight - cropLeft;
  const visibleHeight = cropBottom - cropTop;
  if (visibleWidth < 2 || visibleHeight < 2) {
    const result = await extractTextFromImage(imageUri);
    return result.fullText;
  }

  const originX = Math.max(
    0,
    Math.round(((cropLeft - offsetX) / displayWidth) * imageSize.width)
  );
  const originY = Math.max(
    0,
    Math.round(((cropTop - offsetY) / displayHeight) * imageSize.height)
  );
  const width = Math.max(1, Math.round((visibleWidth / displayWidth) * imageSize.width));
  const height = Math.max(1, Math.round((visibleHeight / displayHeight) * imageSize.height));

  const cropped = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ crop: { originX, originY, width, height } }],
    {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  try {
    const result = await extractTextFromImage(cropped.uri);
    return result.fullText;
  } finally {
    await FileSystem.deleteAsync(cropped.uri, { idempotent: true }).catch(() => undefined);
  }
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
