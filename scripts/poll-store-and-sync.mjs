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

async function syncPolicyToSupabase(supabaseUrl, syncToken, platform, newVersion, dryRun = false) {
  const payload = {
    platform,
    latestVersion: newVersion,
    minimumSupportedVersion: newVersion,
    latestBuildNumber: 1,
    minimumSupportedBuildNumber: 1,
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
  console.log(`[AutoSync] Successfully synced ${platform} version ${newVersion} to Supabase!`);
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

  console.log(`[AutoSync] Current Supabase Policy: iOS = ${iosPolicy?.latest_version || 'none'}, Android = ${androidPolicy?.latest_version || 'none'}`);

  // 1. Check iOS App Store
  const liveIosVersion = await getLiveAppStoreVersion();
  console.log(`[AutoSync] Live Apple App Store version: ${liveIosVersion || 'not found'}`);

  if (liveIosVersion) {
    const cmp = compareSemver(liveIosVersion, iosPolicy?.latest_version);
    if (cmp > 0) {
      console.log(`[AutoSync] >> DETECTED iOS UPGRADE: App Store (${liveIosVersion}) > Supabase (${iosPolicy?.latest_version})!`);
      if (!syncToken && !dryRun) {
        console.error('[AutoSync] ERROR: Missing APP_VERSION_POLICY_SYNC_TOKEN. Cannot trigger sync.');
      } else {
        await syncPolicyToSupabase(supabaseUrl, syncToken, 'ios', liveIosVersion, dryRun);
      }
    } else {
      console.log(`[AutoSync] iOS policy is already up-to-date with App Store (${liveIosVersion}).`);
    }
  }

  // 2. Check Android Google Play
  const liveAndroid = await getLiveGooglePlayVersion();
  if (liveAndroid.status === 'not_public') {
    console.log('[AutoSync] Google Play Store: App is in internal/closed testing (not publicly indexed yet). Skipping Android auto-sync.');
  } else if (liveAndroid.version) {
    console.log(`[AutoSync] Live Google Play version: ${liveAndroid.version}`);
    const cmp = compareSemver(liveAndroid.version, androidPolicy?.latest_version);
    if (cmp > 0) {
      console.log(`[AutoSync] >> DETECTED Android UPGRADE: Google Play (${liveAndroid.version}) > Supabase (${androidPolicy?.latest_version})!`);
      if (!syncToken && !dryRun) {
        console.error('[AutoSync] ERROR: Missing APP_VERSION_POLICY_SYNC_TOKEN. Cannot trigger sync.');
      } else {
        await syncPolicyToSupabase(supabaseUrl, syncToken, 'android', liveAndroid.version, dryRun);
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
