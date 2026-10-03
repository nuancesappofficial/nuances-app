import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseCulturalBackgroundInsight,
  extractCulturalBackgroundDisplayText,
} from './culturalBackgroundInsight.ts';

test('parseCulturalBackgroundInsight parses valid JSON with metrics and insider_insight', () => {
  const jsonStr = JSON.stringify({
    metrics: { formality: 4, intensity: 8 },
    insider_insight: '相較於單純的 happy，thrilled 帶有一種壓抑不住的興奮感。',
  });

  const result = parseCulturalBackgroundInsight(jsonStr);
  assert.ok(result);
  assert.equal(result.metrics.formality, 4);
  assert.equal(result.metrics.intensity, 8);
  assert.equal(
    result.insider_insight,
    '相較於單純的 happy，thrilled 帶有一種壓抑不住的興奮感。'
  );
});

test('parseCulturalBackgroundInsight clamps metrics between 1 and 10', () => {
  const jsonStr = JSON.stringify({
    metrics: { formality: 0, intensity: 15 },
    insider_insight: '相較於單純的 angry...',
  });

  const result = parseCulturalBackgroundInsight(jsonStr);
  assert.ok(result);
  assert.equal(result.metrics.formality, 1);
  assert.equal(result.metrics.intensity, 10);
});

test('parseCulturalBackgroundInsight returns null for legacy plain text', () => {
  const legacyText = '這是一個傳統純文字描述，並非 JSON。';
  const result = parseCulturalBackgroundInsight(legacyText);
  assert.equal(result, null);
});

test('parseCulturalBackgroundInsight returns null for malformed or incomplete JSON', () => {
  const malformed = '{"metrics": {"formality": 5';
  const result = parseCulturalBackgroundInsight(malformed);
  assert.equal(result, null);
});

test('extractCulturalBackgroundDisplayText extracts insider_insight from JSON', () => {
  const jsonStr = JSON.stringify({
    metrics: { formality: 5, intensity: 8 },
    insider_insight: "相較於單純的注意，'watch out' 更強調了潛在的危險和需要立即反應的緊迫感。",
  });
  const text = extractCulturalBackgroundDisplayText(jsonStr);
  assert.equal(
    text,
    "相較於單純的注意，'watch out' 更強調了潛在的危險和需要立即反應的緊迫感。"
  );
});

test('extractCulturalBackgroundDisplayText preserves legacy plain text and empty string', () => {
  assert.equal(
    extractCulturalBackgroundDisplayText('傳統語境純文字'),
    '傳統語境純文字'
  );
  assert.equal(extractCulturalBackgroundDisplayText(''), '');
  assert.equal(extractCulturalBackgroundDisplayText(null), '');
  assert.equal(extractCulturalBackgroundDisplayText(undefined), '');
});

test('parseCulturalBackgroundInsight accepts nullable metrics for neutral vocabulary', () => {
  const neutralJson = JSON.stringify({
    metrics: { formality: null, intensity: null },
    insider_insight: '相較於單純的 desk，table 通常指沒有抽屜的平整檯面。',
  });
  const result = parseCulturalBackgroundInsight(neutralJson);
  assert.ok(result);
  assert.equal(result.metrics.formality, null);
  assert.equal(result.metrics.intensity, null);
  assert.equal(
    result.insider_insight,
    '相較於單純的 desk，table 通常指沒有抽屜的平整檯面。'
  );
});

test('parseCulturalBackgroundInsight accepts single nullable metric', () => {
  const partialJson = JSON.stringify({
    metrics: { formality: 7, intensity: null },
    insider_insight: '相較於單純的 speak，converse 語氣較為正式，但情緒平實。',
  });
  const result = parseCulturalBackgroundInsight(partialJson);
  assert.ok(result);
  assert.equal(result.metrics.formality, 7);
  assert.equal(result.metrics.intensity, null);
});

test('parseCulturalBackgroundInsight strips markdown code fences (```json and ```)', () => {
  const markdownFenced = `\`\`\`json
{
  "metrics": {
    "formality": null,
    "intensity": null
  },
  "insider_insight": "table 指有平整檯面並由支柱支撐的家具，無特定情緒或正式度差異。"
}
\`\`\``;
  const result = parseCulturalBackgroundInsight(markdownFenced);
  assert.ok(result);
  assert.equal(result.metrics.formality, null);
  assert.equal(result.metrics.intensity, null);
  assert.equal(
    result.insider_insight,
    'table 指有平整檯面並由支柱支撐的家具，無特定情緒或正式度差異。'
  );
});

test('extractCulturalBackgroundDisplayText works with markdown fenced input', () => {
  const markdownFenced = `\`\`\`json
{
  "metrics": {
    "formality": null,
    "intensity": null
  },
  "insider_insight": "純物理/功能邊界描述。"
}
\`\`\``;
  assert.equal(
    extractCulturalBackgroundDisplayText(markdownFenced),
    '純物理/功能邊界描述。'
  );
});

test('parseCulturalBackgroundInsight parses supplementary_senses when present', () => {
  const jsonStr = JSON.stringify({
    metrics: { formality: 6, intensity: 5 },
    insider_insight: '相較於單純的 structure，frame 更強調...',
    supplementary_senses: [
      { pos: 'v.', definition: '陷害；誣陷' },
      { pos: 'v.', definition: '給…裝框' },
      { pos: 'extra', definition: 'ignored beyond max 2' },
    ],
  });
  const result = parseCulturalBackgroundInsight(jsonStr);
  assert.ok(result);
  assert.equal(result.supplementary_senses?.length, 2);
  assert.equal(result.supplementary_senses?.[0]?.pos, 'v.');
  assert.equal(result.supplementary_senses?.[0]?.definition, '陷害；誣陷');
  assert.equal(result.supplementary_senses?.[1]?.pos, 'v.');
  assert.equal(result.supplementary_senses?.[1]?.definition, '給…裝框');
});

test('parseCulturalBackgroundInsight handles empty or missing supplementary_senses gracefully', () => {
  const jsonStr = JSON.stringify({
    metrics: { formality: 6, intensity: 5 },
    insider_insight: '相較於單純的 structure，frame 更強調...',
    supplementary_senses: [],
  });
  const result = parseCulturalBackgroundInsight(jsonStr);
  assert.ok(result);
  assert.deepEqual(result.supplementary_senses, []);
});

