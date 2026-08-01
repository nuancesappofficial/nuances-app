const CJK_SCRIPT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;

export function getLearningTermQuotePair(term: string): readonly [string, string] {
  return CJK_SCRIPT_PATTERN.test(term) ? ['「', '」'] : ['“', '”'];
}

export function formatQuotedLearningTerm(term: string): string {
  const trimmed = (term || '').trim();
  if (!trimmed) return '';
  const [openQuote, closeQuote] = getLearningTermQuotePair(trimmed);
  return `${openQuote}${trimmed}${closeQuote}`;
}

export function quoteLearningTermInText(text: string, term: string): string {
  const trimmedText = (text || '').trim();
  const trimmedTerm = (term || '').trim();
  if (!trimmedText || !trimmedTerm) return trimmedText;

  const [openQuote, closeQuote] = getLearningTermQuotePair(trimmedTerm);
  const escapedTerm = trimmedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alreadyQuoted = new RegExp(
    `[「『“"'‘]\\s*(${escapedTerm})\\s*[」』”"'’]`,
    'i'
  );
  if (alreadyQuoted.test(trimmedText)) {
    return trimmedText.replace(
      alreadyQuoted,
      (_match, matchedTerm: string) => `${openQuote}${matchedTerm}${closeQuote}`
    );
  }

  const matcher = new RegExp(escapedTerm, 'i');
  return matcher.test(trimmedText)
    ? trimmedText.replace(matcher, (match) => `${openQuote}${match}${closeQuote}`)
    : trimmedText;
}
