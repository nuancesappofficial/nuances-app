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
import { normalizeSentenceTranslation } from './sentenceTranslation';
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
  culturalBackground?: string | Record<string, unknown>;
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

function normalizeCulturalBackground(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

function buildContextualExplanation(result: GenerateCardResult, originalSentence: string): string {
  const existing = normalizeOptionalString(result.contextualExplanation);
  const sentenceTranslation = normalizeSentenceTranslation(result.sentenceTranslation, originalSentence);
  const culturalBackground = normalizeCulturalBackground(result.culturalBackground);
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
        culturalBackground: normalizeCulturalBackground(parsed.culturalBackground) || culturalBackground,
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

/** Keeps a plausible IPA string, wrapped in slashes; anything else → null. */
export function normalizeIpaTranscription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^[\/\[]+|[\/\]]+$/g, '').trim();
  if (!trimmed || trimmed.length > 118) return null;
  // Must contain letters and must not look like prose / another script.
  if (!/[a-zɑɐɒæɔəɚɛɜɝɪʊʌθðŋʃʒʔɹɾɡ]/i.test(trimmed)) return null;
  if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(trimmed)) return null;
  return `/${trimmed}/`;
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
    // Prefer the AI's IPA (it sees the final card subject, phrases included);
    // the bundled 7k-word list is only a last resort.
    phoneticTranscription:
      normalizeIpaTranscription(
        result.phoneticTranscription ||
          result.pronunciation ||
          result.ipa ||
          result.phonetic
      ) ||
      localPhonetic ||
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
  antonyms?: Array<{ term: string; translation: string }>;
};

const DEFAULT_EXPERIENCE_COPY: Record<DemoReplyLanguage, DemoLocalizedCopy> = {
  'zh-TW': {
    definition: '細微差別',
    sentenceTranslation: '最細微的差別往往能造成巨大的影響。',
    contextualExplanation: JSON.stringify({
      metrics: {
        formality: 7,
        intensity: 3,
      },
      insider_insight:
        'nuance 意指隱晦的細節，與粗糙的 distinction 形成鮮明對比。\n• 典故與語境：源自法語，強調感官或思維中極難察覺的層次，常用於描述藝術、語言或人際互動中那種「只可意會」的精妙之處。\n• 近義詞辨析：與 subtlety 相比，nuance 更側重於多層次的細微差異，而 distinction 則顯得較為生硬且界線分明。',
    }),
    collocations: [
      { phrase: 'capture the nuance', translation: '捕捉到細微差別' },
      { phrase: 'a subtle nuance', translation: '一個微妙的細節' },
    ],
    examples: [
      {
        sentence: 'The translator worked tirelessly to capture the nuance of the original poem.',
        translation: '譯者不懈地努力，以捕捉原詩中那細微的差別。',
      },
      {
        sentence: 'There is a subtle nuance in his tone that suggests he is not entirely convinced.',
        translation: '他的語氣中有一種微妙的細節，暗示他並未完全信服。',
      },
    ],
    synonyms: [
      { term: 'subtlety', translation: '微妙之處' },
      { term: 'refinement', translation: '精緻細節' },
    ],
    antonyms: [
      { term: 'obviousness', translation: '明顯性' },
    ],
  },
  'zh-CN': {
    definition: '细微差别',
    sentenceTranslation: '最细微的差别往往能造成巨大的影响。',
    contextualExplanation: JSON.stringify({
      metrics: {
        formality: 7,
        intensity: 3,
      },
      insider_insight:
        'nuance 意指隐晦的细节，与粗糙的 distinction 形成鲜明对比。\n• 典故与语境：源自法语，强调感官或思维中极难察觉的层次，常用于描述艺术、语言或人际互动中那种“只可意会”的精妙之处。\n• 近义词辨析：与 subtlety 相比，nuance 更侧重于多层次的细微差异，而 distinction 则显得较为生硬且界线分明。',
    }),
    collocations: [
      { phrase: 'capture the nuance', translation: '捕捉到细微差别' },
      { phrase: 'a subtle nuance', translation: '一个微妙的细节' },
    ],
    examples: [
      {
        sentence: 'The translator worked tirelessly to capture the nuance of the original poem.',
        translation: '译者不懈地努力，以捕捉原诗中那细微的差别。',
      },
      {
        sentence: 'There is a subtle nuance in his tone that suggests he is not entirely convinced.',
        translation: '他的语气中有一种微妙的细节，暗示他并未完全信服。',
      },
    ],
    synonyms: [
      { term: 'subtlety', translation: '微妙之处' },
      { term: 'refinement', translation: '精致细节' },
    ],
    antonyms: [
      { term: 'obviousness', translation: '明显性' },
    ],
  },
  en: {
    definition: 'subtle distinction',
    sentenceTranslation: 'The smallest nuances can make the biggest differences.',
    contextualExplanation: JSON.stringify({
      metrics: {
        formality: 7,
        intensity: 3,
      },
      insider_insight:
        'Nuance highlights hidden depths, contrasting sharply with coarse distinctions.\n• Origin & Context: Derived from French, it evokes subtle shades of meaning or sensory perception, capturing things felt rather than stated.\n• Synonym Nuance: Unlike subtlety, nuance emphasizes layered complexity; distinction denotes rigid, clearly marked boundaries.',
    }),
    collocations: [
      { phrase: 'capture the nuance', translation: 'grasp the subtle quality' },
      { phrase: 'a subtle nuance', translation: 'a delicate distinction' },
    ],
    examples: [
      {
        sentence: 'The translator worked tirelessly to capture the nuance of the original poem.',
        translation: 'The translator strove to preserve the delicate shades of meaning in the poem.',
      },
      {
        sentence: 'There is a subtle nuance in his tone that suggests he is not entirely convinced.',
        translation: 'His tone carries a quiet undertone suggesting lingering doubt.',
      },
    ],
    synonyms: [
      { term: 'subtlety', translation: 'delicate aspect' },
      { term: 'refinement', translation: 'fine precision' },
    ],
    antonyms: [
      { term: 'obviousness', translation: 'blatant clarity' },
    ],
  },
  ja: {
    definition: '微妙なニュアンス、微細な差異',
    sentenceTranslation: 'ほんのわずかなニュアンスが、時に最も大きな違いを生み出します。',
    contextualExplanation: JSON.stringify({
      metrics: {
        formality: 7,
        intensity: 3,
      },
      insider_insight:
        'nuance は隠れた繊細なディテールを指し、大まかな distinction と鮮やかに対比されます。\n• 由来と語境：フランス語由来で、感覚や思考における極めて捉えにくい陰影を表し、言葉や芸術の「言外の妙」によく用いられます。\n• 類義語の識別：subtlety に比べ、nuance は多面的な微細差に重きを置き、distinction はより明確で硬い境界線を示します。',
    }),
    collocations: [
      { phrase: 'capture the nuance', translation: 'ニュアンスを捉える' },
      { phrase: 'a subtle nuance', translation: '微妙なニュアンス' },
    ],
    examples: [
      {
        sentence: 'The translator worked tirelessly to capture the nuance of the original poem.',
        translation: '翻訳者は原詩の微細なニュアンスを捉えるため、熱心に取り組みました。',
      },
      {
        sentence: 'There is a subtle nuance in his tone that suggests he is not entirely convinced.',
        translation: '彼の口調には、完全には納得していないことを匂わせる微妙なニュアンスがありました。',
      },
    ],
    synonyms: [
      { term: 'subtlety', translation: '繊細さ' },
      { term: 'refinement', translation: '洗練された細部' },
    ],
    antonyms: [
      { term: 'obviousness', translation: '明白さ' },
    ],
  },
  ko: {
    definition: '미묘한 차이, 뉘앙스',
    sentenceTranslation: '가장 작은 뉘앙스가 가장 큰 차이를 만들어내기도 합니다.',
    contextualExplanation: JSON.stringify({
      metrics: {
        formality: 7,
        intensity: 3,
      },
      insider_insight:
        'nuance는 눈에 잘 띄지 않는 숨은 디테일을 뜻하며, 단순한 distinction과 뚜렷이 대비됩니다。\n• 유래와 맥락：프랑스어에서 유래하여 감각이나 사고 속 섬세한 결을 강조하며, 예술이나 대화 속 \'말로 다 표현 못할\' 정교함에 쓰입니다。\n• 유의어 구별：subtlety에 비해 nuance는 겹겹이 쌓인 미세한 차이에 초점을 맞추며, distinction은 단단하고 명확한 구분을 나타냅니다。',
    }),
    collocations: [
      { phrase: 'capture the nuance', translation: '미묘한 차이를 포착하다' },
      { phrase: 'a subtle nuance', translation: '섬세한 뉘앙스' },
    ],
    examples: [
      {
        sentence: 'The translator worked tirelessly to capture the nuance of the original poem.',
        translation: '번역가는 원시의 미묘한 뉘앙스를 담아내기 위해 끊임없이 노력했습니다。',
      },
      {
        sentence: 'There is a subtle nuance in his tone that suggests he is not entirely convinced.',
        translation: '그의 어조에는 완전히 납득하지 못했음을 암시하는 미묘한 뉘앙스가 묻어납니다。',
      },
    ],
    synonyms: [
      { term: 'subtlety', translation: '섬세함' },
      { term: 'refinement', translation: '정교한 세부사항' },
    ],
    antonyms: [
      { term: 'obviousness', translation: '명백함' },
    ],
  },
  es: {
    definition: 'matiz, diferencia sutil',
    sentenceTranslation: 'Los matices más sutiles suelen marcar las mayores diferencias.',
    contextualExplanation: JSON.stringify({
      metrics: {
        formality: 7,
        intensity: 3,
      },
      insider_insight:
        'Nuance denota detalles sutiles e implícitos, en claro contraste con una simple distinction.\n• Origen y contexto: Proviene del francés y evoca tonalidades o capas casi imperceptibles, común en el arte y la comunicación tácita.\n• Matiz frente a sinónimos: Frente a subtlety, nuance enfatiza múltiples capas de significado; distinction marca límites rígidos y definidos.',
    }),
    collocations: [
      { phrase: 'capture the nuance', translation: 'captar el matiz' },
      { phrase: 'a subtle nuance', translation: 'un matiz sutil' },
    ],
    examples: [
      {
        sentence: 'The translator worked tirelessly to capture the nuance of the original poem.',
        translation: 'El traductor trabajó sin descanso para captar el matiz del poema original.',
      },
      {
        sentence: 'There is a subtle nuance in his tone that suggests he is not entirely convinced.',
        translation: 'Hay un matiz sutil en su tono que insinúa que no está totalmente convencido.',
      },
    ],
    synonyms: [
      { term: 'subtlety', translation: 'sutileza' },
      { term: 'refinement', translation: 'refinamiento' },
    ],
    antonyms: [
      { term: 'obviousness', translation: 'obviedad' },
    ],
  },
  fr: {
    definition: 'nuance, distinction subtile',
    sentenceTranslation: 'Les nuances les plus subtiles créent souvent les plus grands impacts.',
    contextualExplanation: JSON.stringify({
      metrics: {
        formality: 7,
        intensity: 3,
      },
      insider_insight:
        'Nuance évoque des détails implicites, en contraste frappant avec une distinction rigide.\n• Origine et contexte: D\'origine française, le mot souligne des degrés de sens très fins dans l\'art ou les échanges humains tacites.\n• Distinction des synonymes: Par rapport à subtlety, nuance accentue la richesse des strates, tandis que distinction trace des frontières nettes.',
    }),
    collocations: [
      { phrase: 'capture the nuance', translation: 'saisir la nuance' },
      { phrase: 'a subtle nuance', translation: 'une nuance subtile' },
    ],
    examples: [
      {
        sentence: 'The translator worked tirelessly to capture the nuance of the original poem.',
        translation: 'Le traducteur a travaillé sans relâche pour saisir la nuance du poème original.',
      },
      {
        sentence: 'There is a subtle nuance in his tone that suggests he is not entirely convinced.',
        translation: 'Il y a une nuance subtile dans son ton suggérant qu’il n’est pas totalement convaincu.',
      },
    ],
    synonyms: [
      { term: 'subtlety', translation: 'subtilité' },
      { term: 'refinement', translation: 'raffinement' },
    ],
    antonyms: [
      { term: 'obviousness', translation: 'évidence' },
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
  const targetWord = 'nuance';
  const originalSentence = 'The smallest nuances can make the biggest differences.';
  const copy = DEFAULT_EXPERIENCE_COPY[
    resolveDemoReplyLanguage(replyLanguage)
  ];
  return {
    ...base,
    normalizedTargetWord: base.normalizedTargetWord || targetWord,
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
      antonyms: copy.antonyms || [],
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
  let lastParsedEnrichment: EnrichmentResult | undefined;
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
      lastParsedEnrichment = enrichment;

      // Proper nouns and phrases always allow empty collocations from attempt 1.
      // Normal words allow empty collocations on the 3rd attempt to prevent user errors.
      const normalizedUsage = normalizeGeneratedUsagePairs(enrichment, canonicalSubject, {
        partOfSpeech: core.partOfSpeech,
        definition: core.definition,
        isPartOfPhrase: core.isPartOfPhrase,
        allowEmptyCollocations: attempt === maxAttempts,
        originalSentence: payload.originalSentence,
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

  // 終極保底：若重試多次依然因網路或格式異常中斷，保留已解析的 enrichment 結構，絕不複製原句
  console.warn('[AI][pipeline] enrichment attempts exhausted, preserving parsed enrichment data without source sentence duplication', {
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });

  if (lastParsedEnrichment) {
    const candidatePairs = Array.isArray(lastParsedEnrichment.usagePairs)
      ? lastParsedEnrichment.usagePairs
      : [];
    const normalizedOriginal = normalizeLexicalSequence(payload.originalSentence);
    const candidateExamples = candidatePairs
      .map((p: any) => ({
        sentence: p.exampleSentence || p.sentence || '',
        translation: p.exampleTranslation || p.translation || '',
      }))
      .filter((ex: any) => {
        if (!ex.sentence) return false;
        const sentenceKey = normalizeLexicalSequence(ex.sentence);
        return sentenceKey && sentenceKey !== normalizedOriginal;
      });

    const candidateCollocations = candidatePairs
      .map((p: any) => ({
        phrase: p.phrase || p.collocation || '',
        translation: p.translation || '',
      }))
      .filter((col: any) => Boolean(col.phrase));

    if (lastParsedEnrichment.synonyms || lastParsedEnrichment.antonyms) {
      lastParsedEnrichment.semanticRelations = {
        synonyms: lastParsedEnrichment.synonyms || [],
        antonyms: lastParsedEnrichment.antonyms || [],
      };
      delete lastParsedEnrichment.synonyms;
      delete lastParsedEnrichment.antonyms;
    }

    return {
      enrichment: {
        ...lastParsedEnrichment,
        frequentCollocations: candidateCollocations,
        example: candidateExamples,
      },
    };
  }

  return {
    enrichment: {
      frequentCollocations: [],
      example: [],
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
