import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('the complete tutorial ships inside the installed app', () => {
  const appConfig = JSON.parse(read('app.json'));
  assert.ok(
    appConfig.expo.assetBundlePatterns?.includes('assets/app/tutorial/**/*'),
    'assets/app/tutorial/**/* must be embedded in the native app bundle'
  );

  for (const path of [
    'assets/app/tutorial/demo-card/smallest-nuances-with-text-v2.png',
    'assets/app/tutorial/demo-card/nuances-pronunciation.wav',
    'assets/app/tutorial/raw/Chinese/01_share_or_capture.mov',
    'assets/app/tutorial/raw/Chinese/02_upload_text.mov',
    'assets/app/tutorial/raw/Chinese/03_upload_image.mov',
    'assets/app/tutorial/raw/Chinese/04_make_card.mov',
    'assets/app/tutorial/raw/Chinese/05_review_card.mov',
  ]) {
    assert.equal(existsSync(new URL(path, root)), true, `${path} is missing`);
  }
});

test('tutorial startup never downloads an asset or a JS screen bundle', () => {
  const defaultCardSource = read('src/features/cache/defaultExperienceCard.ts');
  const appSource = read('App.tsx');

  assert.doesNotMatch(defaultCardSource, /downloadAsync\s*\(/);
  assert.match(
    appSource,
    /import\s+VideoTourFlow(?:,\s*\{[^}]*\})?\s+from\s+'.\/src\/screens\/flow\/VideoTourFlow'/
  );
  assert.doesNotMatch(appSource, /require\('.\/src\/screens\/flow\/VideoTourFlow'\)/);
});
