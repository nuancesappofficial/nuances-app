export type ExampleDisplayItem = {
  sentence: string;
  translation?: string;
};

export type TextScript = 'japanese' | 'korean' | 'han' | 'latin' | 'unknown';

export function resolveTextScript(value: string): TextScript {
  if (/[\u3040-\u30FF]/u.test(value)) return 'japanese';
  if (/[\uAC00-\uD7AF]/u.test(value)) return 'korean';
  if (/[\u3400-\u9FFF]/u.test(value)) return 'han';
  if (/[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(value)) return 'latin';
  return 'unknown';
}

export function normalizeExampleDisplayOrder(
  example: ExampleDisplayItem,
  sourceScript: TextScript
): ExampleDisplayItem {
  if (!example.translation || sourceScript === 'unknown') return example;
  const sentenceScript = resolveTextScript(example.sentence);
  const translationScript = resolveTextScript(example.translation);

  if (sentenceScript !== sourceScript && translationScript === sourceScript) {
    return {
      sentence: example.translation,
      translation: example.sentence,
    };
  }
  return example;
}

export function normalizeEnglishExampleDisplayOrder(
  example: ExampleDisplayItem
): ExampleDisplayItem {
  return normalizeExampleDisplayOrder(example, 'latin');
}
