import { NativeModules, Platform } from 'react-native';

type AppleIntelligenceKeywordResponse = {
  keywords?: string[];
  source?: string;
};

type AppleIntelligenceKeywordModuleType = {
  recommendKeywords: (
    text: string,
    count: number
  ) => Promise<AppleIntelligenceKeywordResponse>;
};

const nativeModule = (
  NativeModules.AppleIntelligenceKeywordModule || null
) as AppleIntelligenceKeywordModuleType | null;

export function isAppleIntelligenceKeywordModuleAvailable(): boolean {
  return Platform.OS === 'ios' && !!nativeModule?.recommendKeywords;
}

export async function recommendKeywordsWithAppleIntelligence(
  text: string,
  count: number
): Promise<AppleIntelligenceKeywordResponse | null> {
  if (!isAppleIntelligenceKeywordModuleAvailable() || !nativeModule) {
    return null;
  }

  try {
    return await nativeModule.recommendKeywords(text, count);
  } catch {
    return null;
  }
}
