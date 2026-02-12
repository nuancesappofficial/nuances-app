// OpenAI API Service
// 用於文本分析、定義生成等

import Constants from 'expo-constants';

const OPENAI_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_OPENAI_API_KEY || 
                       process.env.EXPO_PUBLIC_OPENAI_API_KEY;

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// API 調用限制和重試邏輯
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 秒

/**
 * 延遲函數
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 調用 OpenAI API
 */
export async function callOpenAI(
  messages: { role: string; content: any }[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const {
    model = 'gpt-4o-mini', // 使用較便宜的模型
    temperature = 0.7,
    maxTokens = 1000,
  } = options;

  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Please set EXPO_PUBLIC_OPENAI_API_KEY in .env');
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`
        );
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      console.error(`OpenAI API attempt ${attempt + 1} failed:`, error);
      
      if (attempt < MAX_RETRIES - 1) {
        await delay(RETRY_DELAY * (attempt + 1)); // 指數退避
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
  // Prompt 工程：根據學習目標調整
  const goalInstructions: Record<string, string> = {
    ielts: 'Focus on academic vocabulary suitable for IELTS exam (band 6-9). Prioritize formal, academic words.',
    casual: 'Focus on conversational vocabulary, idioms, and slang. Prioritize practical, everyday expressions.',
    professional: 'Focus on business and professional terminology. Prioritize workplace-relevant vocabulary.',
  };

  const goalInstruction = goalInstructions[learningGoal || 'ielts'];

  const prompt = `Analyze the following English text and extract 3-5 key vocabulary words that a language learner should focus on.

${goalInstruction}

${userKeywords ? `User has expressed interest in: "${userKeywords}". Prioritize these if they appear in the text.` : ''}

Text: "${text.substring(0, 500)}${text.length > 500 ? '...' : ''}"

IMPORTANT: Return ONLY a valid JSON object, without any markdown formatting or code blocks.

Required format:
{
  "keywords": ["word1", "word2", "word3"],
  "suggestedWord": "word1"
}

The "suggestedWord" should be the most important/difficult word from the keywords list.`;

  try {
    const response = await callOpenAI([
      {
        role: 'system',
        content: 'You are an expert English language teacher specialized in vocabulary acquisition. Always respond with valid JSON only, without markdown formatting or backticks.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], {
      temperature: 0.5, // 較低溫度確保一致性
      maxTokens: 200,
    });

    // 清理響應：移除可能的 markdown 格式
    let cleanedResponse = response.trim();
    
    // 移除 markdown code block 標記
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    
    console.log('[OpenAI] Cleaned response for analyzeText:', cleanedResponse);

    // 解析 JSON 響應
    const result = JSON.parse(cleanedResponse);
    return {
      keywords: result.keywords || [],
      suggestedWord: result.suggestedWord || null,
    };
  } catch (error) {
    console.error('Error analyzing text with OpenAI:', error);
    console.error('[OpenAI] Raw response was:', response);
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
  const goalContext: Record<string, string> = {
    ielts: 'This word is being learned for IELTS exam preparation. Include band level if applicable.',
    casual: 'This word is being learned for casual conversation. Include usage tips.',
    professional: 'This word is being learned for professional/business contexts.',
  };

  const context = goalContext[learningGoal || 'ielts'];

  const prompt = `Create a comprehensive vocabulary card for the word "${targetWord}" as it appears in this sentence:

"${originalSentence.substring(0, 300)}${originalSentence.length > 300 ? '...' : ''}"

${context}

IMPORTANT: Provide ONLY a valid JSON object, without any markdown formatting or code blocks.

Required format:
{
  "definition": "A clear definition in Traditional Chinese, followed by English explanation in parentheses. Format: '中文定義 (English definition)'",
  "contextualExplanation": "A detailed explanation in Traditional Chinese (2-3 sentences) about how this word is used in this specific context, including nuances, connotations, and usage tips.",
  "phoneticTranscription": "IPA phonetic transcription, e.g., /fəˈnetɪk/",
  "tags": ["Array", "of", "relevant", "tags"]
}

Tags examples: IELTS, Band 7, Business, Formal, Informal, Academic, etc.`;

  try {
    const response = await callOpenAI([
      {
        role: 'system',
        content: 'You are an expert English language teacher creating vocabulary cards. Always provide accurate, context-specific definitions in Traditional Chinese and English. Always respond with valid JSON only, without markdown formatting or backticks.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], {
      temperature: 0.7,
      maxTokens: 600,
    });

    // 清理響應：移除可能的 markdown 格式
    let cleanedResponse = response.trim();
    
    // 移除 markdown code block 標記
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    
    console.log('[OpenAI] Cleaned response for generateCardContent:', cleanedResponse.substring(0, 200) + '...');

    const result = JSON.parse(cleanedResponse);
    return {
      definition: result.definition || '',
      contextualExplanation: result.contextualExplanation || '',
      phoneticTranscription: result.phoneticTranscription || null,
      tags: result.tags || [],
    };
  } catch (error) {
    console.error('Error generating card content with OpenAI:', error);
    console.error('[OpenAI] Raw response was:', response?.substring(0, 500));
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
  return !!OPENAI_API_KEY && OPENAI_API_KEY.length > 0;
}
