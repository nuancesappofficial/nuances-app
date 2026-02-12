// AI Service - 智能選擇使用 OpenAI 或 Mock
import { 
  isOpenAIConfigured, 
  analyzeAndGenerateCard as openaiAnalyze 
} from './openaiService';
import { analyzeCachedItem as mockAnalyze } from './mockAnalyzer';

export interface AnalysisResult {
  keywords: string[];
  suggestedWord: string | null;
  definition: string;
  contextualExplanation: string;
  phoneticTranscription: string | null;
  tags: string[];
}

/**
 * 智能分析服務
 * - 如果 OpenAI API 已配置，使用真實 API
 * - 否則回退到 Mock AI
 */
export async function analyzeText(
  text: string,
  userKeywords?: string,
  learningGoal?: 'ielts' | 'casual' | 'professional'
): Promise<AnalysisResult> {
  // 檢查是否配置了 OpenAI API
  const useRealAPI = isOpenAIConfigured();

  console.log(`🤖 Using ${useRealAPI ? 'OpenAI API' : 'Mock AI'} for analysis`);

  try {
    if (useRealAPI) {
      // 使用真實的 OpenAI API
      const result = await openaiAnalyze(text, userKeywords, learningGoal);
      console.log('✅ OpenAI analysis completed');
      return result;
    } else {
      // 回退到 Mock AI
      console.log('⚠️ OpenAI API not configured, using Mock AI');
      const mockResult = mockAnalyze(text, userKeywords);
      
      // 將 Mock 結果轉換為標準格式
      return {
        keywords: mockResult.keywords,
        suggestedWord: mockResult.suggestedWord,
        definition: mockResult.definition,
        contextualExplanation: mockResult.explanation,
        phoneticTranscription: mockResult.phonetic,
        tags: mockResult.tags,
      };
    }
  } catch (error) {
    console.error('Analysis error:', error);
    
    // 如果 OpenAI 失敗，回退到 Mock
    if (useRealAPI) {
      console.log('⚠️ OpenAI failed, falling back to Mock AI');
      const mockResult = mockAnalyze(text, userKeywords);
      return {
        keywords: mockResult.keywords,
        suggestedWord: mockResult.suggestedWord,
        definition: mockResult.definition,
        contextualExplanation: mockResult.explanation,
        phoneticTranscription: mockResult.phonetic,
        tags: mockResult.tags,
      };
    }
    
    throw error;
  }
}

/**
 * 檢查是否使用真實 API
 */
export function isUsingRealAPI(): boolean {
  return isOpenAIConfigured();
}

/**
 * 為特定單字生成內容（用於用戶選擇不同的單字時）
 */
export async function generateContentForWord(
  word: string,
  originalText: string,
  learningGoal?: 'ielts' | 'casual' | 'professional'
): Promise<Omit<AnalysisResult, 'keywords' | 'suggestedWord'>> {
  const useRealAPI = isOpenAIConfigured();

  try {
    if (useRealAPI) {
      const { generateCardContent } = await import('./openaiService');
      const result = await generateCardContent(word, originalText, learningGoal);
      return result;
    } else {
      // Mock 版本
      const { 
        generateMockDefinition, 
        generateMockExplanation, 
        generateMockTags 
      } = await import('./mockAnalyzer');
      
      return {
        definition: generateMockDefinition(word),
        contextualExplanation: generateMockExplanation(word, originalText),
        phoneticTranscription: null,
        tags: generateMockTags(word),
      };
    }
  } catch (error) {
    console.error('Error generating content for word:', error);
    throw error;
  }
}

// 重新導出類型
export type { AnalysisResult };
