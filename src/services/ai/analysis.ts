// AI Analysis Service for Nuances App
// This service handles AI-powered vocabulary analysis and highlighting

import { callAIAction, isAIProxyConfigured } from './edgeAiClient';

export type AnalysisResult = {
  highlightedTerms: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  suggestedContext: string;
  keyPhrases: string[];
};

/**
 * Analyze text content using Gemini API
 * Identifies key vocabulary terms based on user's learning goal
 */
export async function analyzeText(
  text: string,
  userKeywords?: string,
  learningGoal?: string
): Promise<AnalysisResult> {
  try {
    if (!isAIProxyConfigured()) {
      console.warn('AI proxy not configured, using mock analysis');
      return mockAnalysis(text);
    }

    const actionResult = await callAIAction<
      {
        text: string;
        userKeywords?: string;
        learningGoal?: string;
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
      highlightedTerms: actionResult.keywords || [],
      difficulty: 'intermediate',
      suggestedContext: actionResult.suggestedWord || '',
      keyPhrases: [],
    };
  } catch (error) {
    console.error('AI analysis error:', error);
    return mockAnalysis(text);
  }
}

/**
 * Mock analysis for development/demo purposes
 */
function mockAnalysis(text: string): AnalysisResult {
  // Extract some words from the text as mock highlighted terms
  const words = text.split(/\s+/).filter((w) => w.length > 4);
  const highlightedTerms = words.slice(0, 5);

  return {
    highlightedTerms,
    difficulty: 'intermediate',
    suggestedContext: 'This is a mock analysis. Configure OpenAI API key for real AI analysis.',
    keyPhrases: words.slice(0, 3),
  };
}

/**
 * Analyze image using OCR (Google ML Kit would be used here)
 */
export async function analyzeImage(imageUri: string): Promise<string> {
  // TODO: Integrate Google ML Kit for OCR
  // For now, return placeholder
  console.log('Image analysis not yet implemented for:', imageUri);
  return 'Image OCR will be implemented with Google ML Kit';
}
