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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const supabaseUrl = (env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '');
  const syncToken = env.APP_VERSION_POLICY_SYNC_TOKEN || env.SUPABASE_APP_VERSION_POLICY_SYNC_TOKEN || '';
  const { marketingVersion, buildNumber } = extractMainAppBuildSettings();

  const payload = {
    platform: options.platform,
    latestVersion: marketingVersion,
    minimumSupportedVersion: marketingVersion,
    latestBuildNumber: buildNumber,
    minimumSupportedBuildNumber: buildNumber,
    required: true,
    source: options.source,
  };

  if (options.dryRun) {
    console.log('[sync-app-version-policy] dry run payload:', JSON.stringify(payload, null, 2));
    return;
  }

  if (!supabaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_URL in .env.local.');
  }
  if (!syncToken) {
    throw new Error('Missing APP_VERSION_POLICY_SYNC_TOKEN in .env.local. Set the same value as the Supabase secret.');
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
    throw new Error(`sync-app-version-policy failed (${response.status}): ${responseText || '<empty>'}`);
  }

  console.log('[sync-app-version-policy] updated remote policy:', responseText);
}

main().catch((error) => {
  console.error('[sync-app-version-policy] failed:', error.message || error);
  process.exit(1);
});
