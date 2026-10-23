export function balanceOnboardingQuestion(question: string): string {
  const normalized = question.trim().replace(/\s+/g, ' ');
  const containsCJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(normalized);
  if (containsCJK && normalized.length > 14) {
    const spaces = Array.from(normalized.matchAll(/ /g), (match) => match.index);
    if (spaces.length > 0) {
      const midpoint = normalized.length / 2;
      const split = spaces.reduce((best, candidate) =>
        Math.abs(candidate - midpoint) < Math.abs(best - midpoint)
          ? candidate
          : best
      );
      return `${normalized.slice(0, split).trim()}\n${normalized.slice(split + 1).trim()}`;
    }

    const characters = Array.from(normalized);
    const split = Math.ceil(characters.length / 2);
    return `${characters.slice(0, split).join('')}\n${characters.slice(split).join('')}`;
  }

  if (normalized.length <= 28) return normalized;

  const words = normalized.split(' ');
  if (words.length < 4) return normalized;

  let bestSplit = 2;
  let bestDifference = Number.POSITIVE_INFINITY;
  for (let split = 2; split <= words.length - 2; split += 1) {
    const firstLength = words.slice(0, split).join(' ').length;
    const secondLength = words.slice(split).join(' ').length;
    const difference = Math.abs(firstLength - secondLength);
    if (difference < bestDifference) {
      bestDifference = difference;
      bestSplit = split;
    }
  }

  return `${words.slice(0, bestSplit).join(' ')}\n${words.slice(bestSplit).join(' ')}`;
}

export type OnboardingLayoutMetrics = {
  isCompact: boolean;
  isCompactWidth: boolean;
  isCompactHeight: boolean;
  stickerWidth: number;
  stickerHeight: number;
  stickerSvgWidth: number;
  stickerSvgHeight: number;
  titleFontSize: number;
  titleLineHeight: number;
  titleNumberOfLines: number;
};

export function getOnboardingLayoutMetrics(
  screenWidth: number,
  screenHeight: number
): OnboardingLayoutMetrics {
  const isCompactWidth = screenWidth < 380;
  const isCompactHeight = screenHeight < 760;
  const isCompact = isCompactWidth || isCompactHeight;

  return {
    isCompact,
    isCompactWidth,
    isCompactHeight,
    stickerWidth: isCompact ? 122 : 138,
    stickerHeight: isCompact ? 68 : 88,
    stickerSvgWidth: isCompact ? 116 : 136,
    stickerSvgHeight: isCompact ? 68 : 88,
    titleFontSize: isCompact ? 23 : 27,
    titleLineHeight: isCompact ? 28 : 33,
    titleNumberOfLines: isCompact ? 3 : 2,
  };
}

