// AI Analysis Service for Nuances App
// This service handles AI-powered vocabulary analysis and highlighting

import { callAIProxy, isAIProxyConfigured } from './edgeAiClient';

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

    const prompt = buildAnalysisPrompt(text, userKeywords, learningGoal);

    const aiResponse = await callAIProxy({
      provider: 'gemini',
      messages: [
        {
          role: 'user',
          content: `[System Instructions]\nYou are a language learning assistant that helps identify important vocabulary and phrases for learners.\n\n[User Query]\n${prompt}`,
        },
      ],
      options: {
        model: 'gemini-2.0-flash-lite',
        temperature: 0.7,
        maxTokens: 500,
      },
    });

    return parseAIResponse(aiResponse);
  } catch (error) {
    console.error('AI analysis error:', error);
    return mockAnalysis(text);
  }
}

/**
 * Build the analysis prompt based on user context
 */
function buildAnalysisPrompt(
  text: string,
  userKeywords?: string,
  learningGoal?: string
): string {
  let prompt = `Analyze the following text for English language learning:\n\n"${text}"\n\n`;

  if (learningGoal) {
    prompt += `User's learning goal: ${learningGoal}\n`;
  }

  if (userKeywords) {
    prompt += `User's specific interests: ${userKeywords}\n\n`;
  }

  prompt += `Please provide:
1. 3-5 key vocabulary words or phrases worth learning
2. Overall difficulty level (beginner/intermediate/advanced)
3. Suggested context for learning these terms
4. Any important collocations or idioms

Format your response as JSON:
{
  "highlightedTerms": ["term1", "term2", "term3"],
  "difficulty": "intermediate",
  "suggestedContext": "explanation here",
  "keyPhrases": ["phrase1", "phrase2"]
}`;

  return prompt;
}

/**
 * Parse AI response into structured format
 */
function parseAIResponse(response: string): AnalysisResult {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        highlightedTerms: parsed.highlightedTerms || [],
        difficulty: parsed.difficulty || 'intermediate',
        suggestedContext: parsed.suggestedContext || '',
        keyPhrases: parsed.keyPhrases || [],
      };
    }
  } catch (error) {
    console.error('Failed to parse AI response:', error);
  }

  // Fallback: extract terms from plain text
  const terms = extractTermsFromText(response);
  return {
    highlightedTerms: terms,
    difficulty: 'intermediate',
    suggestedContext: response,
    keyPhrases: [],
  };
}

/**
 * Extract potential vocabulary terms from plain text
 */
function extractTermsFromText(text: string): string[] {
  // Simple extraction: look for quoted words or capitalized words
  const quotedWords = text.match(/"([^"]+)"/g) || [];
  return quotedWords.map((w) => w.replace(/"/g, '')).slice(0, 5);
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
