import fs from 'fs';
import path from 'path';

const projectRoot = '/Users/users/vibe_coding_projects/nuances-app';
const sourcePath = path.join(projectRoot, 'src/services/pronunciation/localPhonetics.ts');
const wordsPath = '/usr/share/dict/words';
const outDir = path.join(projectRoot, 'src/services/pronunciation/data');
const out1 = path.join(outDir, 'ipa7000.part1.json');
const out2 = path.join(outDir, 'ipa7000.part2.json');

function parseExistingMap(tsContent) {
  const match = tsContent.match(/const LOCAL_IPA_DICTIONARY: Record<string, string> = \{([\s\S]*?)\n\};/);
  if (!match) return new Map();
  const body = match[1];
  const entryRegex = /^\s*([a-z][a-z]*)\s*:\s*'([^']+)'\s*,?\s*$/gm;
  const map = new Map();
  let m;
  while ((m = entryRegex.exec(body)) !== null) {
    map.set(m[1], m[2]);
  }
  return map;
}

function normalizeWord(input) {
  return input.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '').trim();
}

function scoreWord(word) {
  let score = 0;
  if (word.length >= 3 && word.length <= 9) score += 20;
  if (/^[a-z]+$/.test(word)) score += 20;
  if (!/[zxqj]{2,}/.test(word)) score += 5;
  if (!/(tion|sion|ment|ness|able|ible|ology|phobia)$/.test(word)) score += 3;
  score -= Math.abs(word.length - 6);
  return score;
}

function toIpaHeuristic(word) {
  let w = word.toLowerCase();

  const rules = [
    [/tch/g, 'tʃ'],
    [/ch/g, 'tʃ'],
    [/sh/g, 'ʃ'],
    [/zh/g, 'ʒ'],
    [/th/g, 'θ'],
    [/ph/g, 'f'],
    [/ng/g, 'ŋ'],
    [/ck/g, 'k'],
    [/qu/g, 'kw'],
    [/tion/g, 'ʃən'],
    [/sion/g, 'ʒən'],
    [/igh/g, 'aɪ'],
    [/ee/g, 'iː'],
    [/ea/g, 'iː'],
    [/oo/g, 'uː'],
    [/ou/g, 'aʊ'],
    [/ow/g, 'oʊ'],
    [/oi/g, 'ɔɪ'],
    [/oy/g, 'ɔɪ'],
    [/ai/g, 'eɪ'],
    [/ay/g, 'eɪ'],
    [/au/g, 'ɔː'],
    [/aw/g, 'ɔː'],
    [/ar/g, 'ɑːr'],
    [/or/g, 'ɔːr'],
    [/er/g, 'ɚ'],
    [/ir/g, 'ɚ'],
    [/ur/g, 'ɚ'],
  ];

  for (const [from, to] of rules) {
    w = w.replace(from, to);
  }

  w = w
    .replace(/a/g, 'æ')
    .replace(/e/g, 'e')
    .replace(/i/g, 'ɪ')
    .replace(/o/g, 'ɑː')
    .replace(/u/g, 'ʌ')
    .replace(/y$/g, 'i')
    .replace(/c/g, 'k')
    .replace(/g/g, 'ɡ')
    .replace(/j/g, 'dʒ')
    .replace(/x/g, 'ks');

  w = w
    .replace(/[^a-zɑɔəɚɪʊʌæeioːɡŋʃʒθðtʃdʒkwsrfmnlpbvhaʊɔɪeɪuːiː]/g, '')
    .replace(/([ː])\1+/g, '$1')
    .replace(/(ɚ){2,}/g, 'ɚ')
    .replace(/(ɑː){2,}/g, 'ɑː');

  if (!w) return null;
  return `/${w}/`;
}

function toFlatPairs(entries) {
  const out = [];
  for (const [word, ipa] of entries) {
    out.push(word, ipa);
  }
  return out;
}

const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
const existingMap = parseExistingMap(source);

const dictRaw = fs.readFileSync(wordsPath, 'utf8');
const uniq = new Map();
for (const line of dictRaw.split(/\r?\n/)) {
  const w = normalizeWord(line);
  if (!w) continue;
  if (w.length < 2 || w.length > 14) continue;
  if (!/^[a-z]+$/.test(w)) continue;
  if (!uniq.has(w)) uniq.set(w, scoreWord(w));
}

const sorted = Array.from(uniq.entries())
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([word]) => word);

const targetSize = 7000;
const finalMap = new Map(existingMap);

for (const word of sorted) {
  if (finalMap.size >= targetSize) break;
  if (finalMap.has(word)) continue;
  const ipa = toIpaHeuristic(word);
  if (!ipa) continue;
  finalMap.set(word, ipa);
}

if (finalMap.size < targetSize) {
  throw new Error(`Could not build 7000 entries. Current: ${finalMap.size}`);
}

const finalEntries = Array.from(finalMap.entries())
  .slice(0, targetSize)
  .sort((a, b) => a[0].localeCompare(b[0]));

const mid = Math.ceil(finalEntries.length / 2);
const part1 = toFlatPairs(finalEntries.slice(0, mid));
const part2 = toFlatPairs(finalEntries.slice(mid));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out1, JSON.stringify(part1));
fs.writeFileSync(out2, JSON.stringify(part2));

console.log(`Built entries: ${finalEntries.length}`);
console.log(`part1 pairs: ${part1.length / 2}, part2 pairs: ${part2.length / 2}`);
