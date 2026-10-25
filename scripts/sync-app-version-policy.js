#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PBXPROJ_PATH = path.join(PROJECT_ROOT, 'ios', 'Nuances.xcodeproj', 'project.pbxproj');
const DEFAULT_PLATFORM = 'ios';

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function loadEnv() {
  return {
    ...readEnvFile(path.join(PROJECT_ROOT, '.env')),
    ...readEnvFile(path.join(PROJECT_ROOT, '.env.local')),
    ...process.env,
  };
}

function extractMainAppBuildSettings() {
  const pbxproj = fs.readFileSync(PBXPROJ_PATH, 'utf8');
  const appBundleMarker = 'PRODUCT_BUNDLE_IDENTIFIER = com.jeffenglishlearning.nuances;';
  const markerIndex = pbxproj.indexOf(appBundleMarker);
  if (markerIndex < 0) {
    throw new Error('Could not find main app PRODUCT_BUNDLE_IDENTIFIER in Xcode project.');
  }

  const buildSettingsStart = pbxproj.lastIndexOf('buildSettings = {', markerIndex);
  const buildSettingsEnd = pbxproj.indexOf('};', markerIndex);
  if (buildSettingsStart < 0 || buildSettingsEnd < 0) {
    throw new Error('Could not isolate main app buildSettings in Xcode project.');
  }

  const block = pbxproj.slice(buildSettingsStart, buildSettingsEnd);
  const marketingVersion = block.match(/MARKETING_VERSION = ([^;]+);/)?.[1]?.trim();
  const buildNumber = block.match(/CURRENT_PROJECT_VERSION = ([^;]+);/)?.[1]?.trim();
  if (!marketingVersion || !buildNumber) {
    throw new Error('Could not read MARKETING_VERSION or CURRENT_PROJECT_VERSION from Xcode project.');
  }

  const numericBuildNumber = Number.parseInt(buildNumber, 10);
  if (!Number.isFinite(numericBuildNumber)) {
    throw new Error(`CURRENT_PROJECT_VERSION must be numeric. Received: ${buildNumber}`);
  }

  return { marketingVersion, buildNumber: numericBuildNumber };
}

function extractAndroidBuildSettings() {
  const gradlePath = path.join(PROJECT_ROOT, 'android', 'app', 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    const gradle = fs.readFileSync(gradlePath, 'utf8');
    const versionName = gradle.match(/versionName\s+["']([^"']+)["']/)?.[1]?.trim();
    const versionCode = gradle.match(/versionCode\s+(\d+)/)?.[1]?.trim();
    if (versionName && versionCode) {
      return { marketingVersion: versionName, buildNumber: Number.parseInt(versionCode, 10) };
    }
  }

  const appJsonPath = path.join(PROJECT_ROOT, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const marketingVersion = appJson.expo?.version?.trim();
    const buildNumber = appJson.expo?.android?.versionCode;
    if (marketingVersion && typeof buildNumber === 'number') {
      return { marketingVersion, buildNumber };
    }
  }

  throw new Error('Could not read Android versionName / versionCode from build.gradle or app.json.');
}

function extractBuildSettings(platform) {
  if (platform === 'android') {
    return extractAndroidBuildSettings();
  }
  return extractMainAppBuildSettings();
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    platform: DEFAULT_PLATFORM,
    source: 'manual',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    if (arg === '--platform') options.platform = argv[index + 1] || DEFAULT_PLATFORM;
    if (arg === '--source') options.source = argv[index + 1] || options.source;
  }
  return options;
}

async function syncPlatform(platform, options, supabaseUrl, syncToken) {
  const { marketingVersion, buildNumber } = extractBuildSettings(platform);

  const payload = {
    platform,
    latestVersion: marketingVersion,
    minimumSupportedVersion: marketingVersion,
    latestBuildNumber: buildNumber,
    minimumSupportedBuildNumber: buildNumber,
    required: true,
    source: options.source,
  };

  if (options.dryRun) {
    console.log(`[sync-app-version-policy] dry run payload (${platform}):`, JSON.stringify(payload, null, 2));
    return;
  }

  const endpoint = `${supabaseUrl}/functions/v1/sync-app-version-policy`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-token': syncToken,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`sync-app-version-policy for ${platform} failed (${response.status}): ${responseText || '<empty>'}`);
  }

  console.log(`[sync-app-version-policy] updated remote policy (${platform}):`, responseText);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const supabaseUrl = (env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '');
  const syncToken = env.APP_VERSION_POLICY_SYNC_TOKEN || env.SUPABASE_APP_VERSION_POLICY_SYNC_TOKEN || '';

  if (!options.dryRun) {
    if (!supabaseUrl) {
      throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_URL in .env.local.');
    }
    if (!syncToken) {
      throw new Error('Missing APP_VERSION_POLICY_SYNC_TOKEN in .env.local. Set the same value as the Supabase secret.');
    }
  }

  const platforms = options.platform === 'all' ? ['ios', 'android'] : [options.platform];
  for (const plat of platforms) {
    await syncPlatform(plat, options, supabaseUrl, syncToken);
  }
}

main().catch((error) => {
  console.error('[sync-app-version-policy] failed:', error.message || error);
  process.exit(1);
});
