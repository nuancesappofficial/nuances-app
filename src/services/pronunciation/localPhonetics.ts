type FlatPairs = string[];

let ipaMapPromise: Promise<Map<string, string>> | null = null;

function normalizeWord(input: string): string {
  return input
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, '')
    .trim();
}

function candidateBaseForms(word: string): string[] {
  const forms = new Set<string>([word]);

  if (word.endsWith('ies') && word.length > 4) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith('es') && word.length > 3) forms.add(word.slice(0, -2));
  if (word.endsWith('s') && word.length > 2) forms.add(word.slice(0, -1));

  if (word.endsWith('ied') && word.length > 4) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith('ed') && word.length > 3) {
    const stem = word.slice(0, -2);
    forms.add(stem);
    forms.add(`${stem}e`);
  }

  if (word.endsWith('ing') && word.length > 5) {
    const stem = word.slice(0, -3);
    forms.add(stem);
    forms.add(`${stem}e`);
  }

  if (word.endsWith('ly') && word.length > 4) forms.add(word.slice(0, -2));
  if (word.endsWith('er') && word.length > 4) forms.add(word.slice(0, -2));
  if (word.endsWith('est') && word.length > 5) forms.add(word.slice(0, -3));

  return Array.from(forms);
}

function ingestFlatPairs(target: Map<string, string>, flat: FlatPairs): void {
  for (let i = 0; i < flat.length; i += 2) {
    const word = flat[i];
    const ipa = flat[i + 1];
    if (!word || !ipa) continue;
    target.set(word, ipa);
  }
}

async function loadIpaMap(): Promise<Map<string, string>> {
  if (ipaMapPromise) return ipaMapPromise;

  ipaMapPromise = Promise.all([
    import('./data/ipa7000.part1.json'),
    import('./data/ipa7000.part2.json'),
  ]).then(([part1Module, part2Module]) => {
    const map = new Map<string, string>();
    ingestFlatPairs(map, part1Module.default as FlatPairs);
    ingestFlatPairs(map, part2Module.default as FlatPairs);
    return map;
  });

  return ipaMapPromise;
}

export async function getLocalPhoneticTranscription(input: string): Promise<string | null> {
  const normalized = normalizeWord(input);
  if (!normalized) return null;

  const map = await loadIpaMap();
  const candidates = candidateBaseForms(normalized);
  for (const candidate of candidates) {
    const ipa = map.get(candidate);
    if (ipa) return ipa;
  }

  return null;
}

export async function getLocalPhoneticsWordCount(): Promise<number> {
  const map = await loadIpaMap();
  return map.size;
}

export async function warmupLocalPhonetics(): Promise<void> {
  await loadIpaMap();
}
