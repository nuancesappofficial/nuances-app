/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'src/i18n/uiLanguage.ts');
const OUTPUT_PATH = path.join(ROOT, 'src/i18n/uiLanguageAdditional.ts');
const TARGETS = ['ja', 'ko', 'es', 'fr'];
const MAX_BATCH_CHARS = 600;
const TRANSLATION_OVERRIDES = {
  ja: {
    'common.trial': 'トライアル',
    'deck.quickQuiz': 'クイッククイズ',
    'deck.play': 'クイズ',
    'deck.todayReview': '今日の復習',
    'cardDetail.front': '表面',
    'cardDetail.back': '裏面',
    'profile.rateApp': 'Nuancesを評価',
    'settings.language.korean': '韓国語',
    'settings.membership.plan.weekly': '週間',
    'settings.membership.plan.monthly': '月間',
    'settings.membership.plan.yearly': '年間',
    'auth.continueWithApple': 'Appleで続ける',
    'onboarding.start': 'Nuancesを始める',
    'review.playAgain': 'もう一度',
  },
  ko: {
    'common.trial': '체험',
    'deck.play': '퀴즈',
    'deck.todayReview': '오늘의 복습',
    'cardDetail.front': '앞면',
    'cardDetail.back': '뒷면',
    'profile.rateApp': 'Nuances 평가하기',
    'settings.membership.plan.weekly': '주간',
    'settings.membership.plan.monthly': '월간',
    'settings.membership.plan.yearly': '연간',
    'onboarding.start': 'Nuances 시작하기',
  },
  es: {
    'common.trial': 'Prueba',
    'deck.play': 'Cuestionario',
    'deck.todayReview': 'Repaso de hoy',
    'cardDetail.front': 'Anverso',
    'cardDetail.back': 'Reverso',
    'profile.rateApp': 'Calificar Nuances',
    'onboarding.start': 'Empezar con Nuances',
    'review.done': 'Listo',
  },
  fr: {
    'common.trial': 'Essai',
    'deck.play': 'Quiz',
    'deck.todayReview': 'Révision du jour',
    'cardDetail.front': 'Recto',
    'cardDetail.back': 'Verso',
    'profile.rateApp': 'Noter Nuances',
    'onboarding.start': 'Commencer avec Nuances',
    'review.finalScore': 'Score final',
  },
};

function cachePath(language) {
  return path.join('/tmp', `nuances-ui-translations-${language}.json`);
}

function readEnglishStrings() {
  const sourceText = fs.readFileSync(SOURCE_PATH, 'utf8');
  const source = ts.createSourceFile(SOURCE_PATH, sourceText, ts.ScriptTarget.Latest, true);
  let stringsObject = null;

  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'STRINGS') {
        stringsObject = declaration.initializer;
      }
    }
  });

  if (!stringsObject || !ts.isObjectLiteralExpression(stringsObject)) {
    throw new Error('Unable to find STRINGS object.');
  }
  const englishProperty = stringsObject.properties.find(
    (property) => ts.isPropertyAssignment(property) && property.name.getText(source).replace(/["']/g, '') === 'en'
  );
  if (!englishProperty || !ts.isPropertyAssignment(englishProperty) || !ts.isObjectLiteralExpression(englishProperty.initializer)) {
    throw new Error('Unable to find STRINGS.en object.');
  }

  return englishProperty.initializer.properties.map((property) => {
    if (!ts.isPropertyAssignment(property)) throw new Error('Unsupported UI string property.');
    const key = property.name.getText(source).replace(/^['"]|['"]$/g, '');
    const valueNode = property.initializer;
    if (!ts.isStringLiteral(valueNode) && !ts.isNoSubstitutionTemplateLiteral(valueNode)) {
      throw new Error(`Unsupported UI string value for ${key}.`);
    }
    return [key, valueNode.text];
  });
}

function splitIntoBatches(entries) {
  const batches = [];
  let current = [];
  let currentLength = 0;
  for (const entry of entries) {
    const nextLength = entry[1].length + 48;
    if (current.length > 0 && currentLength + nextLength > MAX_BATCH_CHARS) {
      batches.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(entry);
    currentLength += nextLength;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function placeholders(value) {
  return [...value.matchAll(/\{[^}]+\}/g)].map((match) => match[0]).sort();
}

async function translateBatch(language, batch, attempt = 1) {
  const separators = batch.slice(1).map((_, index) => `|||${String(index + 1).padStart(4, '0')}|||`);
  const input = batch
    .map((entry, index) => (index === 0 ? entry[1] : `${separators[index - 1]}\n${entry[1]}`))
    .join('\n');
  const params = new URLSearchParams({ client: 'gtx', sl: 'en', tl: language, dt: 't', q: input });

  try {
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const translated = payload[0].map((segment) => segment[0]).join('');
    const markerPattern = /\n?\|\|\|\d{4}\|\|\|\n?/g;
    const values = translated.split(markerPattern).map((value) => value.trim());
    if (values.length !== batch.length) {
      throw new Error(
        `${language}: expected ${batch.length} strings, received ${values.length}. Output: ${translated.slice(0, 800)}`
      );
    }
    return values.map((value, index) => {
      const sourcePlaceholders = placeholders(batch[index][1]);
      const translatedPlaceholders = placeholders(value);
      if (JSON.stringify(sourcePlaceholders) !== JSON.stringify(translatedPlaceholders)) {
        throw new Error(`Placeholder mismatch for ${batch[index][0]}.`);
      }
      return value.replace(/ニュアンス|뉘앙스/g, 'Nuances');
    });
  } catch (error) {
    if (attempt >= 4) throw error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    return translateBatch(language, batch, attempt + 1);
  }
}

async function translateLanguage(language, entries) {
  const translated = {};
  const batches = splitIntoBatches(entries);
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const values = await translateBatch(language, batch);
    batch.forEach(([key], valueIndex) => {
      translated[key] = values[valueIndex];
    });
    process.stdout.write(`${language} ${index + 1}/${batches.length}\n`);
  }
  return translated;
}

function renderLanguage(language, values, entries) {
  const lines = entries.map(([key]) => {
    const translated = TRANSLATION_OVERRIDES[language]?.[key] || values[key];
    const brandSafe = translated
      .replace(/ニュアンス|뉘앙스|Matices|matices/g, 'Nuances')
      .replace(/\bnuances\b/gi, 'Nuances');
    return `    ${JSON.stringify(key)}: ${JSON.stringify(brandSafe)},`;
  });
  return `  ${JSON.stringify(language)}: {\n${lines.join('\n')}\n  },`;
}

async function main() {
  const entries = readEnglishStrings();
  const requestedLanguage = process.argv[2];
  const requestedTargets = requestedLanguage === 'render' ? [] : requestedLanguage ? [requestedLanguage] : TARGETS;
  if (requestedTargets.some((language) => !TARGETS.includes(language))) {
    throw new Error(`Unsupported target language: ${requestedLanguage}`);
  }
  for (const language of requestedTargets) {
    const values = await translateLanguage(language, entries);
    fs.writeFileSync(cachePath(language), JSON.stringify(values), 'utf8');
  }
  const translated = Object.fromEntries(
    TARGETS.map((language) => {
      const languageCachePath = cachePath(language);
      if (!fs.existsSync(languageCachePath)) {
        throw new Error(`Missing generated cache for ${language}. Run this script with ${language} first.`);
      }
      const values = JSON.parse(fs.readFileSync(languageCachePath, 'utf8'));
      if (Object.keys(values).length !== entries.length) {
        throw new Error(`Incomplete generated cache for ${language}.`);
      }
      return [language, values];
    })
  );
  const output = [
    "import type { UIStringKey } from './uiLanguage';",
    '',
    "type AdditionalUILanguage = 'ja' | 'ko' | 'es' | 'fr';",
    '',
    '// Generated static UI translations. Do not translate at runtime.',
    'export const ADDITIONAL_UI_STRINGS: Record<AdditionalUILanguage, Record<UIStringKey, string>> = {',
    ...TARGETS.map((language) => renderLanguage(language, translated[language], entries)),
    '};',
    '',
  ].join('\n');
  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
