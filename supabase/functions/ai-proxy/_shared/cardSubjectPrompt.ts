export const CARD_SUBJECT_SELECTION_INSTRUCTION = [
  'Resolve the card subject in this exact order.',
  'First localize the whole source sentence naturally, then identify the target word’s corresponding meaning in that localization and its part of speech in context.',
  'Next produce the target word’s genuine single-word lemma for that part of speech.',
  'Then decide whether that lemma by itself preserves the target’s corresponding contextual meaning.',
  'If the lemma preserves the meaning, use the lemma as the card subject and do not run phrase promotion; put longer reusable patterns in collocations.',
  'Example: for script meaning a written plan, use subject "script", partOfSpeech "noun", and place "stick to the script" and "go off script" in collocations.',
  'Only if the lemma does not preserve the meaning, find the shortest complete established expression in the source sentence that does preserve it.',
  'Canonicalize variable pronouns in reusable expressions: "let you down" becomes "let someone down", partOfSpeech "phrasal verb"; "lead you on" becomes "lead someone on", partOfSpeech "phrasal verb".',
  'For resolution metadata, detectedPhrase must keep the exact surface form found in the source sentence, while canonicalSubject uses the reusable generalized form.',
  'Use "idiom" or "fixed expression" when that is more accurate than "phrasal verb".',
  'Never promote an ordinary compositional collocation to the card subject merely because it contains multiple words.',
].join(' ');
