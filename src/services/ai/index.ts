// AI Service
import { analyzeCachedItem as mockAnalyze } from './mockAnalyzer';
import {
  analyzeAndGenerateCard,
  generateCardContent,
  isOpenAIConfigured,
} from './aiActionService';
import { isPremiumFeatureError } from './edgeAiClient';
import type { AIPersonalizationOptions } from './types';

export type { AIPersonalizationOptions } from './types';

export interface AnalysisResult {
  keywords: string[];
  suggestedWord: string | null;
  definition: string;
  partOfSpeech: string;
  contextualExplanation: string;
  exampleSentence: string;
  frequentCollocations: string;
  phoneticTranscription: string | null;
  tags: string[];
}

/**
 * 智能分析服務
 * - 如果 AI proxy 已配置，使用真實後端 AI
 * - 否則回退到 Mock AI
 */
export async function analyzeText(
  text: string,
  userKeywords?: string,
  personalization?: AIPersonalizationOptions
): Promise<AnalysisResult> {
  const useRealAPI = isOpenAIConfigured();

  try {
    if (useRealAPI) {
      return await analyzeAndGenerateCard(text, userKeywords, personalization);
    }

    const mockResult = mockAnalyze(text, userKeywords);
    return {
      keywords: mockResult.keywords,
      suggestedWord: mockResult.suggestedWord,
      definition: mockResult.definition,
      partOfSpeech: '',
      contextualExplanation: mockResult.explanation,
      exampleSentence: '',
      frequentCollocations: '',
      phoneticTranscription: mockResult.phonetic,
      tags: mockResult.tags,
    };
  } catch (error) {
    console.warn('Analysis error (fallback to Mock AI):', error);
    const mockResult = mockAnalyze(text, userKeywords);
    return {
      keywords: mockResult.keywords,
      suggestedWord: mockResult.suggestedWord,
      definition: mockResult.definition,
      partOfSpeech: '',
      contextualExplanation: mockResult.explanation,
      exampleSentence: '',
      frequentCollocations: '',
      phoneticTranscription: mockResult.phonetic,
      tags: mockResult.tags,
    };
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
  personalization?: AIPersonalizationOptions
): Promise<
  Omit<AnalysisResult, 'keywords'> & {
    suggestedWord: string | null;
    isPartOfPhrase?: boolean;
    detectedPhrase?: string;
  }
> {
  try {
    if (isOpenAIConfigured()) {
      const generated = await generateCardContent(word, originalText, personalization);
      return {
        suggestedWord: generated.normalizedTargetWord || word,
        isPartOfPhrase: generated.isPartOfPhrase,
        detectedPhrase: generated.detectedPhrase,
        definition: generated.definition,
        partOfSpeech: generated.partOfSpeech,
        contextualExplanation: generated.contextualExplanation,
        exampleSentence: generated.example,
        frequentCollocations: generated.frequentCollocations,
        phoneticTranscription: generated.phoneticTranscription,
        tags: generated.tags,
      };
    }

    const {
      generateMockDefinition,
      generateMockExplanation,
      generateMockTags,
    } = await import('./mockAnalyzer');

    return {
      suggestedWord: word,
      isPartOfPhrase: false,
      detectedPhrase: '',
      definition: generateMockDefinition(word),
      partOfSpeech: '',
      contextualExplanation: generateMockExplanation(word, originalText),
      exampleSentence: '',
      frequentCollocations: '',
      phoneticTranscription: null,
      tags: generateMockTags(word),
    };
  } catch (error) {
    if (!isPremiumFeatureError(error)) {
      console.error('Error generating content for word:', error);
    }
    throw error;
  }
}
