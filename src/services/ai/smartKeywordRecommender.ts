import { recommendKeywordsWithAppleIntelligence } from '../../native/AppleIntelligenceKeywordModule';
import { recommendHardKeywords } from './localKeywordRecommender';

export type SmartKeywordRecommendationResult = {
  keywords: string[];
  source: 'apple_intelligence' | 'heuristic' | 'empty';
};

export async function recommendSmartKeywords(
  text: string,
  options?: { count?: number }
): Promise<SmartKeywordRecommendationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      keywords: [],
      source: 'empty',
    };
  }

  const count = Math.max(1, Math.min(options?.count ?? 3, 3));
  const nativeResult = await recommendKeywordsWithAppleIntelligence(trimmed, count);
  const nativeKeywords = Array.isArray(nativeResult?.keywords)
    ? nativeResult!.keywords.map((word) => String(word || '').trim()).filter(Boolean)
    : [];

  if (nativeKeywords.length > 0) {
    return {
      keywords: nativeKeywords.slice(0, count),
      source: 'apple_intelligence',
    };
  }

  return {
    keywords: recommendHardKeywords(trimmed, { count }),
    source: 'heuristic',
  };
}
