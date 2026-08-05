import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appConfig = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const project = fs.readFileSync(
  new URL('../ios/Nuances.xcodeproj/project.pbxproj', import.meta.url),
  'utf8'
);

const marketingVersions = [...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(
  (match) => match[1].trim()
);
const buildNumbers = [...project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(
  (match) => match[1].trim()
);

test('all iOS targets use the app config marketing version', () => {
  assert.ok(marketingVersions.length > 0);
  assert.deepEqual([...new Set(marketingVersions)], [appConfig.expo.version]);
});

test('all iOS targets use the app config build number', () => {
  assert.ok(buildNumbers.length > 0);
  assert.deepEqual([...new Set(buildNumbers)], [appConfig.expo.ios.buildNumber]);
});

test('the next upload is newer than the closed 1.1.1 (84) train', () => {
  assert.notEqual(appConfig.expo.version, '1.1.1');
  assert.ok(Number(appConfig.expo.ios.buildNumber) > 84);
});
