// src/services/ocr/ocrService.ts
// OCR Service - Tech Stack v1.5.0: Pure Text Strategy
// Uses platform-native on-device OCR (Apple Vision / Google ML Kit)
// NO images are uploaded to AI servers

import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { logDiagnosticEvent } from '@services/logging/diagnosticsLog';
import * as ImageManipulator from 'expo-image-manipulator';
import { isVisionOCRAvailable, recognizeTextWithVision } from '../../native/VisionOCRModule';
import { callAIAction } from '../ai/edgeAiClient';
import type { AIPersonalizationOptions } from '../ai/types';
import { getLocalPhoneticTranscription } from '../pronunciation/localPhonetics';
import { getPreparedOCRVisionLanguageConfig } from './languagePacks';
import { pickSentenceContainingWord } from '../../features/createCard/textTransforms';

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
  candidates?: Array<{ text: string; confidence?: number }>;
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
 * 使用平台原生引擎進行本地 OCR（iOS Apple Vision / Android ML Kit）
 * ⚠️ 重要：此函數 100% 在本地執行，不需要網路連接
 * 
 * @param imageUri - 圖片的本地 URI
 * @returns OCR 識別結果（包含文字塊和座標）
 */
export async function extractTextFromImage(imageUri: string): Promise<OCRResult> {
  const startTime = Date.now();
  
  try {
    // 驗證圖片路徑（避免傳空值或過期路徑到 native 導致閃退）
    if (!imageUri) {
      throw new Error('OCR failed: empty image URI');
    }
    
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      throw new Error('OCR image file not found');
    }

    if (!isOCRAvailable()) {
      throw new Error('On-device OCR is not available on this device');
    }

    const ocrLanguageConfig = await getPreparedOCRVisionLanguageConfig();
    const primaryResult = await recognizeTextWithVision(imageUri, {
      languages: ocrLanguageConfig.visionLanguages,
      usesLanguageCorrection: false,
      automaticallyDetectsLanguage: ocrLanguageConfig.automaticallyDetectsLanguage,
    });
    const blocks: OCRBlock[] = mapVisionBlocksToOCRBlocks(primaryResult.blocks || []);
    const fullText = normalizeFullText(primaryResult.fullText, blocks);

    const processingTime = Date.now() - startTime;
    
    void logDiagnosticEvent({
      severity: 'info',
      category: 'ocr',
      event: 'local_ocr_complete',
      context: {
        blockCount: blocks.length,
        hasText: Boolean(fullText),
        imageWidth: primaryResult.imageWidth,
        imageHeight: primaryResult.imageHeight,
        processingTimeMs: processingTime,
      },
    });
    
    return { blocks, fullText, processingTime };
    
  } catch (error) {
    void logDiagnosticEvent({
      severity: 'error',
      category: 'ocr',
      event: 'local_ocr_failed',
      context: {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        processingTimeMs: Date.now() - startTime,
      },
    });
    throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

type VisionOCRBlockLike = {
  text?: string;
  frame?: { x?: number; y?: number; width?: number; height?: number };
  confidence?: number;
  candidates?: Array<{ text?: string; confidence?: number }>;
};

const OCR_SPACING_LEFT_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'for', 'from', 'had', 'has',
  'have', 'he', 'her', 'his', 'i', 'if', 'in', 'is', 'it', 'its', 'may', 'not', 'of', 'on',
  'or', 'our', 'she', 'so', 'that', 'the', 'their', 'they', 'this', 'to', 'we', 'were',
  'with', 'you', 'your', 'idea', 'people', 'time', 'way', 'thing', 'work', 'world', 'life',
  'story', 'part', 'point', 'place', 'case', 'level', 'team', 'word', 'text', 'line',
]);

const OCR_SPACING_RIGHT_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'for', 'from', 'had', 'has',
  'have', 'he', 'her', 'his', 'i', 'if', 'in', 'is', 'it', 'its', 'may', 'not', 'of', 'on',
  'or', 'our', 'she', 'so', 'that', 'the', 'their', 'they', 'this', 'to', 'we', 'were',
  'with', 'you', 'your', 'about', 'after', 'before', 'into', 'over', 'than', 'through',
  'under', 'when', 'where', 'which', 'while', 'who', 'will', 'would',
]);

const OCR_SPACING_INTACT_WORDS = new Set([
  'another', 'anything', 'anyone', 'because', 'before', 'between', 'without', 'within',
  'together', 'therefore', 'however', 'although', 'through', 'thought', 'though', 'whether',
  'whatever', 'whenever', 'wherever', 'important', 'information', 'something', 'someone',
]);

function compactLatinLetters(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function isPlainLowercaseLatinToken(value: string): boolean {
  return /^[a-z]{5,24}$/.test(value);
}

function spacedCandidateForOCRToken(
  token: string,
  candidates?: Array<{ text?: string; confidence?: number }>
): string | null {
  if (!isPlainLowercaseLatinToken(token) || !Array.isArray(candidates)) return null;
  const compactToken = compactLatinLetters(token);
  const candidate = candidates
    .map((item) => (item?.text || '').trim())
    .find((text) => {
      if (!/\s/.test(text)) return false;
      if (compactLatinLetters(text) !== compactToken) return false;
      const pieces = text.split(/\s+/).filter(Boolean);
      return pieces.length >= 2 && pieces.length <= 4 && pieces.every((piece) => /^[A-Za-z]+$/.test(piece));
    });
  return candidate || null;
}

function restoreCommonOCRSpacingToken(token: string): string | null {
  const normalized = token.toLowerCase();
  if (!isPlainLowercaseLatinToken(normalized)) return null;
  if (OCR_SPACING_INTACT_WORDS.has(normalized)) return null;
  if (OCR_SPACING_LEFT_WORDS.has(normalized) || OCR_SPACING_RIGHT_WORDS.has(normalized)) return null;

  let best: { text: string; score: number } | null = null;
  for (let index = 1; index < normalized.length; index += 1) {
    const left = normalized.slice(0, index);
    const right = normalized.slice(index);
    if (left.length < 1 || right.length < 1) continue;
    const leftKnown = OCR_SPACING_LEFT_WORDS.has(left);
    const rightKnown = OCR_SPACING_RIGHT_WORDS.has(right);
    if (!leftKnown || !rightKnown) continue;

    const functionWordBoundary = left.length <= 4 || right.length <= 5;
    if (!functionWordBoundary) continue;

    const score =
      (left.length >= 3 ? 2 : 1) +
      (right.length >= 3 ? 2 : 1) +
      (rightKnown && right.length <= 5 ? 2 : 0);
    if (!best || score > best.score) {
      best = { text: `${left} ${right}`, score };
    }
  }
  return best?.text || null;
}

function restoreOCRSpacingInText(text: string): string {
  return text.replace(/\b[a-z]{5,24}\b/g, (token) => restoreCommonOCRSpacingToken(token) || token);
}

function resolveOCRBlockText(block: VisionOCRBlockLike): string {
  const rawText = (block?.text || '').trim();
  if (!rawText) return '';
  const candidate = spacedCandidateForOCRToken(rawText, block.candidates);
  if (candidate) return candidate;
  return restoreOCRSpacingInText(rawText);
}

function mapVisionBlocksToOCRBlocks(visionBlocks: VisionOCRBlockLike[]): OCRBlock[] {
  return visionBlocks
    .map((block, index) => {
      const text = resolveOCRBlockText(block);
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
        candidates: Array.isArray(block.candidates)
          ? block.candidates
              .map((candidate) => ({
                text: (candidate?.text || '').trim(),
                confidence: candidate?.confidence,
              }))
              .filter((candidate) => candidate.text)
          : undefined,
      } as OCRBlock;
    })
    .filter((block): block is OCRBlock => Boolean(block));
}

function hasCJK(text: string): boolean {
  return /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text);
}

function hasLatin(text: string): boolean {
  return /[A-Za-z0-9]/.test(text);
}

function normalizeFullText(rawText: string | undefined, blocks: OCRBlock[]): string {
  const trimmedRaw = (rawText || '').trim();
  if (trimmedRaw) {
    return restoreOCRSpacingInText(trimmedRaw);
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

type TargetAnchoredOCROptions = {
  /** Zero-based occurrence when the same target appears more than once. */
  targetOccurrence?: number;
};

function tokenizeOCRText(text: string): string[] {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []
  );
}

function countTermOccurrences(tokens: string[], termTokens: string[]): number {
  if (!termTokens.length || tokens.length < termTokens.length) return 0;
  let count = 0;
  for (let index = 0; index <= tokens.length - termTokens.length; index += 1) {
    if (termTokens.every((token, offset) => tokens[index + offset] === token)) {
      count += 1;
    }
  }
  return count;
}

function horizontalOverlapRatio(left: OCRBlock, right: OCRBlock): number {
  const overlap = Math.max(
    0,
    Math.min(left.frame.x + left.frame.width, right.frame.x + right.frame.width) -
      Math.max(left.frame.x, right.frame.x)
  );
  const narrowerWidth = Math.max(1, Math.min(left.frame.width, right.frame.width));
  return overlap / narrowerWidth;
}

function verticalGap(left: OCRBlock, right: OCRBlock): number {
  const leftBottom = left.frame.y + left.frame.height;
  const rightBottom = right.frame.y + right.frame.height;
  if (leftBottom < right.frame.y) return right.frame.y - leftBottom;
  if (rightBottom < left.frame.y) return left.frame.y - rightBottom;
  return 0;
}

function joinOCRBlocks(blocks: OCRBlock[]): string {
  const parts = blocks.map((block) => block.text.trim()).filter(Boolean);
  if (!parts.length) return '';
  const containsLatin = parts.some((part) => hasLatin(part));
  const containsCJK = parts.some((part) => hasCJK(part));
  return containsCJK && !containsLatin ? parts.join('') : parts.join(' ');
}

/**
 * Reconstructs local OCR context from the text region containing the selected
 * target. Vision already returns geometry for every recognized line; using it
 * here prevents unrelated text near the crop edge from leaking into the card.
 *
 * Returns null when the target or usable geometry cannot be located so callers
 * can safely fall back to the original merged OCR text.
 */
export function buildTargetAnchoredOCRText(
  blocks: OCRBlock[],
  targetText: string,
  options: TargetAnchoredOCROptions = {}
): string | null {
  const targetTokens = tokenizeOCRText(targetText);
  if (!blocks.length || !targetTokens.length) return null;

  const requestedOccurrence = Math.max(
    0,
    Math.floor(options.targetOccurrence || 0)
  );
  let seenOccurrences = 0;
  let targetIndex = -1;

  for (let index = 0; index < blocks.length; index += 1) {
    const occurrenceCount = countTermOccurrences(
      tokenizeOCRText(blocks[index].text),
      targetTokens
    );
    if (
      occurrenceCount > 0 &&
      requestedOccurrence < seenOccurrences + occurrenceCount
    ) {
      targetIndex = index;
      break;
    }
    seenOccurrences += occurrenceCount;
  }

  if (targetIndex < 0) return null;
  const targetBlock = blocks[targetIndex];
  const validGeometry = blocks.filter(
    (block) =>
      Number.isFinite(block.frame.x) &&
      Number.isFinite(block.frame.y) &&
      block.frame.width > 0 &&
      block.frame.height > 0
  );
  if (!validGeometry.includes(targetBlock)) return null;

  const sortedHeights = validGeometry
    .map((block) => block.frame.height)
    .sort((left, right) => left - right);
  const medianHeight =
    sortedHeights[Math.floor(sortedHeights.length / 2)] ||
    targetBlock.frame.height;
  const targetCenterY =
    targetBlock.frame.y + targetBlock.frame.height / 2;
  const maxDistanceFromTarget = Math.max(
    medianHeight * 7,
    targetBlock.frame.height * 6
  );

  const selected = new Set<OCRBlock>([targetBlock]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of validGeometry) {
      if (selected.has(candidate)) continue;

      const candidateCenterY =
        candidate.frame.y + candidate.frame.height / 2;
      if (
        Math.abs(candidateCenterY - targetCenterY) >
        maxDistanceFromTarget
      ) {
        continue;
      }

      const similarTextSize =
        candidate.frame.height >= medianHeight * 0.5 &&
        candidate.frame.height <= medianHeight * 2;
      if (!similarTextSize) continue;

      const connectsToRegion = Array.from(selected).some((regionBlock) => {
        const overlap = horizontalOverlapRatio(regionBlock, candidate);
        const leftEdgeDifference = Math.abs(
          regionBlock.frame.x - candidate.frame.x
        );
        const sameColumn =
          overlap >= 0.35 ||
          leftEdgeDifference <= Math.max(20, medianHeight * 1.5);
        const nearbyLine =
          verticalGap(regionBlock, candidate) <=
          Math.max(12, medianHeight * 1.25);
        const confidenceNeedsStrongerMatch =
          typeof candidate.confidence === 'number' &&
          candidate.confidence < 0.45;
        const strongMatch =
          overlap >= 0.6 &&
          verticalGap(regionBlock, candidate) <=
            Math.max(8, medianHeight * 0.75);
        return (
          sameColumn &&
          nearbyLine &&
          (!confidenceNeedsStrongerMatch || strongMatch)
        );
      });

      if (connectsToRegion) {
        selected.add(candidate);
        changed = true;
      }
    }
  }

  const regionBlocks = Array.from(selected)
    .sort(
      (left, right) =>
        left.frame.y - right.frame.y || left.frame.x - right.frame.x
    );
  const reconstructed = joinOCRBlocks(regionBlocks).trim();
  return reconstructed || null;
}

/**
 * 構建以完整語意句為單位的智能上下文
 * 
 * 規則：
 * 1. 優先保留包含 target 的完整句子
 * 2. 太短時補一個相鄰完整句，太長時以 target 為中心收斂
 * 3. OCR 單行換行不視為句界，避免把視覺換行誤判成殘句
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
  const trimPunctuation = (word: string) =>
    word.replace(/^[\s"'“”‘’()[\]{}<>.,!?;:]+|[\s"'“”‘’()[\]{}<>.,!?;:]+$/g, '').trim();
  const targetText = trimPunctuation(targetRaw) || targetRaw.trim();
  const sourceParts = blocks.map((block) => block.text.trim()).filter(Boolean);
  const paragraphText = sourceParts
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const precedingParts = blocks
    .slice(0, selectedIndex)
    .map((block) => block.text.trim())
    .filter(Boolean);
  const targetOffset =
    precedingParts.join(' ').length + (precedingParts.length > 0 ? 1 : 0);
  const focusSentence =
    pickSentenceContainingWord(paragraphText, targetText, { targetOffset }) ||
    targetText;
  const targetPattern = targetText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const contextText = focusSentence
    .replace(new RegExp(`\\b${targetPattern}\\b`, 'i'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const focusWords = focusSentence.split(/\s+/).filter(Boolean);
  const focusWordCount = focusWords.length;
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
  
  if (__DEV__) {
    console.log('[OCR] Built semantic source context:', {
      target: targetText,
      wordCount: focusWordCount,
      sentence: focusSentence,
      useParagraphMode,
      paragraphModeReason,
    });
  }
  
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
 * 是否可使用平台本機 OCR 原生模組
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
