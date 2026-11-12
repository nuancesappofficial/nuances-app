// One-line meaning shown under the word in album card lists.
export function getCardMeaningPreview(definition: string | null | undefined): string {
  const firstLine = (definition || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine || firstLine === '-') return '';
  return firstLine.replace(/^(?:\d+[.)、]|[•·\-–*])\s*/, '').trim();
}
