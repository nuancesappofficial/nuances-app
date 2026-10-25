#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const BUNDLE_ID = 'com.jeffenglishlearning.nuances';
const DEFAULT_ANON_KEY = 'sb_publishable_C0-jx_SFWceRy1eVTF33Kw_gN0tkV4B';

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

function compareSemver(v1, v2) {
  const p1 = (v1 || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = (v2 || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
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

  return null;
}

function extractIosBuildSettings() {
  const pbxprojPath = path.join(PROJECT_ROOT, 'ios', 'Nuances.xcodeproj', 'project.pbxproj');
  if (fs.existsSync(pbxprojPath)) {
    const pbxproj = fs.readFileSync(pbxprojPath, 'utf8');
    const appBundleMarker = 'PRODUCT_BUNDLE_IDENTIFIER = com.jeffenglishlearning.nuances;';
    const markerIndex = pbxproj.indexOf(appBundleMarker);
    if (markerIndex >= 0) {
      const buildSettingsStart = pbxproj.lastIndexOf('buildSettings = {', markerIndex);
      const buildSettingsEnd = pbxproj.indexOf('};', markerIndex);
      if (buildSettingsStart >= 0 && buildSettingsEnd >= 0) {
        const block = pbxproj.slice(buildSettingsStart, buildSettingsEnd);
        const marketingVersion = block.match(/MARKETING_VERSION = ([^;]+);/)?.[1]?.trim();
        const buildNumber = block.match(/CURRENT_PROJECT_VERSION = ([^;]+);/)?.[1]?.trim();
        if (marketingVersion && buildNumber) {
          const numericBuild = Number.parseInt(buildNumber, 10);
          if (Number.isFinite(numericBuild)) {
            return { marketingVersion, buildNumber: numericBuild };
          }
        }
      }
    }
  }

  const appJsonPath = path.join(PROJECT_ROOT, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const marketingVersion = appJson.expo?.version?.trim();
    const buildNumber = appJson.expo?.ios?.buildNumber;
    if (marketingVersion && buildNumber) {
      const numericBuild = Number.parseInt(buildNumber, 10);
      if (Number.isFinite(numericBuild)) {
        return { marketingVersion, buildNumber: numericBuild };
      }
    }
  }

  return null;
}

async function getLiveAppStoreVersion() {
  try {
    const url = `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[AutoSync] iTunes lookup returned status ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data.resultCount > 0 && data.results[0]?.version) {
      return data.results[0].version;
    }
    return null;
  } catch (err) {
    console.warn('[AutoSync] Error fetching App Store version:', err.message);
    return null;
  }
}

async function getLiveGooglePlayVersion() {
  try {
    const url = `https://play.google.com/store/apps/details?id=${BUNDLE_ID}&hl=en`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 404) {
      return { status: 'not_public', version: null };
    }
    if (!res.ok) {
      return { status: 'error', version: null };
    }
    const html = await res.text();
    const match = html.match(/\[\[\["([0-9]+\.[0-9]+\.[0-9]+)"\]\]/);
    if (match && match[1]) {
      return { status: 'public', version: match[1] };
    }
    return { status: 'public_no_version', version: null };
  } catch (err) {
    return { status: 'error', version: null, error: err.message };
  }
}

async function getSupabaseCurrentPolicies(supabaseUrl, anonKey) {
  const url = `${supabaseUrl}/rest/v1/app_version_policy?select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch current Supabase policies (${res.status}): ${await res.text()}`);
  }
  return await res.json();
}

async function syncPolicyToSupabase(supabaseUrl, syncToken, platform, newVersion, buildNumber = 1, dryRun = false) {
  const payload = {
    platform,
    latestVersion: newVersion,
    minimumSupportedVersion: newVersion,
    latestBuildNumber: buildNumber,
    minimumSupportedBuildNumber: buildNumber,
    required: true,
    source: 'github-action-auto-poll',
  };

  if (dryRun) {
    console.log(`[AutoSync][DRY-RUN] Would update ${platform} policy:`, payload);
    return;
  }

  const endpoint = `${supabaseUrl}/functions/v1/sync-app-version-policy`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-token': syncToken,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`sync-app-version-policy failed (${res.status}): ${await res.text()}`);
  }
  console.log(`[AutoSync] Successfully synced ${platform} version ${newVersion} (build ${buildNumber}) to Supabase!`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const env = loadEnv();
  const supabaseUrl = (env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || 'https://cjmfobjitkmmideecfsw.supabase.co').replace(/\/+$/, '');
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
  const syncToken = env.APP_VERSION_POLICY_SYNC_TOKEN || env.SUPABASE_APP_VERSION_POLICY_SYNC_TOKEN;

  console.log(`[AutoSync] Starting daily store version scan... (${new Date().toISOString()})`);
  if (dryRun) console.log('[AutoSync] Running in DRY-RUN mode.');

  const policies = await getSupabaseCurrentPolicies(supabaseUrl, anonKey);
  const iosPolicy = policies.find((p) => p.platform === 'ios');
  const androidPolicy = policies.find((p) => p.platform === 'android');

  console.log(`[AutoSync] Current Supabase Policy: iOS = ${iosPolicy?.latest_version || 'none'} (build ${iosPolicy?.latest_build_number || 'none'}), Android = ${androidPolicy?.latest_version || 'none'} (build ${androidPolicy?.latest_build_number || 'none'})`);

  // 1. Check iOS App Store
  const liveIosVersion = await getLiveAppStoreVersion();
  console.log(`[AutoSync] Live Apple App Store version: ${liveIosVersion || 'not found'}`);

  if (liveIosVersion) {
    const iosSettings = extractIosBuildSettings();
    const targetBuildNumber = iosSettings?.buildNumber ?? 1;
    const cmp = compareSemver(liveIosVersion, iosPolicy?.latest_version);
    const isNewerBuild =
      cmp === 0 &&
      typeof iosPolicy?.latest_build_number === 'number' &&
      targetBuildNumber > iosPolicy.latest_build_number;

    if (cmp > 0 || isNewerBuild) {
      console.log(`[AutoSync] >> DETECTED iOS UPGRADE: App Store (${liveIosVersion}, build ${targetBuildNumber}) > Supabase (${iosPolicy?.latest_version || 'none'}, build ${iosPolicy?.latest_build_number || 'none'})!`);
      if (!syncToken && !dryRun) {
        console.error('[AutoSync] ERROR: Missing APP_VERSION_POLICY_SYNC_TOKEN. Cannot trigger sync.');
      } else {
        await syncPolicyToSupabase(supabaseUrl, syncToken, 'ios', liveIosVersion, targetBuildNumber, dryRun);
      }
    } else {
      console.log(`[AutoSync] iOS policy is already up-to-date with App Store (${liveIosVersion}).`);
    }
  }

  // 2. Check Android Google Play
  const liveAndroid = await getLiveGooglePlayVersion();
  const androidSettings = extractAndroidBuildSettings();

  if (liveAndroid.status === 'not_public') {
    console.log('[AutoSync] Google Play Store: App is in internal/closed testing (not publicly indexed yet). Checking local build settings for closed/internal policy...');
    if (androidSettings) {
      const cmp = compareSemver(androidSettings.marketingVersion, androidPolicy?.latest_version);
      const isNewerBuild =
        cmp === 0 &&
        typeof androidPolicy?.latest_build_number === 'number' &&
        androidSettings.buildNumber > androidPolicy.latest_build_number;

      if (cmp > 0 || isNewerBuild) {
        console.log(`[AutoSync] >> DETECTED Android internal/closed testing upgrade: ${androidSettings.marketingVersion} (build ${androidSettings.buildNumber}) > Supabase (${androidPolicy?.latest_version || 'none'}, build ${androidPolicy?.latest_build_number || 'none'})!`);
        if (!syncToken && !dryRun) {
          console.error('[AutoSync] ERROR: Missing APP_VERSION_POLICY_SYNC_TOKEN. Cannot trigger sync.');
        } else {
          await syncPolicyToSupabase(supabaseUrl, syncToken, 'android', androidSettings.marketingVersion, androidSettings.buildNumber, dryRun);
        }
      } else {
        console.log(`[AutoSync] Android policy is already up-to-date with internal/closed testing (${androidSettings.marketingVersion}, build ${androidSettings.buildNumber}).`);
      }
    } else {
      console.warn('[AutoSync] Could not read local Android settings for closed testing fallback.');
    }
  } else if (liveAndroid.version) {
    console.log(`[AutoSync] Live Google Play version: ${liveAndroid.version}`);
    const targetBuildNumber = androidSettings?.buildNumber ?? 1;
    const cmp = compareSemver(liveAndroid.version, androidPolicy?.latest_version);
    const isNewerBuild =
      cmp === 0 &&
      typeof androidPolicy?.latest_build_number === 'number' &&
      targetBuildNumber > androidPolicy.latest_build_number;

    if (cmp > 0 || isNewerBuild) {
      console.log(`[AutoSync] >> DETECTED Android UPGRADE: Google Play (${liveAndroid.version}, build ${targetBuildNumber}) > Supabase (${androidPolicy?.latest_version || 'none'}, build ${androidPolicy?.latest_build_number || 'none'})!`);
      if (!syncToken && !dryRun) {
        console.error('[AutoSync] ERROR: Missing APP_VERSION_POLICY_SYNC_TOKEN. Cannot trigger sync.');
      } else {
        await syncPolicyToSupabase(supabaseUrl, syncToken, 'android', liveAndroid.version, targetBuildNumber, dryRun);
      }
    } else {
      console.log(`[AutoSync] Android policy is already up-to-date with Google Play.`);
    }
  } else {
    console.log(`[AutoSync] Google Play Store status: ${liveAndroid.status}. Skipping Android auto-sync.`);
  }

  console.log('[AutoSync] Daily scan completed.');
}

main().catch((err) => {
  console.error('[AutoSync] Fatal error:', err);
  process.exit(1);
});
