import { speakViaAzureTtsProxy } from '@services/tts/cloudSpeech';
import { getLocalPhoneticTranscription } from './localPhonetics';

type SpeakOptions = {
  demoExperience?: boolean;
  onDownloadStart?: () => void;
  onDownloadEnd?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};

const AZURE_TO_IPA: Record<string, string> = {
  aa: 'ɑ',
  ae: 'æ',
  ah: 'ʌ',
  ao: 'ɔ',
  aw: 'aʊ',
  ax: 'ə',
  ay: 'aɪ',
  b: 'b',
  ch: 'tʃ',
  d: 'd',
  dh: 'ð',
  eh: 'ɛ',
  er: 'ɝ',
  ey: 'eɪ',
  f: 'f',
  g: 'g',
  hh: 'h',
  ih: 'ɪ',
  iy: 'i',
  jh: 'dʒ',
  k: 'k',
  l: 'l',
  m: 'm',
  n: 'n',
  ng: 'ŋ',
  ow: 'oʊ',
  oy: 'ɔɪ',
  p: 'p',
  r: 'ɹ',
  s: 's',
  sh: 'ʃ',
  t: 't',
  th: 'θ',
  uh: 'ʊ',
  uw: 'u',
  v: 'v',
  w: 'w',
  y: 'j',
  z: 'z',
  zh: 'ʒ',
};

const IPA_TOKEN_ALIASES: Record<string, string> = {
  'ɡ': 'g',
  r: 'ɹ',
  'əʊ': 'oʊ',
};

const ENGLISH_IPA_TOKENS = [
  'tʃ',
  'dʒ',
  'aɪ',
  'aʊ',
  'eɪ',
  'oʊ',
  'ɔɪ',
  'iː',
  'uː',
  'ɑː',
  'ɔː',
  'ɜː',
  'ɪə',
  'eə',
  'ʊə',
  'p',
  'b',
  't',
  'd',
  'k',
  'g',
  'f',
  'v',
  'θ',
  'ð',
  's',
  'z',
  'ʃ',
  'ʒ',
  'h',
  'm',
  'n',
  'ŋ',
  'l',
  'ɹ',
  'j',
  'w',
  'i',
  'ɪ',
  'e',
  'ɛ',
  'æ',
  'ə',
  'ʌ',
  'u',
  'ʊ',
  'o',
  'ɔ',
  'ɑ',
  'ɒ',
  'ɝ',
  'ɚ',
] as const;

const ENGLISH_IPA_TOKEN_SET = new Set<string>(ENGLISH_IPA_TOKENS);
const IPA_TRANSCRIPTION_SEPARATORS = /[\s/[\]().·‿|_-]/;

function stripSlashes(input: string): string {
  return input.trim().replace(/^\/+|\/+$/g, '').trim();
}

function normalizePhonemeKey(input: string): string {
  return stripSlashes(input)
    .toLowerCase()
    .replace(/[0-2]/g, '')
    .replace(/[^a-zəɚɝɜɑæʌɔʊɪɛθðʃʒŋːˈˌɹɒ]+/g, '')
    .trim();
}

export function getIpaSymbol(rawPhoneme: string | null | undefined): string {
  const normalized = normalizePhonemeKey(rawPhoneme || '');
  if (!normalized) return '';
  const mappedAzureSymbol = AZURE_TO_IPA[normalized];
  if (mappedAzureSymbol) return mappedAzureSymbol;

  const stripped = stripSlashes(rawPhoneme || '')
    .replace(/ɡ/g, 'g')
    .replace(/^r$/, 'ɹ');
  const aliased = IPA_TOKEN_ALIASES[stripped] || stripped;
  return ENGLISH_IPA_TOKEN_SET.has(aliased) ? aliased : '';
}

export function formatIpaPhoneme(rawPhoneme: string | null | undefined): string {
  const ipa = getIpaSymbol(rawPhoneme);
  return ipa ? `/${ipa}/` : '';
}

export function getIpaPhonemeAudioText(rawPhoneme: string | null | undefined): string {
  const ipa = getIpaSymbol(rawPhoneme);
  return ipa ? `ipa:${ipa}` : '';
}

export function getIpaPhonemeAudioTarget(rawPhoneme: string | null | undefined): string {
  const ipa = getIpaSymbol(rawPhoneme);
  return ipa ? `ipa:${ipa}` : '';
}

export function tokenizeEnglishIpaTranscription(
  rawTranscription: string | null | undefined
): string[] {
  const source = stripSlashes(rawTranscription || '')
    .replace(/ɡ/g, 'g')
    .replace(/:/g, 'ː')
    .replace(/əʊ/g, 'oʊ');
  if (!source) return [];

  const tokens: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const char = source[cursor];
    if (
      IPA_TRANSCRIPTION_SEPARATORS.test(char) ||
      char === 'ˈ' ||
      char === 'ˌ'
    ) {
      cursor += 1;
      continue;
    }

    const token = ENGLISH_IPA_TOKENS.find((candidate) =>
      source.startsWith(candidate, cursor)
    );
    if (!token) return [];
    tokens.push(IPA_TOKEN_ALIASES[token] || token);
    cursor += token.length;
  }
  return tokens;
}

export async function loadStandardIpaPhonemes(
  text: string,
  storedTranscription?: string | null
): Promise<string[]> {
  const storedTokens = tokenizeEnglishIpaTranscription(storedTranscription);
  if (storedTokens.length > 0) return storedTokens;

  const localTranscription = await getLocalPhoneticTranscription(text);
  const localTokens = tokenizeEnglishIpaTranscription(localTranscription);
  if (localTokens.length > 0) return localTokens;

  const words = text
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
    .filter(Boolean);
  if (words.length <= 1) return [];

  const phraseTokens: string[] = [];
  for (const word of words) {
    const transcription = await getLocalPhoneticTranscription(word);
    const tokens = tokenizeEnglishIpaTranscription(transcription);
    if (tokens.length === 0) return [];
    phraseTokens.push(...tokens);
  }
  return phraseTokens;
}

import {
  hasBundledPhonics,
  playBundledPhonics,
  stopBundledPhonicsPlayback,
} from './bundledPhonics';

export { hasBundledPhonics, stopBundledPhonicsPlayback };

export async function speakIpaPhoneme(
  rawPhoneme: string | null | undefined,
  options?: SpeakOptions
): Promise<void> {
  const token = (rawPhoneme || '').trim();
  const ipa = getIpaSymbol(token);
  const candidate = ipa || token;

  if (candidate) {
    const playedLocally = await playBundledPhonics(candidate, {
      onDone: options?.onDone,
      onStopped: options?.onStopped,
      onError: options?.onError,
    });
    if (playedLocally) {
      return;
    }
  }

  const sampleText = getIpaPhonemeAudioText(rawPhoneme);
  if (!sampleText) {
    options?.onError?.();
    return;
  }
  await speakViaAzureTtsProxy(sampleText, {
    ...options,
    locale: 'en-US',
    rate: '-20%',
    ipaPhoneme: ipa || undefined,
    demoExperience: options?.demoExperience === true,
  });
}
