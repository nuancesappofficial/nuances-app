// AI Action Service
// 透過 Supabase ai-proxy 呼叫後端 AI action

import { callAIAction, callAIProxy, isAIProxyConfigured, isPremiumFeatureError } from './edgeAiClient';
import type { AIPersonalizationOptions } from './types';
import { getLocalPhoneticTranscription } from '../pronunciation/localPhonetics';

// API 調用限制和重試邏輯
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 秒

/**
 * 延遲函數
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 調用 legacy OpenAI proxy（僅保留相容舊流程）
 */
export async function callOpenAI(
  messages: { role: string; content: any }[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean; // 啟用 response_format: json_object
  } = {}
): Promise<string> {
  const {
    model = 'gpt-4o-mini',
    temperature = 0.7,
    maxTokens = 500,
    jsonMode = false,
  } = options;

  if (!isAIProxyConfigured()) {
    throw new Error(
      'AI proxy not configured. Please set Supabase env and deploy Edge Function.'
    );
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await callAIProxy({
        provider: 'openai',
        messages,
        options: {
          model,
          temperature,
          maxTokens,
          jsonMode,
        },
      });
    } catch (error) {
      console.error(`Legacy OpenAI proxy attempt ${attempt + 1} failed:`, error);
      
      if (attempt < MAX_RETRIES - 1) {
        await delay(RETRY_DELAY * (attempt + 1));
      } else {
        throw error;
      }
    }
  }

  throw new Error('Legacy OpenAI proxy failed after multiple retries');
}
/**
 * 為單字生成詳細的定義和解釋
 */
export async function generateCardContent(
  targetWord: string,
  originalSentence: string,
  personalization?: AIPersonalizationOptions
): Promise<{
  normalizedTargetWord: string;
  meaningInContext?: string;
  isLikelyTypo?: boolean;
  correctedTargetWord?: string;
  typoReason?: string;
  isPartOfPhrase?: boolean;
  detectedPhrase?: string;
  definition: string;
  partOfSpeech: string;
  contextualExplanation: string;
  example: string;
  frequentCollocations: string;
  phoneticTranscription: string | null;
  tags: string[];
}> {
  try {
    const replyLanguage = normalizeOptionalString(personalization?.replyLanguage);
    const aiBreakdownMode = normalizeOptionalString(personalization?.aiBreakdownMode);
    const localPhonetic = await getLocalPhoneticTranscription(targetWord);
    console.log(
      `[Phonetic] generate_card target="${targetWord}" source=${localPhonetic ? 'local' : 'api_fallback'}`
    );
    const result = await callAIAction<
      {
        targetWord: string;
        originalSentence: string;
        includePronunciation?: boolean;
        replyLanguage?: string;
        aiBreakdownMode?: string;
      },
      {
      normalizedTargetWord?: string;
      meaningInContext?: string;
      isLikelyTypo?: boolean;
      correctedTargetWord?: string;
      typoReason?: string;
      isPartOfPhrase?: boolean;
        detectedPhrase?: string;
        lemma?: string;
        targetWord?: string;
        keyword?: string;
        definition: string;
        partOfSpeech?: string;
        ['part of speech']?: string;
        contextualExplanation: string;
        example?: string;
        frequentCollocations?: string;
        ['Frequent collocations']?: string;
        phoneticTranscription: string | null;
        pronunciation?: string | null;
        ipa?: string | null;
        phonetic?: string | null;
        tags: string[];
      }
    >('generate_card', {
      targetWord,
      originalSentence,
      includePronunciation: !localPhonetic,
      replyLanguage,
      aiBreakdownMode,
    });

    const resolvedHeadword = normalizeOptionalString(
      result.normalizedTargetWord ||
      result.correctedTargetWord ||
      result.lemma ||
      result.targetWord ||
      result.keyword
    ) || targetWord;

    return {
      normalizedTargetWord: resolvedHeadword,
      meaningInContext: normalizeOptionalString(result.meaningInContext),
      isLikelyTypo: Boolean(result.isLikelyTypo),
      correctedTargetWord: normalizeOptionalString(result.correctedTargetWord),
      typoReason: normalizeOptionalString(result.typoReason),
      isPartOfPhrase: Boolean(result.isPartOfPhrase),
      detectedPhrase: normalizeOptionalString(result.detectedPhrase),
      definition: result.definition || '',
      partOfSpeech:
        result.partOfSpeech || result['part of speech'] || '',
      contextualExplanation: result.contextualExplanation || '',
      example: result.example || '',
      frequentCollocations:
        result.frequentCollocations || result['Frequent collocations'] || '',
      phoneticTranscription:
        localPhonetic ||
        result.phoneticTranscription ||
        result.pronunciation ||
        result.ipa ||
        result.phonetic ||
        null,
      tags: result.tags || [],
    };
  } catch (error) {
    if (!isPremiumFeatureError(error)) {
      console.error('[AI] Error in generateCardContent:', error);
    }
    throw error;
  }
}
/**
 * 檢查 API Key 是否已配置
 */
export function isOpenAIConfigured(): boolean {
  return isAIProxyConfigured();
}
