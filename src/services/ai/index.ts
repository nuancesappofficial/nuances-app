// AI Service - 使用 OpenAI gpt-4o-mini
import {
  isOpenAIConfigured,
  analyzeAndGenerateCard as openaiAnalyze,
  generateCardContent as openaiGenerateCardContent,
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
  const useRealAPI = isOpenAIConfigured();

  console.log(`🤖 Using ${useRealAPI ? 'OpenAI API' : 'Mock AI'} for analysis`);

  try {
    if (useRealAPI) {
      const result = await openaiAnalyze(text, userKeywords, learningGoal);
      console.log('✅ OpenAI analysis completed');
      return result;
    } else {
      console.log('⚠️ OpenAI API not configured, using Mock AI');
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
  } catch (error) {
    console.warn('Analysis error (falling back to Mock AI):', error);

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
      const result = await openaiGenerateCardContent(word, originalText, learningGoal);
      return result;
    } else {
      const {
        generateMockDefinition,
        generateMockExplanation,
        generateMockTags,
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
