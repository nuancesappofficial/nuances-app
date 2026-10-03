export type SupplementarySense = {
  pos: string;
  definition: string;
};

export type CulturalBackgroundInsight = {
  metrics: {
    formality: number | null; // 1-10 or null
    intensity: number | null; // 1-10 or null
  };
  insider_insight: string;
  supplementary_senses?: SupplementarySense[];
};

export function parseCulturalBackgroundInsight(
  rawText: string | undefined | null
): CulturalBackgroundInsight | null {
  if (!rawText) return null;
  const sanitized = rawText.replace(/```(json)?/gi, '').trim();
  if (!sanitized.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(sanitized);
    const metrics = parsed.metrics;
    if (metrics && typeof metrics === 'object') {
      const parseMetric = (val: unknown): number | null => {
        if (typeof val === 'number' && !Number.isNaN(val)) {
          return Math.max(1, Math.min(10, Math.round(val)));
        }
        return null;
      };

      const formality = parseMetric(metrics.formality);
      const intensity = parseMetric(metrics.intensity);
      const insider_insight = String(parsed.insider_insight || '').trim();

      const isValidFormality =
        metrics.formality === null ||
        typeof metrics.formality === 'number' ||
        metrics.formality === undefined;
      const isValidIntensity =
        metrics.intensity === null ||
        typeof metrics.intensity === 'number' ||
        metrics.intensity === undefined;

      if (isValidFormality && isValidIntensity) {
        let supplementary_senses: SupplementarySense[] | undefined = undefined;
        if (Array.isArray(parsed.supplementary_senses)) {
          supplementary_senses = parsed.supplementary_senses
            .filter((s: any) => s && typeof s.definition === 'string')
            .slice(0, 2)
            .map((s: any) => ({
              pos: String(s.pos || '').trim(),
              definition: String(s.definition || '').trim(),
            }));
        }

        return {
          metrics: { formality, intensity },
          insider_insight,
          ...(supplementary_senses !== undefined ? { supplementary_senses } : {}),
        };
      }
    }
  } catch {
    // Partial stream or malformed JSON
  }
  return null;
}

export function extractCulturalBackgroundDisplayText(
  rawText: string | undefined | null
): string {
  if (!rawText) return '';
  const insight = parseCulturalBackgroundInsight(rawText);
  if (insight && insight.insider_insight) {
    return insight.insider_insight;
  }
  return rawText;
}
