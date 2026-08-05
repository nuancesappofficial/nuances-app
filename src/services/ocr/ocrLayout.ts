export type OCRLayoutBlock = {
  text: string;
  frame: { x: number; y: number; width: number; height: number };
};

function belongsToSameVisualLine(left: OCRLayoutBlock, right: OCRLayoutBlock): boolean {
  const leftTop = left.frame.y;
  const leftBottom = left.frame.y + left.frame.height;
  const rightTop = right.frame.y;
  const rightBottom = right.frame.y + right.frame.height;
  const overlap = Math.max(0, Math.min(leftBottom, rightBottom) - Math.max(leftTop, rightTop));
  const shorterHeight = Math.max(1, Math.min(left.frame.height, right.frame.height));
  return overlap / shorterHeight >= 0.35;
}

export function joinOCRBlocksByVisualLines(blocks: OCRLayoutBlock[]): string {
  const sorted = blocks
    .map((block) => ({ ...block, text: block.text.trim() }))
    .filter((block) => block.text)
    .sort((left, right) => left.frame.y - right.frame.y || left.frame.x - right.frame.x);
  if (!sorted.length) return '';

  const lines: OCRLayoutBlock[][] = [];
  for (const block of sorted) {
    const currentLine = lines.find((line) => line.some((lineBlock) => belongsToSameVisualLine(lineBlock, block)));
    if (currentLine) currentLine.push(block);
    else lines.push([block]);
  }

  return lines
    .sort((left, right) => left[0].frame.y - right[0].frame.y)
    .map((line) => {
      const parts = line.sort((left, right) => left.frame.x - right.frame.x).map((block) => block.text);
      const containsCJK = parts.some((part) => /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(part));
      const containsLatin = parts.some((part) => /[A-Za-z0-9]/.test(part));
      return containsCJK && !containsLatin ? parts.join('') : parts.join(' ');
    })
    .join('\n');
}
