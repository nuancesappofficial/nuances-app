// Google Gemini API Service
// 用於文本分析、定義生成等
// 使用多模型回退策略：優先使用最新模型，失敗時自動降級

import { callAIProxy, isAIProxyConfigured } from './edgeAiClient';

// Gemini 模型列表（按優先順序排列）
const GEMINI_MODELS = [
  'gemini-3-flash-preview',      // 1. Gemini 3 Flash (最新，2026 主力)
  'gemini-2.0-flash-lite',       // 2. Gemini 2.0 Flash Lite (穩定 fallback)
];

let currentModelIndex = 0; // 當前使用的模型索引

// API 調用限制和重試邏輯
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 秒

/**
 * 延遲函數
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 調用 Gemini API
 * 注意：Gemini 的請求格式與 OpenAI 不同
 */
export async function callGemini(
  messages: { role: string; content: any }[],
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const {
    temperature = 0.7,
    maxTokens = 1000,
  } = options;

  if (!isAIProxyConfigured()) {
    throw new Error(
      'AI proxy not configured. Please set Supabase env and deploy Edge Function.'
    );
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const currentModel = GEMINI_MODELS[currentModelIndex];
      console.log(`[Gemini] Using model: ${currentModel} (attempt ${attempt + 1}/${MAX_RETRIES})`);

      const text = await callAIProxy({
        provider: 'gemini',
        messages,
        options: {
          model: currentModel,
          temperature,
          maxTokens,
        },
      });

      if (!text) {
        throw new Error('Gemini returned empty response');
      }
      
      console.log(`[Gemini] ✅ Success with model: ${currentModel}`);
      return text;
    } catch (error) {
      console.error(`Gemini API attempt ${attempt + 1} failed:`, error);

      if (currentModelIndex < GEMINI_MODELS.length - 1) {
        currentModelIndex += 1;
      }
      
      if (attempt < MAX_RETRIES - 1) {
        await delay(RETRY_DELAY * (attempt + 1)); // 指數退避
      } else {
        throw error;
      }
    }
  }

  throw new Error('Gemini API failed after multiple retries');
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
  const prompt = `Extract 1 key vocabulary word from the following text:

Text: "${text.substring(0, 500)}${text.length > 500 ? '...' : ''}"

${userKeywords ? `User has expressed interest in: "${userKeywords}". Prioritize these if they appear in the text.` : ''}

CRITICAL INSTRUCTIONS:
1. You MUST return ONLY a JSON object
2. Do NOT include any text before or after the JSON
3. Do NOT use markdown code blocks or backticks
4. Do NOT include explanations

Return this exact JSON structure:
{
  "keywords": ["word1"],
  "suggestedWord": "word1"
}

The "suggestedWord" should be the most important/difficult word from the keywords list.`;

  let response = '';
  let cleanedResponse = '';
  let lastError: Error | null = null;
  
  // 最多重試 2 次以獲取有效的 JSON
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await callGemini([
        {
          role: 'system',
          content: 'You are a language learning assistant. You MUST respond with ONLY valid JSON in the exact format requested. Do not include any explanations, markdown, or extra text.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ], {
        temperature: 0.3, // 更低溫度確保 JSON 格式一致性
        maxTokens: 1024, // 足夠空間避免回應被截斷
      });

      // 清理響應：移除可能的 markdown 格式和多餘文字
      cleanedResponse = response.trim();
      
      // 移除 markdown code block 標記
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }
      
      // 嘗試提取 JSON 對象（尋找 { 到 } 之間的內容）
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }
      
      console.log('[Gemini] Cleaned response for analyzeText (attempt ' + (attempt + 1) + '):', cleanedResponse.substring(0, 200));

      // 解析 JSON 響應
      let result: { keywords?: string[]; suggestedWord?: string | null };
      try {
        result = JSON.parse(cleanedResponse);
      } catch (parseError) {
        // 若為截斷的 JSON，嘗試修復並擷取已有關鍵字
        const repaired = tryRepairTruncatedKeywordsJson(cleanedResponse);
        if (repaired) {
          console.log('[Gemini] Repaired truncated JSON, using', repaired.keywords.length, 'keywords');
          return repaired;
        }
        throw parseError;
      }
      
      // 驗證必要欄位
      if (!result.keywords || !Array.isArray(result.keywords)) {
        throw new Error('Invalid response: missing keywords array');
      }
      
      return {
        keywords: (result.keywords || []).slice(0, 1),
        suggestedWord: result.suggestedWord ?? null,
      };
    } catch (error) {
      lastError = error as Error;
      console.error(`Error analyzing text with Gemini (attempt ${attempt + 1}):`, error);
      if (response) {
        // 先嘗試修復清理後的字串，再嘗試原始回應
        const repaired = tryRepairTruncatedKeywordsJson(cleanedResponse || response) || tryRepairTruncatedKeywordsJson(response);
        if (repaired) {
          console.log('[Gemini] Repaired truncated response, using', repaired.keywords.length, 'keywords');
          return repaired;
        }
        console.error('[Gemini] Raw response that failed to parse:', response.substring(0, 500));
      }
      
      // 如果不是最後一次嘗試，等待後重試
      if (attempt < 1) {
        console.log('[Gemini] Retrying...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  // 所有重試都失敗
  throw lastError || new Error('Failed to get valid response from Gemini');
}

/**
 * 嘗試修復被截斷的 analyzeText JSON（例如缺少結尾 "], "suggestedWord": "..." }）
 * 從不完整字串中擷取已輸出的 keywords 並回傳可用結果
 */
function tryRepairTruncatedKeywordsJson(raw: string): { keywords: string[]; suggestedWord: string | null } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('"keywords"')) return null;
  const arrStart = trimmed.indexOf('[');
  if (arrStart === -1) return null;
  const afterBracket = trimmed.slice(arrStart + 1);
  // 匹配 "完整詞" 或 結尾未閉合的 "詞
  const tokens: string[] = [];
  let i = 0;
  while (i < afterBracket.length) {
    if (afterBracket[i] === '"') {
      i += 1;
      let word = '';
      while (i < afterBracket.length && afterBracket[i] !== '"') {
        if (afterBracket[i] === '\\') {
          i += 1;
          if (i < afterBracket.length) word += afterBracket[i];
          i += 1;
          continue;
        }
        word += afterBracket[i];
        i += 1;
      }
      if (word.trim().length > 0) tokens.push(word.trim());
      if (i < afterBracket.length) i += 1; // skip closing "
    } else if (afterBracket[i] === ',' || afterBracket[i] === ' ' || afterBracket[i] === '\n') {
      i += 1;
    } else {
      i += 1;
    }
  }
  if (tokens.length === 0) return null;
  return {
    keywords: tokens,
    suggestedWord: tokens[tokens.length - 1] ?? null,
  };
}

/**
 * 嘗試從截斷的 generateCardContent JSON 中擷取已有欄位
 * 至少回傳與 targetWord 相關的預設內容，避免拋錯
 */
function tryRepairTruncatedCardJson(
  raw: string,
  targetWord: string
): { definition: string; contextualExplanation: string; phoneticTranscription: string | null; tags: string[] } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  const out = {
    definition: '',
    contextualExplanation: '',
    phoneticTranscription: null as string | null,
    tags: [] as string[],
  };
  // 簡易擷取 "definition": "..."（可能未閉合）
  const defMatch = trimmed.match(/"definition"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (defMatch) out.definition = defMatch[1].replace(/\\(.)/g, '$1').trim();
  const ctxMatch = trimmed.match(/"contextualExplanation"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (ctxMatch) out.contextualExplanation = ctxMatch[1].replace(/\\(.)/g, '$1').trim();
  const phMatch = trimmed.match(/"phoneticTranscription"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (phMatch) out.phoneticTranscription = phMatch[1].replace(/\\(.)/g, '$1').trim() || null;
  const tagsMatch = trimmed.match(/"tags"\s*:\s*\[(.*?)\]/s);
  if (tagsMatch) {
    const tagsStr = tagsMatch[1];
    const tagTokens: string[] = [];
    let i = 0;
    while (i < tagsStr.length) {
      if (tagsStr[i] === '"') {
        i += 1;
        let word = '';
        while (i < tagsStr.length && tagsStr[i] !== '"') {
          if (tagsStr[i] === '\\') { i += 1; if (i < tagsStr.length) word += tagsStr[i]; i += 1; continue; }
          word += tagsStr[i]; i += 1;
        }
        if (word.trim()) tagTokens.push(word.trim());
        if (i < tagsStr.length) i += 1;
      } else i += 1;
    }
    out.tags = tagTokens;
  }
  // 若至少有一個欄位有內容，或我們能回傳預設，就當作修復成功
  if (out.definition || out.contextualExplanation || out.phoneticTranscription || out.tags.length > 0) {
    return out;
  }
  // 完全無法解析時回傳與 targetWord 相關的預設，避免拋錯
  out.definition = `「${targetWord}」的定義（回應不完整，請稍後再試或手動編輯）`;
  out.contextualExplanation = 'AI 回應被截斷，請手動補充說明。';
  return out;
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
  const prompt = `What does "${targetWord}" mean in this sentence: "${originalSentence.substring(0, 300)}${originalSentence.length > 300 ? '...' : ''}"?

CRITICAL INSTRUCTIONS:
1. You MUST return ONLY a JSON object
2. Do NOT include any text before or after the JSON
3. Do NOT use markdown code blocks or backticks
4. Do NOT include explanations

Return this exact JSON structure:
{
  "definition": "A clear definition in Traditional Chinese, followed by English explanation in parentheses. Format: '中文定義 (English definition)'",
  "contextualExplanation": "A detailed explanation in Traditional Chinese (2-3 sentences) about how this word is used in this specific context, including nuances, connotations, and usage tips.",
  "phoneticTranscription": "IPA phonetic transcription, e.g., /fəˈnetɪk/",
  "tags": ["Array", "of", "relevant", "tags"]
}`;

  let response = '';
  try {
    response = await callGemini([
      {
        role: 'system',
        content: 'You are a language learning assistant. You MUST respond with ONLY valid JSON in the exact format requested. Do not include any explanations, markdown, or extra text. Always provide accurate, context-specific definitions in Traditional Chinese and English.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], {
      temperature: 0.5,
      maxTokens: 1024, // 提高以減少截斷
    });

    // 清理響應：移除可能的 markdown 格式和多餘文字
    let cleanedResponse = response.trim();
    
    // 移除 markdown code block 標記
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    
    // 嘗試提取 JSON 對象（尋找 { 到 } 之間的內容）
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }
    
    console.log('[Gemini] Cleaned response for generateCardContent:', cleanedResponse.substring(0, 200) + '...');

    let result: { definition?: string; contextualExplanation?: string; phoneticTranscription?: string | null; tags?: string[] };
    try {
      result = JSON.parse(cleanedResponse);
    } catch (parseError) {
      // 回應被截斷時嘗試擷取已有欄位，避免直接拋錯
      const repaired = tryRepairTruncatedCardJson(cleanedResponse || response, targetWord);
      if (repaired) {
        console.log('[Gemini] Repaired truncated card JSON, using partial content');
        return repaired;
      }
      throw parseError;
    }
    return {
      definition: result.definition || '',
      contextualExplanation: result.contextualExplanation || '',
      phoneticTranscription: result.phoneticTranscription ?? null,
      tags: Array.isArray(result.tags) ? result.tags : [],
    };
  } catch (error) {
    console.error('Error generating card content with Gemini:', error);
    if (response) {
      const repaired = tryRepairTruncatedCardJson(response, targetWord);
      if (repaired) {
        console.log('[Gemini] Repaired raw truncated card response');
        return repaired;
      }
      console.error('[Gemini] Raw response that failed to parse:', response.substring(0, 500));
    }
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
export function isGeminiConfigured(): boolean {
  return isAIProxyConfigured();
}

/**
 * 獲取當前使用的模型名稱
 */
export function getCurrentModel(): string {
  return GEMINI_MODELS[currentModelIndex];
}

/**
 * 重置模型索引（用於測試或手動重置）
 */
export function resetModelFallback(): void {
  currentModelIndex = 0;
  console.log('[Gemini] Model fallback reset to primary model');
}
