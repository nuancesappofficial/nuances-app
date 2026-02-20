export function extractKeywordText(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/\s*\[block:\d+\]/g, '')
    .replace(/\s*\[blocks:[\d,\s]+\]/g, '')
    .trim();
}

export function parseSelectedBlockIndexes(raw?: string | null): number[] {
  if (!raw) return [];

  const multiMatch = raw.match(/\[blocks:([\d,\s]+)\]/);
  if (multiMatch && multiMatch[1]) {
    return Array.from(
      new Set(
        multiMatch[1]
          .split(',')
          .map((token) => parseInt(token.trim(), 10))
          .filter((value) => Number.isInteger(value) && value >= 0)
      )
    ).sort((a, b) => a - b);
  }

  const singleMatch = raw.match(/\[block:(\d+)\]/);
  if (singleMatch && singleMatch[1]) {
    const value = parseInt(singleMatch[1], 10);
    return Number.isInteger(value) && value >= 0 ? [value] : [];
  }

  return [];
}

export function buildKeywordsWithSelectionMarker(
  keywordText: string,
  selectedIndexes: number[]
): string {
  const cleanKeyword = extractKeywordText(keywordText);
  if (selectedIndexes.length === 0) return cleanKeyword;

  const sorted = Array.from(new Set(selectedIndexes))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((a, b) => a - b);

  if (sorted.length === 0) return cleanKeyword;
  if (sorted.length === 1) {
    return `${cleanKeyword} [block:${sorted[0]}]`.trim();
  }

  return `${cleanKeyword} [blocks:${sorted.join(',')}]`.trim();
}
