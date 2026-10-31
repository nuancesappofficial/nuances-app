import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('appVersionService branches getCurrentBuildNumber by Platform.OS and avoids iOS fallback on Android', () => {
  const servicePath = join(__dirname, 'appVersionService.ts');
  const serviceContent = readFileSync(servicePath, 'utf8');

  // Must check Platform.OS === 'android'
  assert.equal(
    serviceContent.includes("if (Platform.OS === 'android')"),
    true,
    'getCurrentBuildNumber must branch for Android'
  );

  // Must not evaluate ios.buildNumber before android.versionCode on Android
  const androidBranchMatch = serviceContent.match(/if \(Platform\.OS === 'android'\)\s*\{([\s\S]*?)\}/);
  assert.ok(androidBranchMatch, 'Android branch should exist');
  assert.equal(
    androidBranchMatch[1].includes('ios?.buildNumber'),
    false,
    'Android branch must not reference ios?.buildNumber'
  );
});

test('poll-store-and-sync handles Android closed testing fallback and forwards actual build numbers', () => {
  const scriptPath = join(__dirname, '../../../scripts/poll-store-and-sync.mjs');
  const scriptContent = readFileSync(scriptPath, 'utf8');

  // Must extract Android build settings from gradle/app.json
  assert.equal(
    scriptContent.includes('function extractAndroidBuildSettings()'),
    true,
    'poll-store-and-sync must define extractAndroidBuildSettings'
  );

  // Must not simply skip Android when not_public
  assert.equal(
    /if \(liveAndroid\.status === 'not_public'\)\s*\{\s*console\.log\([^)]+\);\s*\}\s*else/s.test(scriptContent),
    false,
    'poll-store-and-sync must not silently skip Android on not_public'
  );

  // syncPolicyToSupabase must accept buildNumber parameter
  assert.equal(
    scriptContent.includes('buildNumber = 1'),
    true,
    'syncPolicyToSupabase must accept buildNumber'
  );
});
