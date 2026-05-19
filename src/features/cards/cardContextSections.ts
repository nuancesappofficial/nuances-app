export type CardContextSections = {
  sentenceTranslation: string;
  sentenceNotes: string;
  culturalBackground: string;
  exampleSentence: string;
  isStructured: boolean;
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseCardContextSections(params: {
  raw: string | undefined | null;
  displayWord: string;
  definition?: string | null;
  sourceSentence?: string | null;
  manualMode?: boolean;
}): CardContextSections {
  const raw = cleanText(params.raw);
  const displayWord = cleanText(params.displayWord);
  const definition = cleanText(params.definition);
  const sourceSentence = cleanText(params.sourceSentence);

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const sentenceTranslation = cleanText(parsed.sentenceTranslation || parsed.translation);
      const sentenceNotes = cleanText(parsed.sentenceNotes || parsed.contextNote || parsed.usageNote);
      const culturalBackground = cleanText(
        parsed.context ||
          parsed.culturalBackground ||
          parsed.culturalContext ||
          parsed.usageFit ||
          parsed.whyItFits ||
          parsed.origin ||
          parsed.slangOrigin
      );
      const exampleSentence = cleanText(parsed.exampleSentence || parsed.example || parsed.naturalExample);

      if (sentenceTranslation || sentenceNotes || culturalBackground || exampleSentence) {
        return {
          sentenceTranslation: sentenceTranslation || definition || sourceSentence || '-',
          sentenceNotes:
            sentenceNotes ||
            (params.manualMode ? 'Add your own sentence note.' : 'Context note is being prepared.'),
          culturalBackground,
          exampleSentence,
          isStructured: true,
        };
      }
    } catch {
      // Fall back to the legacy newline format below.
    }
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] || (definition ? `${displayWord}：${definition}` : sourceSentence || '-');
  const quotedWord = displayWord ? `「${displayWord}」` : '';
  const legacyTranslation =
    quotedWord && !firstLine.includes(quotedWord) ? `${quotedWord}：${firstLine}` : firstLine;

  return {
    sentenceTranslation: legacyTranslation,
    sentenceNotes:
      lines.length > 1
        ? lines.slice(1).join('\n')
        : raw || (params.manualMode ? 'Add your own sentence note.' : 'Context note is being prepared.'),
    culturalBackground: raw,
    exampleSentence: '',
    isStructured: false,
  };
}
