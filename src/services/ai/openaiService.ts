// OpenAI API Service
// 用於文本分析、定義生成等

import { callAIAction, callAIProxy, isAIProxyConfigured } from './edgeAiClient';

// API 調用限制和重試邏輯
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 秒

/**
 * 延遲函數
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    maxTokens = 1000,
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
  learningGoal?: 'ielts' | 'casual' | 'professional'
): Promise<{
  keywords: string[];
  suggestedWord: string | null;
}> {
  try {
    const result = await callAIAction<
      {
        text: string;
        userKeywords?: string;
        learningGoal?: 'ielts' | 'casual' | 'professional';
      },
      {
        keywords: string[];
        suggestedWord: string | null;
      }
    >('analyze_text', {
      text,
      userKeywords,
      learningGoal,
    });

    return {
      keywords: result.keywords || [],
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
  learningGoal?: 'ielts' | 'casual' | 'professional'
): Promise<{
  definition: string;
  contextualExplanation: string;
  phoneticTranscription: string | null;
  tags: string[];
}> {
  try {
    const result = await callAIAction<
      {
        targetWord: string;
        originalSentence: string;
        learningGoal?: 'ielts' | 'casual' | 'professional';
      },
      {
        definition: string;
        contextualExplanation: string;
        phoneticTranscription: string | null;
        tags: string[];
      }
    >('generate_card', {
      targetWord,
      originalSentence,
      learningGoal,
    });

    return {
      definition: result.definition || '',
      contextualExplanation: result.contextualExplanation || '',
      phoneticTranscription: result.phoneticTranscription || null,
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
  learningGoal?: 'ielts' | 'casual' | 'professional'
): Promise<{
  keywords: string[];
  suggestedWord: string | null;
  definition: string;
  contextualExplanation: string;
  phoneticTranscription: string | null;
  tags: string[];
}> {
  // 步驟 1: 分析文本提取關鍵詞
  const { keywords, suggestedWord } = await analyzeText(text, userKeywords, learningGoal);

  if (!suggestedWord) {
    throw new Error('No suitable vocabulary word found in the text');
  }

  // 步驟 2: 為建議的單字生成詳細內容
  const cardContent = await generateCardContent(suggestedWord, text, learningGoal);

  return {
    keywords,
    suggestedWord,
    ...cardContent,
  };
}

/**
 * 檢查 API Key 是否已配置
 */
export function isOpenAIConfigured(): boolean {
  return isAIProxyConfigured();
}
