// AI Action Service
// 透過 Supabase ai-proxy 呼叫後端 AI action

import { callAIAction, isAIProxyConfigured, isPremiumFeatureError, streamAIAction } from './edgeAiClient';
import type { AIPersonalizationOptions } from './types';
import { getLocalPhoneticTranscription } from '../pronunciation/localPhonetics';
import { stringifySemanticRelations } from '../../features/cards/semanticRelations';
import { DEFAULT_EXPERIENCE_PHONETIC_TRANSCRIPTION } from '../../features/cache/defaultExperiencePronunciation';
import * as Crypto from 'expo-crypto';
import {
  buildGenerateCardPayload,
  buildGenerateCardStreamPayload,
} from './generateCardPayload';
import { parseCoreStream } from './parseCoreStream';
import {
  isPhraseSubject,
  isProperNounSubject,
  isValidCollocationForSubject,
  normalizeGeneratedUsagePairs,
  resolveNormalizedPartOfSpeech,
  sourceTextFromUsageLine,
} from '../../features/cards/usageValidation';

/**
 * 延遲函數
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 產生卡片生成的冪等鍵（generationId）。
 * 守則 A：Path A（非串流）與 Path B（串流）都必須從這裡取得同一個
 * generationId 來源，確保兩條路徑永遠不會漏帶冪等鍵。
 */
function createGenerationId(): string {
  return Crypto.randomUUID();
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function detectSourceLanguage(value: string): 'ja' | 'ko' | 'zh' | 'es' | 'en' {
  if (/[\u3040-\u30FF]/u.test(value)) return 'ja';
  if (/[\uAC00-\uD7AF]/u.test(value)) return 'ko';
  if (/[\u3400-\u9FFF]/u.test(value)) return 'zh';
  if (/[¿¡ñÑáéíóúüÁÉÍÓÚÜ]/u.test(value)) return 'es';
  return 'en';
}

function normalizeLexicalSequence(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}'-]+/gu)
    ?.join(' ')
    .trim() || '';
}

function corePromotedTargetToPhrase(targetWord: string, normalizedTargetWord: unknown): boolean {
  const target = normalizeLexicalSequence(targetWord);
  const resolved = normalizeLexicalSequence(
    typeof normalizedTargetWord === 'string' ? normalizedTargetWord : ''
  );
  if (!target || !resolved || target === resolved) return false;
  return target.split(/\s+/).length === 1 && resolved.split(/\s+/).length > 1;
}

function isAdjectivalPartOfSpeech(value: unknown): boolean {
  const normalized = normalizeOptionalString(value)?.toLowerCase() || '';
  return (
    /\b(?:adj|adjective|participial adjective)\b/i.test(normalized) ||
    /形容(?:詞|词)?/u.test(normalized)
  );
}

function resolveContextualHeadword(
  result: Partial<GenerateCardResult>,
  targetWord: string
): string {
  const proposed =
    normalizeOptionalString(
      result.normalizedTargetWord ||
      result.correctedTargetWord ||
      result.lemma ||
      result.targetWord ||
      result.keyword
    ) || targetWord;
  if (
    !result.isPartOfPhrase &&
    !result.isLikelyTypo &&
    isAdjectivalPartOfSpeech(result.partOfSpeech || result['part of speech'])
  ) {
    return targetWord;
  }
  return proposed;
}

function extractFirstJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, index + 1);
    }
  }
  return '';
}

type GenerateCardResult = {
  normalizedTargetWord?: string;
  meaningInContext?: string;
  isLikelyTypo?: boolean;
  correctedTargetWord?: string;
  typoReason?: string;
  isPartOfPhrase?: boolean;
  detectedPhrase?: string;
  lemma?: string;
  targetWord?: string;
  keyword?: string;
  definition: string;
  partOfSpeech?: string;
  ['part of speech']?: string;
  contextualExplanation?: string;
  sentenceTranslation?: string;
  sentenceNotes?: string;
  culturalBackground?: string;
  example?: string | Array<{ sentence?: string; translation?: string }>;
  exampleSentence?: string;
  frequentCollocations?: string | Array<{ phrase?: string; translation?: string }>;
  usagePairs?: Array<{
    phrase?: string;
    collocation?: string;
    translation?: string;
    example?: { sentence?: string; translation?: string };
    exampleSentence?: string;
    exampleTranslation?: string;
  }>;
  semanticRelations?: {
    synonyms?: Array<{ term?: string; translation?: string }>;
    antonyms?: Array<{ term?: string; translation?: string }>;
  };
  ['Frequent collocations']?: string;
  phoneticTranscription: string | null;
  pronunciation?: string | null;
  ipa?: string | null;
  phonetic?: string | null;
  tags: string[];
};

// Enrichment stream 回傳的是「扁平」結構：synonyms / antonyms / usagePairs
// 位於頂層，而非巢狀在 semanticRelations 內。此型別描述 enrichment 的原始
// 形狀，供後續重新包裝成前端預期的深層結構。
type EnrichmentResult = Partial<GenerateCardResult> & {
  synonyms?: Array<{ term?: string; translation?: string }>;
  antonyms?: Array<{ term?: string; translation?: string }>;
  usagePairs?: Array<{
    phrase?: string;
    collocation?: string;
    translation?: string;
    example?: { sentence?: string; translation?: string };
    exampleSentence?: string;
    exampleTranslation?: string;
  }>;
};

function isMostlyLatinText(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  if (!compact) return false;
  const latinCount = (compact.match(/[A-Za-z]/g) || []).length;
  const cjkKanaHangulCount = (compact.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  return latinCount > 0 && latinCount >= cjkKanaHangulCount;
}

function normalizeLatinQuoteMarks(value: string): string {
  if (!isMostlyLatinText(value)) return value;
  return value
    .replace(/「([^」]+)」/g, '“$1”')
    .replace(/『([^』]+)』/g, '“$1”')
    .replace(/（([^）]+)）/g, '($1)');
}

function normalizeSentenceTranslation(value: unknown, originalSentence: string): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const cleanOriginal = originalSentence.trim();
  const sourceLine = cleanOriginal || lines[0] || '';
  const normalizedFirstLine = normalizeLexicalSequence(lines[0] || '');
  const normalizedOriginal = normalizeLexicalSequence(cleanOriginal);
  const firstLineRepeatsSource =
    Boolean(normalizedOriginal) &&
    (normalizedFirstLine === normalizedOriginal ||
      normalizedFirstLine.includes(normalizedOriginal) ||
      normalizedOriginal.includes(normalizedFirstLine));
  const translationLine = (firstLineRepeatsSource ? lines.slice(1) : lines).join(' ').trim();

  const normalizedSource = normalizeLatinQuoteMarks(sourceLine || cleanOriginal);
  const normalizedTranslation = normalizeLatinQuoteMarks(translationLine);
  return [normalizedSource, normalizedTranslation].filter(Boolean).join('\n');
}

function normalizeDirectDefinition(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const firstLine = value
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return fallback;
  return firstLine
    .replace(/^(?:definition|translation|direct translation|翻譯|翻译|直譯|直译)\s*[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

function stringifyCollocations(
  value: GenerateCardResult['frequentCollocations'],
  cardSubject?: string
): string {
  const subject = cardSubject || '';
  const isValidForSubject = (phrase: string | undefined) =>
    Boolean(phrase && (!subject || isValidCollocationForSubject(phrase, subject)));
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const itemUnknown = item as unknown;
        if (typeof itemUnknown === 'string') {
          return { phrase: itemUnknown.trim(), translation: '' };
        }
        return {
          phrase: normalizeOptionalString(item?.phrase || (item as any)?.collocation),
          translation: normalizeOptionalString(item?.translation),
        };
      })
      .filter((item) => isValidForSubject(item.phrase))
      .map((item) => {
        if (item.phrase && item.translation) return `${item.phrase} — ${item.translation}`;
        return item.phrase || item.translation || '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return (normalizeOptionalString(value) || '')
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => isValidForSubject(sourceTextFromUsageLine(item)))
    .join('\n');
}

function isCompleteGeneratedExampleSentence(value: string | undefined | null): boolean {
  const sentence = normalizeOptionalString(value) || '';
  if (!sentence) return false;
  return /[\p{L}\p{N}]/u.test(sentence);
}

function stringifyExamples(value: GenerateCardResult['example'] | GenerateCardResult['exampleSentence']): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const itemUnknown = item as unknown;
        if (typeof itemUnknown === 'string') {
          return { sentence: itemUnknown.trim(), translation: '' };
        }
        return {
          sentence: normalizeOptionalString(
            item?.sentence ||
            (item as any)?.exampleSentence ||
            (item as any)?.example
          ),
          translation: normalizeOptionalString(
            item?.translation ||
            (item as any)?.exampleTranslation
          ),
        };
      })
      .filter((item) => isCompleteGeneratedExampleSentence(item.sentence))
      .map((item) => {
        if (item.sentence && item.translation) return `${item.sentence} — ${item.translation}`;
        return item.sentence || item.translation || '';
      })
      .filter(Boolean)
      .join('\n');
  }
  const singleExample = normalizeOptionalString(value) || '';
  return isCompleteGeneratedExampleSentence(singleExample) ? singleExample : '';
}

function buildContextualExplanation(result: GenerateCardResult, originalSentence: string): string {
  const existing = normalizeOptionalString(result.contextualExplanation);
  const sentenceTranslation = normalizeSentenceTranslation(result.sentenceTranslation, originalSentence);
  const culturalBackground = normalizeOptionalString(result.culturalBackground) || '';
  const sentenceNotes = normalizeOptionalString(result.sentenceNotes) || '';
  const exampleSentence = stringifyExamples(result.example || result.exampleSentence);

  if (existing) {
    try {
      const parsed = JSON.parse(existing) as Record<string, unknown>;
      return JSON.stringify({
        ...parsed,
        sentenceTranslation: normalizeSentenceTranslation(
          parsed.sentenceTranslation || sentenceTranslation,
          originalSentence
        ),
        sentenceNotes: normalizeOptionalString(parsed.sentenceNotes) || sentenceNotes,
        culturalBackground: normalizeOptionalString(parsed.culturalBackground) || culturalBackground,
        exampleSentence: normalizeOptionalString(parsed.exampleSentence) || exampleSentence,
      });
    } catch {
      if (!exampleSentence) return existing;
      return JSON.stringify({
        sentenceTranslation: sentenceTranslation || originalSentence,
        sentenceNotes,
        culturalBackground: existing || culturalBackground,
        exampleSentence,
      });
    }
  }

  return JSON.stringify({
    sentenceTranslation,
    sentenceNotes,
    culturalBackground,
    exampleSentence,
  });
}

function normalizeGeneratedCardResult(
  result: GenerateCardResult,
  targetWord: string,
  localPhonetic: string | null,
  originalSentence: string,
  options?: { allowEmptyCollocations?: boolean }
) {
  const resolvedHeadword = resolveContextualHeadword(result, targetWord);
  const isProperNoun = isProperNounSubject({
    partOfSpeech: result.partOfSpeech || result['part of speech'],
    definition: result.definition,
  });
  const isPhrase = isPhraseSubject({
    partOfSpeech: result.partOfSpeech || result['part of speech'],
    isPartOfPhrase: result.isPartOfPhrase,
  });
  const allowEmpty = isProperNoun || isPhrase || Boolean(options?.allowEmptyCollocations);
  const example = stringifyExamples(result.example || result.exampleSentence);
  const frequentCollocations = stringifyCollocations(
    result.frequentCollocations || result['Frequent collocations'],
    resolvedHeadword
  );
  if (!example || (!allowEmpty && !frequentCollocations)) {
    throw new Error(
      `Generated card missing valid collocation and example pairs for "${resolvedHeadword}"`
    );
  }

  return {
    normalizedTargetWord: resolvedHeadword,
    meaningInContext: normalizeOptionalString(result.meaningInContext),
    isLikelyTypo: Boolean(result.isLikelyTypo),
    correctedTargetWord: normalizeOptionalString(result.correctedTargetWord),
    typoReason: normalizeOptionalString(result.typoReason),
    isPartOfPhrase: Boolean(result.isPartOfPhrase),
    detectedPhrase: normalizeOptionalString(result.detectedPhrase),
    definition: normalizeDirectDefinition(result.definition),
    partOfSpeech:
      resolveNormalizedPartOfSpeech(
        result.partOfSpeech || result['part of speech'],
        result.definition
      ) || '',
    contextualExplanation: buildContextualExplanation(result, originalSentence),
    example,
    frequentCollocations,
    semanticRelations: stringifySemanticRelations(result.semanticRelations),
    phoneticTranscription:
      localPhonetic ||
      result.phoneticTranscription ||
      result.pronunciation ||
      result.ipa ||
      result.phonetic ||
      null,
    tags: result.tags || [],
  };
}

/**
 * 調用 legacy OpenAI proxy（僅保留相容舊流程）
 */
export async function callOpenAI(
  _messages: { role: string; content: any }[],
  _options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean; // 啟用 response_format: json_object
  } = {}
): Promise<string> {
  throw new Error('Legacy OpenAI proxy is disabled. Use action-based AI endpoints instead.');
}
/**
 * 為單字生成詳細的定義和解釋
 */
export async function generateCardContent(
  targetWord: string,
  originalSentence: string,
  personalization?: AIPersonalizationOptions
): Promise<{
  normalizedTargetWord: string;
  meaningInContext?: string;
  isLikelyTypo?: boolean;
  correctedTargetWord?: string;
  typoReason?: string;
  isPartOfPhrase?: boolean;
  detectedPhrase?: string;
  definition: string;
  partOfSpeech: string;
  contextualExplanation: string;
  example: string;
  frequentCollocations: string;
  semanticRelations: string;
  phoneticTranscription: string | null;
  tags: string[];
}> {
  try {
    const replyLanguage = normalizeOptionalString(personalization?.replyLanguage);
    const aiBreakdownMode = normalizeOptionalString(personalization?.aiBreakdownMode);
    const sourceLanguage = detectSourceLanguage(`${targetWord} ${originalSentence}`);
    const localPhonetic = await getLocalPhoneticTranscription(targetWord);
    console.log(
      `[Phonetic] generate_card target="${targetWord}" source=${localPhonetic ? 'local' : 'api_fallback'}`
    );
    const generationId = createGenerationId();
    const result = await callAIAction<
      {
        targetWord: string;
        originalSentence: string;
        includePronunciation?: boolean;
        replyLanguage?: string;
        sourceLanguage?: string;
        aiBreakdownMode?: string;
        generationId?: string;
      },
      GenerateCardResult
    >('generate_card', buildGenerateCardPayload({
      targetWord,
      originalSentence,
      includePronunciation: !localPhonetic,
      replyLanguage,
      sourceLanguage,
      aiBreakdownMode,
      generationId,
    }));

    return normalizeGeneratedCardResult(
      result,
      targetWord,
      localPhonetic,
      originalSentence,
      { allowEmptyCollocations: true }
    );
  } catch (error) {
    if (!isPremiumFeatureError(error)) {
      console.error('[AI] Error in generateCardContent:', error);
    }
    throw error;
  }
}

type DemoReplyLanguage = 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko' | 'es' | 'fr';

type DemoLocalizedCopy = {
  definition: string;
  sentenceTranslation: string;
  contextualExplanation: string;
  collocations: Array<{ phrase: string; translation: string }>;
  examples: Array<{ sentence: string; translation: string }>;
  synonyms: Array<{ term: string; translation: string }>;
};

const DEFAULT_EXPERIENCE_COPY: Record<DemoReplyLanguage, DemoLocalizedCopy> = {
  'zh-TW': {
    definition: '細節，細微的差異',
    sentenceTranslation: '最細微的差異，也能帶來最大的不同。',
    contextualExplanation: '這裡的 nuances 指不易察覺、卻會影響整體結果的細節或差異。',
    collocations: [
      { phrase: 'subtle nuances', translation: '細微差異' },
      { phrase: 'cultural nuances', translation: '文化上的細微差異' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: '她注意到他語氣中的細微差異。' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: '理解文化上的細微差異有助於避免誤會。',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: '細微之處' },
      { term: 'fine distinctions', translation: '細微區別' },
    ],
  },
  'zh-CN': {
    definition: '细节，细微的差异',
    sentenceTranslation: '最细微的差异，也能带来最大的不同。',
    contextualExplanation: '这里的 nuances 指不易察觉、却会影响整体结果的细节或差异。',
    collocations: [
      { phrase: 'subtle nuances', translation: '细微差异' },
      { phrase: 'cultural nuances', translation: '文化上的细微差异' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: '她注意到他语气中的细微差异。' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: '理解文化上的细微差异有助于避免误会。',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: '细微之处' },
      { term: 'fine distinctions', translation: '细微区别' },
    ],
  },
  en: {
    definition: 'details; subtle differences',
    sentenceTranslation: 'Even the smallest subtle details can create the biggest differences.',
    contextualExplanation:
      'Here, nuances means small, hard-to-notice details or differences that can shape the overall result.',
    collocations: [
      { phrase: 'subtle nuances', translation: 'small, hard-to-notice differences' },
      { phrase: 'cultural nuances', translation: 'subtle differences shaped by culture' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: 'She noticed small differences in his tone.' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: 'Understanding subtle cultural differences helps prevent misunderstandings.',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: 'small subtle details' },
      { term: 'fine distinctions', translation: 'small but meaningful differences' },
    ],
  },
  ja: {
    definition: '細部、わずかな違い',
    sentenceTranslation: 'ほんのわずかなニュアンスが、最も大きな違いを生むことがあります。',
    contextualExplanation:
      'ここでの nuances は、気づきにくくても全体の結果に影響する細部やわずかな違いを指します。',
    collocations: [
      { phrase: 'subtle nuances', translation: '微妙なニュアンス' },
      { phrase: 'cultural nuances', translation: '文化的なニュアンス' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: '彼女は彼の口調の微妙なニュアンスに気づきました。' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: '文化的なニュアンスを理解すると、誤解を防ぎやすくなります。',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: '微妙な点' },
      { term: 'fine distinctions', translation: '細かな違い' },
    ],
  },
  ko: {
    definition: '세부적인 차이, 미묘한 차이',
    sentenceTranslation: '아주 작은 뉘앙스가 가장 큰 차이를 만들 수 있습니다.',
    contextualExplanation:
      '여기서 nuances는 눈에 잘 띄지 않지만 전체 결과에 영향을 줄 수 있는 세부적이거나 미묘한 차이를 뜻합니다.',
    collocations: [
      { phrase: 'subtle nuances', translation: '미묘한 뉘앙스' },
      { phrase: 'cultural nuances', translation: '문화적 뉘앙스' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: '그녀는 그의 말투에서 미묘한 뉘앙스를 알아챘습니다.' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: '문화적 뉘앙스를 이해하면 오해를 예방하는 데 도움이 됩니다.',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: '미묘한 점' },
      { term: 'fine distinctions', translation: '세밀한 차이' },
    ],
  },
  es: {
    definition: 'detalles, diferencias sutiles',
    sentenceTranslation: 'Los matices más pequeños pueden marcar las mayores diferencias.',
    contextualExplanation:
      'Aquí, nuances se refiere a detalles o diferencias difíciles de percibir que pueden influir en el resultado general.',
    collocations: [
      { phrase: 'subtle nuances', translation: 'matices sutiles' },
      { phrase: 'cultural nuances', translation: 'matices culturales' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: 'Ella notó matices sutiles en su tono.' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: 'Comprender los matices culturales ayuda a evitar malentendidos.',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: 'sutilezas' },
      { term: 'fine distinctions', translation: 'distinciones sutiles' },
    ],
  },
  fr: {
    definition: 'détails, différences subtiles',
    sentenceTranslation: 'Les nuances les plus subtiles peuvent faire les plus grandes différences.',
    contextualExplanation:
      'Ici, nuances désigne des détails ou des différences difficiles à percevoir qui peuvent influencer le résultat global.',
    collocations: [
      { phrase: 'subtle nuances', translation: 'nuances subtiles' },
      { phrase: 'cultural nuances', translation: 'nuances culturelles' },
    ],
    examples: [
      { sentence: 'She noticed subtle nuances in his tone.', translation: 'Elle a remarqué des nuances subtiles dans son ton.' },
      {
        sentence: 'Understanding cultural nuances helps prevent misunderstandings.',
        translation: 'Comprendre les nuances culturelles aide à éviter les malentendus.',
      },
    ],
    synonyms: [
      { term: 'subtleties', translation: 'subtilités' },
      { term: 'fine distinctions', translation: 'distinctions fines' },
    ],
  },
};

function resolveDemoReplyLanguage(value: unknown): DemoReplyLanguage {
  const normalized = normalizeOptionalString(value)?.toLowerCase() || '';
  if (['zh-cn', 'zh_hans', 'zh-hans', 'cn'].includes(normalized)) return 'zh-CN';
  if (['en', 'en-us', 'en-gb'].includes(normalized)) return 'en';
  if (['ja', 'ja-jp', 'jp'].includes(normalized)) return 'ja';
  if (['ko', 'ko-kr', 'kr'].includes(normalized)) return 'ko';
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es';
  if (normalized === 'fr' || normalized.startsWith('fr-')) return 'fr';
  return 'zh-TW';
}

export async function getDefaultExperienceCardContentForLanguage(
  replyLanguage?: string
): Promise<Awaited<ReturnType<typeof generateCardContent>>> {
  return buildDefaultExperienceCardContent(replyLanguage);
}

async function buildDefaultExperienceCardContent(
  replyLanguage?: string,
  base: Partial<Awaited<ReturnType<typeof generateCardContent>>> = {}
): Promise<Awaited<ReturnType<typeof generateCardContent>>> {
  const targetWord = 'nuances';
  const originalSentence = 'The smallest nuances can make the biggest differences.';
  const copy = DEFAULT_EXPERIENCE_COPY[
    resolveDemoReplyLanguage(replyLanguage)
  ];
  return {
    ...base,
    normalizedTargetWord: targetWord,
    meaningInContext: copy.definition,
    isLikelyTypo: false,
    correctedTargetWord: undefined,
    typoReason: undefined,
    isPartOfPhrase: false,
    detectedPhrase: undefined,
    definition: copy.definition,
    partOfSpeech: 'noun',
    contextualExplanation: JSON.stringify({
      sentenceTranslation: `${originalSentence}\n${copy.sentenceTranslation}`,
      sentenceNotes: '',
      culturalBackground: copy.contextualExplanation,
      exampleSentence: copy.examples
        .map(({ sentence, translation }) => `${sentence} — ${translation}`)
        .join('\n'),
    }),
    example: copy.examples
      .map(({ sentence, translation }) => `${sentence} — ${translation}`)
      .join('\n'),
    frequentCollocations: copy.collocations
      .map(({ phrase, translation }) => `${phrase} — ${translation}`)
      .join('\n'),
    semanticRelations: stringifySemanticRelations({
      synonyms: copy.synonyms,
      antonyms: [],
    }),
    phoneticTranscription:
      base.phoneticTranscription || DEFAULT_EXPERIENCE_PHONETIC_TRANSCRIPTION,
    tags: ['communication', 'details', 'meaning'],
  };
}

type EnrichmentStreamPayload = {
  generationId: string;
  targetWord: string;
  originalSentence: string;
  canonicalSubject: string;
  partOfSpeech: string;
  definition: string;
  coreSentenceTranslation: string;
  replyLanguage?: string;
  sourceLanguage?: string;
  aiBreakdownMode?: string;
};

/**
 * 呼叫 enrichment stream 並在失敗或驗證不通過時重試最多 3 次。
 * - proper noun 首次即允許空搭配詞（只要有例句）。
 * - 一般字詞第 1、2 次嘗試要求嚴格具備搭配詞與例句。
 * - 若重試至第 3 次依然缺少搭配詞，則放寬通過（只要有例句），避免使用者看到錯誤。
 */
async function streamAndNormalizeEnrichmentWithRetry(
  payload: EnrichmentStreamPayload,
  canonicalSubject: string,
  core: Partial<GenerateCardResult>,
  handlers: { onToken?: (delta: string) => void }
): Promise<{ enrichment: EnrichmentResult; ttfbMs?: number; model?: string }> {
  let lastError: unknown;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const enrichmentResult = await streamAIAction(
        'generate_card_enrichment_stream',
        payload,
        { onToken: handlers.onToken }
      );

      if (__DEV__) {
        console.log(
          `--- AI RAW ENRICHMENT OUTPUT (attempt ${attempt}) ---`,
          enrichmentResult.rawContent
        );
      }

      const enrichmentJson = extractFirstJsonObject(enrichmentResult.rawContent);
      if (!enrichmentJson) {
        throw new Error('AI enrichment stream did not return a complete JSON object');
      }

      const enrichment = JSON.parse(enrichmentJson) as EnrichmentResult;
      // Core is the single source of truth for sentence meaning and translation.
      // Enrichment may add learning fields, but it must never reinterpret or replace it.
      delete enrichment.sentenceTranslation;

      // Proper nouns and phrases always allow empty collocations from attempt 1.
      // Normal words allow empty collocations on the 3rd attempt to prevent user errors.
      const normalizedUsage = normalizeGeneratedUsagePairs(enrichment, canonicalSubject, {
        partOfSpeech: core.partOfSpeech,
        definition: core.definition,
        isPartOfPhrase: core.isPartOfPhrase,
        allowEmptyCollocations: attempt === maxAttempts,
      });

      enrichment.frequentCollocations = normalizedUsage.frequentCollocations;
      enrichment.example = normalizedUsage.example;
      delete enrichment.usagePairs;

      // 🟢 手動把扁平的陣列，重新包裝回前端預期的深層結構
      if (enrichment.synonyms || enrichment.antonyms) {
        enrichment.semanticRelations = {
          synonyms: enrichment.synonyms || [],
          antonyms: enrichment.antonyms || [],
        };
        delete enrichment.synonyms;
        delete enrichment.antonyms;
      }

      return {
        enrichment,
        ttfbMs: enrichmentResult.ttfbMs,
        model: enrichmentResult.model,
      };
    } catch (error) {
      lastError = error;
      console.warn('[AI][pipeline] enrichment attempt failed', {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < maxAttempts) {
        await delay(500);
      }
    }
  }

  // 終極保底：若重試多次依然因網路或格式異常中斷，避免跳出報錯阻擋使用者，以最小資料放行
  console.warn('[AI][pipeline] enrichment attempts exhausted, falling back to minimal card usage', {
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });
  const fallbackExample = payload.originalSentence
    ? [{ sentence: payload.originalSentence, translation: core.sentenceTranslation || '' }]
    : [];
  return {
    enrichment: {
      culturalBackground: '',
      frequentCollocations: [],
      example: fallbackExample,
    },
  };
}

export async function generateCardContentStream(
  targetWord: string,
  originalSentence: string,
  personalization?: AIPersonalizationOptions,
  handlers: {
    onToken?: (delta: string) => void;
    onFirstToken?: () => void;
  } = {}
): Promise<Awaited<ReturnType<typeof generateCardContent>>> {
  const generationId = createGenerationId();
  const replyLanguage = normalizeOptionalString(personalization?.replyLanguage);
  const aiBreakdownMode = normalizeOptionalString(personalization?.aiBreakdownMode);
  const sourceLanguage = detectSourceLanguage(`${targetWord} ${originalSentence}`);
  const localPhonetic = await getLocalPhoneticTranscription(targetWord);
  const pipelineStartedAt = Date.now();
  let firstTokenReported = false;
  const stageHandlers = {
    onToken: handlers.onToken,
    onFirstToken: () => {
      if (firstTokenReported) return;
      firstTokenReported = true;
      handlers.onFirstToken?.();
    },
  };
  const coreResult = await streamAIAction<
    {
      generationId: string;
      targetWord: string;
      originalSentence: string;
      includePronunciation?: boolean;
      replyLanguage?: string;
      sourceLanguage?: string;
      aiBreakdownMode?: string;
    }
  >('generate_card_core_stream', buildGenerateCardStreamPayload({
    generationId,
    targetWord,
    originalSentence,
    includePronunciation: !localPhonetic,
    replyLanguage,
    sourceLanguage,
    aiBreakdownMode,
  }), stageHandlers);

  const rawCore = coreResult.rawContent || '';

  const core: Partial<GenerateCardResult> = {
    ...parseCoreStream(rawCore),
  };

  if (!core.definition) {
    if (rawCore.trim().length > 0) {
      core.definition = rawCore
        .replace(/```(json|text|markdown)?/gi, '')
        .replace(/```/g, '')
        .trim();
    } else {
      throw new Error('AI core stream returned completely empty rawContent. Check XHR network layer.');
    }
  }
  core.definition = normalizeDirectDefinition(core.definition);
  core.partOfSpeech = resolveNormalizedPartOfSpeech(core.partOfSpeech, core.definition);
  const verifiedResolution = coreResult.resolution;
  if (verifiedResolution?.canonicalSubject) {
    core.normalizedTargetWord = verifiedResolution.canonicalSubject;
    core.isPartOfPhrase = verifiedResolution.isPartOfPhrase === true;
    core.detectedPhrase = normalizeOptionalString(verifiedResolution.detectedPhrase);
    core.isLikelyTypo = verifiedResolution.isLikelyTypo === true;
    core.correctedTargetWord = normalizeOptionalString(
      verifiedResolution.correctedTargetWord
    );
    core.typoReason = normalizeOptionalString(verifiedResolution.typoReason);
  } else if (corePromotedTargetToPhrase(targetWord, core.normalizedTargetWord)) {
    // Older deployed ai-proxy versions do not send resolution metadata.
    // Preserve their behavior until all environments have the validated contract.
    core.isPartOfPhrase = true;
  }
  const canonicalSubject =
    resolveContextualHeadword(core, targetWord);
  core.normalizedTargetWord = canonicalSubject;
  // The source excerpt is selected on-device. Model output may add quotation
  // marks or paraphrase it, so it is never authoritative for later stages.
  const selectedSourceSentence = originalSentence;
  console.log('[AI][pipeline] core complete', {
    elapsedMs: Date.now() - pipelineStartedAt,
    ttfbMs: coreResult.ttfbMs,
    model: coreResult.model,
    canonicalSubject,
  });

  handlers.onToken?.('\n');
  const { enrichment, ttfbMs, model } = await streamAndNormalizeEnrichmentWithRetry(
    {
      generationId,
      targetWord,
      originalSentence: selectedSourceSentence,
      canonicalSubject,
      partOfSpeech: core.partOfSpeech || '',
      definition: core.definition || '',
      coreSentenceTranslation: core.sentenceTranslation || '',
      replyLanguage,
      sourceLanguage,
      aiBreakdownMode,
    },
    canonicalSubject,
    core,
    { onToken: handlers.onToken }
  );

  const combined = {
    ...core,
    ...enrichment,
  } as GenerateCardResult;
  console.log('[AI][pipeline] enrichment complete', {
    elapsedMs: Date.now() - pipelineStartedAt,
    ttfbMs,
    model,
    canonicalSubject,
  });
  return normalizeGeneratedCardResult(
    combined,
    targetWord,
    localPhonetic,
    selectedSourceSentence,
    { allowEmptyCollocations: true }
  );
}
/**
 * 檢查 API Key 是否已配置
 */
export function isOpenAIConfigured(): boolean {
  return isAIProxyConfigured();
}
