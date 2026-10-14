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

test('Android config in app.json matches version and specifies versionCode', () => {
  assert.ok(appConfig.expo.android?.versionCode != null);
  assert.ok(Number.isInteger(appConfig.expo.android.versionCode));
  assert.ok(appConfig.expo.android.versionCode >= 1);
});

test('Android build.gradle matches app config version when present', () => {
  const gradlePath = new URL('../android/app/build.gradle', import.meta.url);
  if (!fs.existsSync(gradlePath)) return;
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const versionNameMatch = gradle.match(/versionName\s+["']([^"']+)["']/);
  const versionCodeMatch = gradle.match(/versionCode\s+(\d+)/);

  assert.ok(versionNameMatch, 'versionName found in android/app/build.gradle');
  assert.ok(versionCodeMatch, 'versionCode found in android/app/build.gradle');
  assert.equal(versionNameMatch[1], appConfig.expo.version);
  assert.equal(Number(versionCodeMatch[1]), appConfig.expo.android.versionCode);
});
