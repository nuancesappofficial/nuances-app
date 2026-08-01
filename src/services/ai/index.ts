// AI Service
import {
  generateCardContent,
  generateCardContentStream,
  getDefaultExperienceCardContentForLanguage,
  isOpenAIConfigured,
} from './aiActionService';
import { isPremiumFeatureError } from './edgeAiClient';
import type { AIPersonalizationOptions } from './types';

export type { AIPersonalizationOptions } from './types';

export interface AnalysisResult {
  keywords: string[];
  suggestedWord: string | null;
  isLikelyTypo?: boolean;
  correctedTargetWord?: string | null;
  typoReason?: string;
  definition: string;
  partOfSpeech: string;
  contextualExplanation: string;
  exampleSentence: string;
  frequentCollocations: string;
  semanticRelations: string;
  phoneticTranscription: string | null;
  tags: string[];
}

/**
 * 智能分析服務
 * - 如果 AI proxy 已配置，使用真實後端 AI
 * - 否則回退到 Mock AI
 */
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
    isLikelyTypo?: boolean;
    correctedTargetWord?: string | null;
    typoReason?: string;
    isPartOfPhrase?: boolean;
    detectedPhrase?: string;
  }
> {
  try {
    if (isOpenAIConfigured()) {
      const generated = await generateCardContent(word, originalText, personalization);
      return {
        suggestedWord: generated.normalizedTargetWord || word,
        isLikelyTypo: generated.isLikelyTypo,
        correctedTargetWord: generated.correctedTargetWord,
        typoReason: generated.typoReason,
        isPartOfPhrase: generated.isPartOfPhrase,
        detectedPhrase: generated.detectedPhrase,
        definition: generated.definition,
        partOfSpeech: generated.partOfSpeech,
        contextualExplanation: generated.contextualExplanation,
        exampleSentence: generated.example,
        frequentCollocations: generated.frequentCollocations,
        semanticRelations: generated.semanticRelations,
        phoneticTranscription: generated.phoneticTranscription,
        tags: generated.tags,
      };
    }

    throw new Error(
      'AI proxy is not configured in this build. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
    );
  } catch (error) {
    if (!isPremiumFeatureError(error)) {
      console.error('Error generating content for word:', error);
    }
    throw error;
  }
}

export async function generateContentForWordStream(
  word: string,
  originalText: string,
  personalization?: AIPersonalizationOptions,
  handlers: {
    onToken?: (delta: string) => void;
    onFirstToken?: () => void;
  } = {}
): Promise<
  Omit<AnalysisResult, 'keywords'> & {
    suggestedWord: string | null;
    isLikelyTypo?: boolean;
    correctedTargetWord?: string | null;
    typoReason?: string;
    isPartOfPhrase?: boolean;
    detectedPhrase?: string;
  }
> {
  try {
    if (isOpenAIConfigured()) {
      const generated = await generateCardContentStream(word, originalText, personalization, handlers);
      return {
        suggestedWord: generated.normalizedTargetWord || word,
        isLikelyTypo: generated.isLikelyTypo,
        correctedTargetWord: generated.correctedTargetWord,
        typoReason: generated.typoReason,
        isPartOfPhrase: generated.isPartOfPhrase,
        detectedPhrase: generated.detectedPhrase,
        definition: generated.definition,
        partOfSpeech: generated.partOfSpeech,
        contextualExplanation: generated.contextualExplanation,
        exampleSentence: generated.example,
        frequentCollocations: generated.frequentCollocations,
        semanticRelations: generated.semanticRelations,
        phoneticTranscription: generated.phoneticTranscription,
        tags: generated.tags,
      };
    }

    throw new Error(
      'AI proxy is not configured in this build. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
    );
  } catch (error) {
    if (!isPremiumFeatureError(error)) {
      console.error('Error streaming content for word:', error);
    }
    throw error;
  }
}

export async function generateDefaultExperienceCardContent(
  personalization?: AIPersonalizationOptions
): Promise<Awaited<ReturnType<typeof generateContentForWord>>> {
  const generated = await getDefaultExperienceCardContentForLanguage(
    personalization?.replyLanguage
  );
  return {
    suggestedWord: generated.normalizedTargetWord || 'nuances',
    isLikelyTypo: generated.isLikelyTypo,
    correctedTargetWord: generated.correctedTargetWord,
    typoReason: generated.typoReason,
    isPartOfPhrase: generated.isPartOfPhrase,
    detectedPhrase: generated.detectedPhrase,
    definition: generated.definition,
    partOfSpeech: generated.partOfSpeech,
    contextualExplanation: generated.contextualExplanation,
    exampleSentence: generated.example,
    frequentCollocations: generated.frequentCollocations,
    semanticRelations: generated.semanticRelations,
    phoneticTranscription: generated.phoneticTranscription,
    tags: generated.tags,
  };
}
