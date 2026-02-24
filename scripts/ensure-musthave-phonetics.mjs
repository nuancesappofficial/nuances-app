import fs from 'fs';

const p1='src/services/pronunciation/data/ipa7000.part1.json';
const p2='src/services/pronunciation/data/ipa7000.part2.json';

const mustHave = [
  'gap','need','needs','needed','using','used','use','used','find','found','make','made','take','took','taken',
  'come','came','go','went','gone','work','works','working','learn','learning','word','words','sentence','context',
  'card','cards','review','save','saved','create','created','analysis','analyze','result','results','input','output',
  'photo','image','camera','crop','share','sheet','cache','sync','user','users','profile','settings','level','goal',
  'english','language','study','practice','definition','example','pronunciation','phonetic','collocation','tag','tags',
  'business','academic','casual','professional','ielts','toefl','toeic','cefr','listening','speaking','reading','writing'
];

function heuristic(word){
  let w = word.toLowerCase();
  const rules = [
    [/tch/g, 'tʃ'], [/ch/g, 'tʃ'], [/sh/g, 'ʃ'], [/th/g, 'θ'], [/ph/g, 'f'], [/ng/g, 'ŋ'],
    [/tion/g, 'ʃən'], [/sion/g, 'ʒən'], [/igh/g, 'aɪ'], [/ee/g, 'iː'], [/ea/g, 'iː'],
    [/oo/g, 'uː'], [/ou/g, 'aʊ'], [/ow/g, 'oʊ'], [/oi/g, 'ɔɪ'], [/oy/g, 'ɔɪ'],
  ];
  for (const [a,b] of rules) w = w.replace(a,b);
  w = w.replace(/a/g,'æ').replace(/e/g,'e').replace(/i/g,'ɪ').replace(/o/g,'ɑː').replace(/u/g,'ʌ')
       .replace(/c/g,'k').replace(/g/g,'ɡ').replace(/j/g,'dʒ').replace(/x/g,'ks');
  w = w.replace(/[^a-zɑɔəɚɪʊʌæeioːɡŋʃʒθðtʃdʒkwsrfmnlpbvhaʊɔɪ]/g,'');
  return w ? `/${w}/` : null;
}

function load(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function toMap(flat){const m=new Map(); for(let i=0;i<flat.length;i+=2){m.set(flat[i],flat[i+1]);} return m;}
function toFlat(entries){const a=[]; for(const [k,v] of entries){a.push(k,v);} return a;}

const map = toMap([...load(p1), ...load(p2)]);
for (const word of mustHave) {
  if (!/^[a-z]+$/.test(word)) continue;
  if (!map.has(word)) {
    const ipa = heuristic(word);
    if (ipa) map.set(word, ipa);
  }
}

const sorted = Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).slice(0,7000);
const mid = Math.ceil(sorted.length/2);
fs.writeFileSync(p1, JSON.stringify(toFlat(sorted.slice(0,mid))));
fs.writeFileSync(p2, JSON.stringify(toFlat(sorted.slice(mid))));

const check = new Map(sorted);
console.log('size', sorted.length, 'gap', check.get('gap') || 'missing');
