import type { OCRBlock } from './ocrService';

const COMMON_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'them',
  'my', 'your', 'his', 'their', 'our', 'this', 'that', 'these', 'those',
  'and', 'or', 'but', 'if', 'so', 'for', 'to', 'of', 'in', 'on', 'at', 'by',
  'with', 'from', 'as', 'about', 'into', 'over', 'after', 'before', 'up', 'down',
  'can', 'could', 'may', 'might', 'will', 'would', 'should', 'must', 'do', 'does',
  'did', 'have', 'has', 'had', 'not', 'no', 'yes', 'just', 'very', 'more', 'most',
]);

const GOAL_HINTS: Record<string, string[]> = {
  ielts: ['however', 'therefore', 'furthermore', 'significant', 'evidence', 'argument', 'whereas'],
  professional: ['stakeholder', 'timeline', 'roadmap', 'deliverable', 'alignment', 'workflow', 'budget'],
  casual: ['wanna', 'gonna', 'kinda', 'hangout', 'chill', 'awkward', 'vibe'],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreBlock(
  block: OCRBlock,
  index: number,
  blocks: OCRBlock[],
  learningGoal?: string
): number {
  const text = block.text.trim();
  if (!text) return -999;

  const tokens = tokenize(text);
  if (tokens.length === 0) return -999;

  const joined = tokens.join(' ');
  const baseLen = Math.min(1.2, text.length / 12);
  const alphaBonus = /[a-z]/i.test(text) ? 0.35 : -0.3;
  const stopwordPenalty = tokens.every((token) => COMMON_STOPWORDS.has(token)) ? -0.8 : 0;
  const uniqueRatio = new Set(tokens).size / tokens.length;
  const uniquenessBonus = uniqueRatio * 0.5;

  let goalBonus = 0;
  if (learningGoal && GOAL_HINTS[learningGoal]) {
    const hints = GOAL_HINTS[learningGoal];
    if (hints.some((hint) => joined.includes(hint))) {
      goalBonus += 0.6;
    }
  }

  // Slightly prioritize earlier blocks to reduce random jumps across image.
  const positionBonus = Math.max(0, 0.3 - index * 0.01);
  const duplicateCount = blocks.filter(
    (candidate) => candidate.text.trim().toLowerCase() === text.toLowerCase()
  ).length;
  const duplicatePenalty = duplicateCount > 1 ? 0.2 : 0;

  return baseLen + alphaBonus + uniquenessBonus + goalBonus + positionBonus - stopwordPenalty - duplicatePenalty;
}

export function recommendBlockIndexes(
  blocks: OCRBlock[],
  options?: {
    count?: number;
    learningGoal?: string;
  }
): number[] {
  const count = Math.max(1, Math.min(options?.count ?? 5, 10));

  const ranked = blocks
    .map((block, index) => ({
      index,
      score: scoreBlock(block, index, blocks, options?.learningGoal),
      text: block.text.trim().toLowerCase(),
    }))
    .filter((item) => item.score > -500)
    .sort((a, b) => b.score - a.score);

  const result: number[] = [];
  const seen = new Set<string>();

  for (const item of ranked) {
    if (seen.has(item.text)) continue;
    result.push(item.index);
    seen.add(item.text);
    if (result.length >= count) break;
  }

  return result.sort((a, b) => a - b);
}
