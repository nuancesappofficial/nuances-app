// AI Action Service
// 透過 Supabase ai-proxy 呼叫後端 AI action

import { callAIAction, callAIProxy, isAIProxyConfigured } from './edgeAiClient';
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
 * 調用 OpenAI API（支援 JSON mode，確保回應為合法 JSON）
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
      console.error(`OpenAI API attempt ${attempt + 1} failed:`, error);
      
      if (attempt < MAX_RETRIES - 1) {
        await delay(RETRY_DELAY * (attempt + 1));
      } else {
        throw error;
      }
    }
  }

  throw new Error('OpenAI API failed after multiple retries');
}

/**
 * 分析文本並提取關鍵詞
 */
export async function analyzeText(
  text: string,
  userKeywords?: string,
  _personalization?: AIPersonalizationOptions
): Promise<{
  keywords: string[];
  suggestedWord: string | null;
}> {
  try {
    const normalizedKeywords = normalizeOptionalString(userKeywords);

    const result = await callAIAction<
      {
        text: string;
        userKeywords?: string;
      },
      {
        keywords: string[];
        suggestedWord: string | null;
      }
    >('analyze_text', {
      text,
      userKeywords: normalizedKeywords,
    });

    return {
      keywords: (result.keywords || []).slice(0, 1),
      suggestedWord: result.suggestedWord || null,
    };
  } catch (error) {
    console.error('[OpenAI] Error in analyzeText:', error);
    throw error;
  }
}

/**
 * 為單字生成詳細的定義和解釋
 */
export async function generateCardContent(
  targetWord: string,
  originalSentence: string,
  _personalization?: AIPersonalizationOptions
): Promise<{
  normalizedTargetWord: string;
  definition: string;
  partOfSpeech: string;
  contextualExplanation: string;
  example: string;
  frequentCollocations: string;
  phoneticTranscription: string | null;
  tags: string[];
}> {
  try {
    const localPhonetic = await getLocalPhoneticTranscription(targetWord);
    console.log(
      `[Phonetic] generate_card target="${targetWord}" source=${localPhonetic ? 'local' : 'api_fallback'}`
    );
    const result = await callAIAction<
      {
        targetWord: string;
        originalSentence: string;
        includePronunciation?: boolean;
      },
      {
        normalizedTargetWord?: string;
        correctedTargetWord?: string;
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
    console.error('[OpenAI] Error in generateCardContent:', error);
    throw error;
  }
}

/**
 * 完整分析：結合文本分析和卡片內容生成
 */
export async function analyzeAndGenerateCard(
  text: string,
  userKeywords?: string,
  personalization?: AIPersonalizationOptions
): Promise<{
  keywords: string[];
  suggestedWord: string | null;
  definition: string;
  partOfSpeech: string;
  contextualExplanation: string;
  exampleSentence: string;
  frequentCollocations: string;
  phoneticTranscription: string | null;
  tags: string[];
}> {
  void personalization;
  const normalizedKeywords = normalizeOptionalString(userKeywords);
  const targetWord = normalizeOptionalString(userKeywords);
  if (!targetWord) {
    throw new Error('targetWord is required for generate_card');
  }

  const result = await callAIAction<
    {
      targetWord: string;
      originalSentence: string;
      includePronunciation: boolean;
    },
    {
      normalizedTargetWord?: string;
      correctedTargetWord?: string;
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
    originalSentence: text,
    includePronunciation: true,
  });

  const resolvedHeadword = normalizeOptionalString(
    result.normalizedTargetWord ||
    result.correctedTargetWord ||
    result.lemma ||
    result.targetWord ||
    result.keyword
  ) || targetWord;

  return {
    keywords: [resolvedHeadword],
    suggestedWord: resolvedHeadword,
    definition: result.definition || '',
    partOfSpeech: result.partOfSpeech || result['part of speech'] || '',
    contextualExplanation: result.contextualExplanation || '',
    exampleSentence: result.example || '',
    frequentCollocations:
      result.frequentCollocations || result['Frequent collocations'] || '',
    phoneticTranscription:
      result.phoneticTranscription ||
      result.pronunciation ||
      result.ipa ||
      result.phonetic ||
      null,
    tags: Array.isArray(result.tags) ? result.tags : [],
  };
}

/**
 * 檢查 API Key 是否已配置
 */
export function isOpenAIConfigured(): boolean {
  return isAIProxyConfigured();
}
