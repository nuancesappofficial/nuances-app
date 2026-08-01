export type SemanticRelationItem = {
  term: string;
  translation?: string;
};

export type SemanticRelations = {
  synonyms: SemanticRelationItem[];
  antonyms: SemanticRelationItem[];
};

export const EMPTY_SEMANTIC_RELATIONS: SemanticRelations = {
  synonyms: [],
  antonyms: [],
};

function normalizeItems(value: unknown): SemanticRelationItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Record<string, unknown>;
      const term = typeof source.term === 'string' ? source.term.trim() : '';
      const translation = typeof source.translation === 'string' ? source.translation.trim() : '';
      if (!term) return null;
      const key = term.toLocaleLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return translation ? { term, translation } : { term };
    })
    .filter((item): item is SemanticRelationItem => Boolean(item));
}

export function parseSemanticRelations(raw: unknown): SemanticRelations {
  if (!raw) return EMPTY_SEMANTIC_RELATIONS;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return EMPTY_SEMANTIC_RELATIONS;
    const source = parsed as Record<string, unknown>;
    return {
      synonyms: normalizeItems(source.synonyms),
      antonyms: normalizeItems(source.antonyms),
    };
  } catch {
    return EMPTY_SEMANTIC_RELATIONS;
  }
}

export function stringifySemanticRelations(raw: unknown): string {
  const relations = parseSemanticRelations(raw);
  if (relations.synonyms.length === 0 && relations.antonyms.length === 0) return '';
  return JSON.stringify(relations);
}
