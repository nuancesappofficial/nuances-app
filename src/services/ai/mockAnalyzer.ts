// Mock AI Analyzer - 簡單的文本分析
// 待替換為真實的 OpenAI API

/**
 * 提取文本中的關鍵詞
 */
export function extractKeywords(text: string, maxKeywords: number = 5): string[] {
  if (!text) return [];

  // 移除標點符號並轉小寫
  const cleaned = text.toLowerCase().replace(/[.,!?;:"'()[\]{}]/g, ' ');
  const words = cleaned.split(/\s+/).filter(w => w.length > 3);
  
  // 常見停用詞
  const stopWords = new Set([
    'the', 'and', 'that', 'have', 'with', 'this', 'from', 'they', 
    'will', 'would', 'there', 'their', 'what', 'about', 'which', 
    'when', 'make', 'like', 'time', 'just', 'know', 'take', 'people',
    'into', 'year', 'your', 'good', 'some', 'could', 'them', 'than',
    'been', 'were', 'said', 'each', 'these', 'after', 'before',
    'though', 'through', 'because', 'however', 'therefore', 'being',
  ]);
  
  // 過濾並選擇較長的詞（可能是關鍵詞）
  const keywords = words
    .filter(w => w.length >= 6) // 至少 6 個字母
    .filter(w => !stopWords.has(w))
    .filter(w => /^[a-z]+$/.test(w)) // 只包含字母
    .slice(0, maxKeywords * 2); // 先取兩倍數量
  
  // 去重並限制數量
  return [...new Set(keywords)].slice(0, maxKeywords);
}

/**
 * 為單字生成簡單的定義（Mock）
 * 真實實現應該調用 OpenAI API
 */
export function generateMockDefinition(word: string): string {
  const mockDefinitions: Record<string, string> = {
    'ephemeral': '短暫的；轉瞬即逝的 (lasting for a very short time)',
    'resilience': '韌性；復原力 (the ability to recover quickly from difficulties)',
    'arduous': '艱難的；費力的 (involving or requiring strenuous effort)',
    'ambiguous': '模稜兩可的 (having more than one possible meaning)',
    'perplexed': '困惑的 (completely baffled)',
    'serendipity': '意外發現珍奇事物的運氣 (finding valuable things by chance)',
    'pragmatic': '務實的；講求實際的 (dealing with things in a practical way)',
    'nuance': '細微差別 (a subtle difference in meaning)',
    'cognitive': '認知的 (related to the mental process of understanding)',
    'paradigm': '典範；範例 (a typical example or pattern)',
  };

  // 如果有預定義的，返回預定義的
  if (mockDefinitions[word.toLowerCase()]) {
    return mockDefinitions[word.toLowerCase()];
  }

  // 否則返回通用模板
  return `${word} 的定義（待填寫）\n提示：請查詞典或使用 AI 生成定義`;
}

/**
 * 生成情境解釋（Mock）
 */
export function generateMockExplanation(word: string, context: string): string {
  const mockExplanations: Record<string, string> = {
    'ephemeral': '用來描述持續時間很短、很快就會消失的事物，常用於文學或哲學語境中描述短暫的美好時光。',
    'resilience': '指面對困難、壓力或創傷後快速恢復的能力，是心理學和個人發展中的重要概念。',
    'arduous': '形容需要付出大量努力和體力的任務或旅程，強調過程的艱辛和挑戰性。',
    'ambiguous': '用於描述不清楚、有多種解釋可能的情況，常見於複雜的溝通或政策表述中。',
    'pragmatic': '強調以實際效果和可行性為導向的思考方式，常用於商業和決策情境。',
  };

  if (mockExplanations[word.toLowerCase()]) {
    return mockExplanations[word.toLowerCase()];
  }

  return `在這個情境中，"${word}" 用來表達特定的含義。建議根據上下文進一步理解其用法。`;
}

/**
 * 根據單字推薦標籤（Mock）
 */
export function generateMockTags(word: string): string[] {
  const wordToTags: Record<string, string[]> = {
    'ephemeral': ['IELTS', 'Advanced', 'Literature'],
    'resilience': ['IELTS', 'Psychology', 'Character'],
    'arduous': ['IELTS', 'Intermediate'],
    'ambiguous': ['IELTS', 'Advanced', 'Academic'],
    'pragmatic': ['IELTS', 'Business', 'Academic'],
    'serendipity': ['Advanced', 'Vocabulary'],
  };

  if (wordToTags[word.toLowerCase()]) {
    return wordToTags[word.toLowerCase()];
  }

  // 默認標籤
  return ['Vocabulary'];
}

/**
 * 完整的 Mock AI 分析
 */
export interface MockAnalysisResult {
  keywords: string[];
  suggestedWord: string | null;
  definition: string;
  explanation: string;
  tags: string[];
  phonetic: string | null;
}

export function analyzeCachedItem(
  contentText: string,
  userKeywords?: string
): MockAnalysisResult {
  // 1. 提取關鍵詞
  const keywords = extractKeywords(contentText);
  
  // 2. 優先使用用戶提供的關鍵字
  let suggestedWord: string | null = null;
  if (userKeywords) {
    const userWords = userKeywords.split(',').map(w => w.trim()).filter(w => w.length > 0);
    suggestedWord = userWords[0] || null;
  }
  
  // 如果沒有用戶關鍵字，使用 AI 提取的第一個
  if (!suggestedWord && keywords.length > 0) {
    suggestedWord = keywords[0];
  }

  // 3. 生成定義和解釋
  const definition = suggestedWord 
    ? generateMockDefinition(suggestedWord)
    : '';
  
  const explanation = suggestedWord
    ? generateMockExplanation(suggestedWord, contentText)
    : '';

  // 4. 生成標籤
  const tags = suggestedWord
    ? generateMockTags(suggestedWord)
    : [];

  return {
    keywords,
    suggestedWord,
    definition,
    explanation,
    tags,
    phonetic: null, // Mock 不生成音標
  };
}
