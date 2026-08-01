export function normalizeCardUsageText(value: string | undefined | null): string {
  return (value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}'-]+/gu)
    ?.join(' ')
    .trim() || '';
}

export function isSameCardUsage(
  candidate: string | undefined | null,
  subject: string | undefined | null
): boolean {
  const normalizedCandidate = normalizeCardUsageText(candidate);
  const normalizedSubject = normalizeCardUsageText(subject);
  return Boolean(normalizedCandidate && normalizedSubject && normalizedCandidate === normalizedSubject);
}

export function isPhraseLikeCardSubject(
  subject: string | undefined | null,
  partOfSpeech: string | undefined | null
): boolean {
  const normalizedPartOfSpeech = normalizeCardUsageText(partOfSpeech);
  if (/(?:phrase|idiom|expression|phrasal verb)/i.test(normalizedPartOfSpeech)) return true;
  return normalizeCardUsageText(subject).split(/\s+/).filter(Boolean).length > 1;
}
