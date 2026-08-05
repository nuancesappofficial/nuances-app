// 解析 generate_card_core_stream 的 rawContent。
// 抽成純函數，讓複雜的 `==DEF==/==TRANS==` 標記解析與 fallback JSON 解析
// 可在 Node 環境單獨測試，並縮小 generateCardContentStream 的職責。

export type CoreStreamResult = {
  definition?: string;
  sentenceTranslation?: string;
  normalizedTargetWord?: string;
  partOfSpeech?: string;
};

function extractFirstJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, index + 1);
    }
  }
  return '';
}

function getRegexText(raw: string, header: string, nextHeader?: string): string {
  const cleanRaw = raw.replace(/```(json|text|markdown)?/gi, '').replace(/```/g, '');
  const getRegex = (value: string) => new RegExp(`==\\s*${value.replace(/=/g, '')}\\s*==`, 'i');
  const startMatch = cleanRaw.match(getRegex(header));
  if (!startMatch || startMatch.index === undefined) return '';
  const contentStart = startMatch.index + startMatch[0].length;
  let content = cleanRaw.slice(contentStart);
  if (nextHeader) {
    const nextMatch = content.match(getRegex(nextHeader));
    if (nextMatch?.index !== undefined) content = content.slice(0, nextMatch.index);
  }
  return content.trim();
}

/**
 * 解析 core stream 的 rawContent。
 * 優先嘗試 `==DEF==/==TRANS==/==WORD==/==POS==` 標記格式；
 * 若無標記，則嘗試抽取第一個完整 JSON 物件。
 * 回傳 Partial 結果，由呼叫端決定如何補齊缺失欄位。
 */
export function parseCoreStream(raw: string): CoreStreamResult {
  if (raw.match(/==\s*(?:DEF|TRANS)\s*==/i)) {
    const defIndex = raw.search(/==\s*DEF\s*==/i);
    const transIndex = raw.search(/==\s*TRANS\s*==/i);
    const transComesFirst = transIndex >= 0 && defIndex >= 0 && transIndex < defIndex;
    return {
      definition: transComesFirst
        ? getRegexText(raw, '==DEF==', '==WORD==')
        : getRegexText(raw, '==DEF==', '==TRANS=='),
      sentenceTranslation: transComesFirst
        ? getRegexText(raw, '==TRANS==', '==DEF==')
        : getRegexText(raw, '==TRANS==', '==WORD=='),
      normalizedTargetWord: getRegexText(raw, '==WORD==', '==POS=='),
      partOfSpeech: getRegexText(raw, '==POS==', '==RESOLUTION=='),
    };
  }

  const coreJson = extractFirstJsonObject(raw);
  if (coreJson) {
    try {
      return JSON.parse(coreJson) as CoreStreamResult;
    } catch {
      // fall through to empty result; caller decides how to handle
    }
  }
  return {};
}
