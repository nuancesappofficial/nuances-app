import type { UILanguage } from '../services/settings/userSettings';

const EN_PART_OF_SPEECH_LABELS: Record<string, string> = {
  n: 'noun',
  noun: 'noun',
  v: 'verb',
  verb: 'verb',
  vt: 'transitive verb',
  vi: 'intransitive verb',
  adj: 'adjective',
  adjective: 'adjective',
  adv: 'adverb',
  adverb: 'adverb',
  'adverbial phrase': 'adverbial phrase',
  prep: 'preposition',
  preposition: 'preposition',
  pron: 'pronoun',
  pronoun: 'pronoun',
  conj: 'conjunction',
  conjunction: 'conjunction',
  interj: 'interjection',
  interjection: 'interjection',
  det: 'determiner',
  determiner: 'determiner',
  article: 'article',
  phrase: 'phrase',
  idiom: 'idiom',
  slang: 'slang',
  'proper noun': 'proper noun',
  propernoun: 'proper noun',
  aux: 'auxiliary verb',
  modal: 'modal verb',
  num: 'number',
  number: 'number',
  word: 'word',
  other: 'other',
};

const ZH_HANT_PART_OF_SPEECH_LABELS: Record<string, string> = {
  n: '名詞',
  noun: '名詞',
  v: '動詞',
  verb: '動詞',
  vt: '及物動詞',
  vi: '不及物動詞',
  adj: '形容詞',
  adjective: '形容詞',
  adv: '副詞',
  adverb: '副詞',
  'adverbial phrase': '副詞片語',
  prep: '介系詞',
  preposition: '介系詞',
  pron: '代名詞',
  pronoun: '代名詞',
  conj: '連接詞',
  conjunction: '連接詞',
  interj: '感嘆詞',
  interjection: '感嘆詞',
  det: '限定詞',
  determiner: '限定詞',
  article: '冠詞',
  phrase: '片語',
  idiom: '慣用語',
  slang: '俚語',
  'proper noun': '專有名詞',
  propernoun: '專有名詞',
  aux: '助動詞',
  modal: '情態動詞',
  num: '數詞',
  number: '數詞',
  word: '單字',
  other: '其他',
};

const ZH_HANS_PART_OF_SPEECH_LABELS: Record<string, string> = {
  ...ZH_HANT_PART_OF_SPEECH_LABELS,
  prep: '介词',
  preposition: '介词',
  pron: '代词',
  pronoun: '代词',
  conj: '连词',
  conjunction: '连词',
  interj: '叹词',
  interjection: '叹词',
  det: '限定词',
  determiner: '限定词',
  phrase: '短语',
  'adverbial phrase': '副词短语',
  slang: '俚语',
  'proper noun': '专有名词',
  propernoun: '专有名词',
  aux: '助动词',
  num: '数词',
  number: '数词',
  word: '单词',
  other: '其他',
};

const JA_PART_OF_SPEECH_LABELS: Record<string, string> = {
  n: '名詞',
  noun: '名詞',
  v: '動詞',
  verb: '動詞',
  vt: '他動詞',
  vi: '自動詞',
  adj: '形容詞',
  adjective: '形容詞',
  adv: '副詞',
  adverb: '副詞',
  'adverbial phrase': '副詞句',
  prep: '前置詞',
  preposition: '前置詞',
  pron: '代名詞',
  pronoun: '代名詞',
  conj: '接続詞',
  conjunction: '接続詞',
  interj: '間投詞',
  interjection: '間投詞',
  det: '限定詞',
  determiner: '限定詞',
  article: '冠詞',
  phrase: '句',
  idiom: '慣用句',
  slang: '俗語',
  'proper noun': '固有名詞',
  propernoun: '固有名詞',
  aux: '助動詞',
  modal: '法助動詞',
  num: '数詞',
  number: '数詞',
  word: '単語',
  other: 'その他',
};

const KO_PART_OF_SPEECH_LABELS: Record<string, string> = {
  n: '명사',
  noun: '명사',
  v: '동사',
  verb: '동사',
  vt: '타동사',
  vi: '자동사',
  adj: '형용사',
  adjective: '형용사',
  adv: '부사',
  adverb: '부사',
  'adverbial phrase': '부사구',
  prep: '전치사',
  preposition: '전치사',
  pron: '대명사',
  pronoun: '대명사',
  conj: '접속사',
  conjunction: '접속사',
  interj: '감탄사',
  interjection: '감탄사',
  det: '한정사',
  determiner: '한정사',
  article: '관사',
  phrase: '구',
  idiom: '관용구',
  slang: '속어',
  'proper noun': '고유 명사',
  propernoun: '고유 명사',
  aux: '조동사',
  modal: '법조동사',
  num: '수사',
  number: '수사',
  word: '단어',
  other: '기타',
};

const ES_PART_OF_SPEECH_LABELS: Record<string, string> = {
  n: 'sustantivo',
  noun: 'sustantivo',
  v: 'verbo',
  verb: 'verbo',
  vt: 'verbo transitivo',
  vi: 'verbo intransitivo',
  adj: 'adjetivo',
  adjective: 'adjetivo',
  adv: 'adverbio',
  adverb: 'adverbio',
  'adverbial phrase': 'locución adverbial',
  prep: 'preposición',
  preposition: 'preposición',
  pron: 'pronombre',
  pronoun: 'pronombre',
  conj: 'conjunción',
  conjunction: 'conjunción',
  interj: 'interjección',
  interjection: 'interjección',
  det: 'determinante',
  determiner: 'determinante',
  article: 'artículo',
  phrase: 'frase',
  idiom: 'modismo',
  slang: 'jerga',
  'proper noun': 'nombre propio',
  propernoun: 'nombre propio',
  aux: 'verbo auxiliar',
  modal: 'verbo modal',
  num: 'numeral',
  number: 'numeral',
  word: 'palabra',
  other: 'otro',
};

const FR_PART_OF_SPEECH_LABELS: Record<string, string> = {
  n: 'nom',
  noun: 'nom',
  v: 'verbe',
  verb: 'verbe',
  vt: 'verbe transitif',
  vi: 'verbe intransitif',
  adj: 'adjectif',
  adjective: 'adjectif',
  adv: 'adverbe',
  adverb: 'adverbe',
  'adverbial phrase': 'locution adverbiale',
  prep: 'préposition',
  preposition: 'préposition',
  pron: 'pronom',
  pronoun: 'pronom',
  conj: 'conjonction',
  conjunction: 'conjonction',
  interj: 'interjection',
  interjection: 'interjection',
  det: 'déterminant',
  determiner: 'déterminant',
  article: 'article',
  phrase: 'groupe de mots',
  idiom: 'expression idiomatique',
  slang: 'argot',
  'proper noun': 'nom propre',
  propernoun: 'nom propre',
  aux: 'verbe auxiliaire',
  modal: 'verbe modal',
  num: 'numéral',
  number: 'numéral',
  word: 'mot',
  other: 'autre',
};

const PART_OF_SPEECH_LABELS: Record<UILanguage, Record<string, string>> = {
  en: EN_PART_OF_SPEECH_LABELS,
  'zh-TW': ZH_HANT_PART_OF_SPEECH_LABELS,
  'zh-CN': ZH_HANS_PART_OF_SPEECH_LABELS,
  ja: JA_PART_OF_SPEECH_LABELS,
  ko: KO_PART_OF_SPEECH_LABELS,
  es: ES_PART_OF_SPEECH_LABELS,
  fr: FR_PART_OF_SPEECH_LABELS,
};

const UNKNOWN_PART_OF_SPEECH_LABELS: Record<UILanguage, string> = {
  en: 'part of speech unknown',
  'zh-TW': '詞性未標註',
  'zh-CN': '词性未标注',
  ja: '品詞未設定',
  ko: '품사 미지정',
  es: 'categoría gramatical sin especificar',
  fr: 'catégorie grammaticale non précisée',
};

function normalizePartOfSpeechKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const PHRASE_PART_OF_SPEECH_KEYS = new Set([
  'phrase',
  'idiom',
  'expression',
  'phrasal verb',
  'verb phrase',
  'noun phrase',
  'adjective phrase',
  'adverbial phrase',
]);

export type CanonicalPartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'preposition'
  | 'pronoun'
  | 'conjunction'
  | 'interjection'
  | 'determiner';

const PART_OF_SPEECH_ALIASES: Record<string, CanonicalPartOfSpeech> = {
  n: 'noun',
  noun: 'noun',
  'common noun': 'noun',
  'countable noun': 'noun',
  'uncountable noun': 'noun',
  'mass noun': 'noun',
  'noun phrase': 'noun',
  v: 'verb',
  verb: 'verb',
  vt: 'verb',
  vi: 'verb',
  'transitive verb': 'verb',
  'intransitive verb': 'verb',
  aux: 'verb',
  'auxiliary verb': 'verb',
  modal: 'verb',
  'modal verb': 'verb',
  'phrasal verb': 'verb',
  'verb phrase': 'verb',
  adj: 'adjective',
  adjective: 'adjective',
  'adjective phrase': 'adjective',
  adv: 'adverb',
  adverb: 'adverb',
  'adverbial phrase': 'adverb',
  prep: 'preposition',
  preposition: 'preposition',
  pron: 'pronoun',
  pronoun: 'pronoun',
  conj: 'conjunction',
  conjunction: 'conjunction',
  interj: 'interjection',
  interjection: 'interjection',
  det: 'determiner',
  determiner: 'determiner',
  article: 'determiner',
  'proper noun': 'noun',
  propernoun: 'noun',
};

export function normalizePartOfSpeechCategory(
  value: string | undefined | null
): CanonicalPartOfSpeech | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  const normalized = normalizePartOfSpeechKey(raw);
  if (/[,&;/|+]/.test(normalized) || /\b(?:and|or)\b/.test(normalized)) {
    return null;
  }
  return (
    PART_OF_SPEECH_ALIASES[normalized] ||
    PART_OF_SPEECH_ALIASES[normalized.replace(/\s/g, '')] ||
    null
  );
}

export function formatPartOfSpeechLabel(
  value: string | undefined | null,
  uiLanguage: UILanguage
): string {
  const raw = (value || '').trim();
  if (!raw) {
    return UNKNOWN_PART_OF_SPEECH_LABELS[uiLanguage];
  }

  const normalized = normalizePartOfSpeechKey(raw);
  const labels = PART_OF_SPEECH_LABELS[uiLanguage];
  if (PHRASE_PART_OF_SPEECH_KEYS.has(normalized)) {
    return labels.phrase;
  }
  return labels[normalized] || labels[normalized.replace(/\s/g, '')] || raw;
}
