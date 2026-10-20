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

export function parseStreamingCulturalBackgroundInsight(
  rawText: string | undefined | null
): CulturalBackgroundInsight | null {
  if (!rawText) return null;
  const complete = parseCulturalBackgroundInsight(rawText);
  if (complete) return complete;

  const sanitized = rawText.replace(/```(json)?/gi, '').trim();
  if (!sanitized.startsWith('{')) return null;

  const parseNumber = (matchStr: string | undefined): number | null => {
    if (!matchStr) return null;
    const num = parseInt(matchStr, 10);
    return !Number.isNaN(num) ? Math.max(1, Math.min(10, num)) : null;
  };
  const formalityMatch = sanitized.match(/"formality"\s*:\s*(\d+)/);
  const intensityMatch = sanitized.match(/"intensity"\s*:\s*(\d+)/);
  const insightMatch = sanitized.match(/"insider_insight"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (formalityMatch || intensityMatch || insightMatch) {
    let extractedInsight = '';
    if (insightMatch && insightMatch[1]) {
      try {
        extractedInsight = JSON.parse(`"${insightMatch[1]}"`);
      } catch {
        extractedInsight = insightMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
    }
    return {
      metrics: {
        formality: parseNumber(formalityMatch?.[1]),
        intensity: parseNumber(intensityMatch?.[1]),
      },
      insider_insight: extractedInsight,
    };
  }
  return null;
}

export function extractCulturalBackgroundDisplayText(
  rawText: string | undefined | null
): string {
  if (!rawText) return '';
  const insight = parseStreamingCulturalBackgroundInsight(rawText);
  if (insight && insight.insider_insight) {
    return insight.insider_insight;
  }
  const clean = rawText.trim();
  if (clean.startsWith('{') || clean.startsWith('```json')) {
    return '';
  }
  return rawText;
}

export type InsiderInsightBullet = {
  raw: string;
  label?: string;
  body: string;
};

export type StructuredInsiderInsight = {
  hookText: string;
  detailBullets: InsiderInsightBullet[];
};

export function splitInsiderInsight(rawInsight: string | undefined | null): StructuredInsiderInsight {
  if (!rawInsight) {
    return { hookText: '', detailBullets: [] };
  }
  const clean = rawInsight.trim();
  if (!clean) {
    return { hookText: '', detailBullets: [] };
  }

  let rawSections: string[] = [];

  // Check if text contains inline or newline bullets
  if (/[•\-\*]\s+/.test(clean)) {
    const parts = clean
      .split(/(?:^|\n|\s+)[•\-\*]\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      rawSections = parts;
    }
  }

  if (rawSections.length === 0) {
    rawSections = clean
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const hookText = (rawSections[0] || '').replace(/^[•\-\*]\s*/, '').trim();
  const rawBullets = rawSections.slice(1);

  const detailBullets: InsiderInsightBullet[] = rawBullets.map((raw) => {
    const cleaned = raw.replace(/^[•\-\*]\s*/, '').trim();
    const match = cleaned.match(/^([^：:\n]{2,14})[：:]\s*([\s\S]*)$/);
    if (match) {
      return {
        raw: cleaned,
        label: match[1].trim(),
        body: match[2].trim(),
      };
    }
    return {
      raw: cleaned,
      label: undefined,
      body: cleaned,
    };
  });

  return { hookText, detailBullets };
}
