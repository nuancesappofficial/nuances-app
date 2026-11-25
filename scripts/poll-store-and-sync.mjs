#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
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

// 公開商店頁查不到 build 號，repo 裡的 build 號也不是真的（EAS appVersionSource = remote）。
// 所以公開版只比版號；寫入 1（伺服器不收空值），任何真實 build 都 >= 1，等於不做 build 比對。
const NO_BUILD_GATE = 1;

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

// ---- Google Play Developer API：讀封閉測試（alpha）軌道目前發布的版本 ----
const PLAY_PACKAGE = BUNDLE_ID;
const PLAY_CLOSED_TRACK = 'alpha';

function loadPlayServiceAccount(env) {
  const raw = (env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  if (raw) return JSON.parse(raw);
  const keyPath = env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH || path.join(os.homedir(), '.eas-keys', 'google-service-account.json');
  if (fs.existsSync(keyPath)) return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return null;
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getPlayAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(account.private_key);
  const assertion = `${header}.${claim}.${base64url(signature)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google token request failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

// 回傳封閉測試軌道上「已發布給測試員」的最新版本；沒有就回 null。
// 只認 status = completed 的 release，審核中或草稿都不算。
async function getClosedTestingRelease(env) {
  const account = loadPlayServiceAccount(env);
  if (!account) {
    console.warn('[AutoSync] No Google Play service account (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON); cannot read closed testing track.');
    return { status: 'no_credentials' };
  }
  const token = await getPlayAccessToken(account);
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/edits`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const editRes = await fetch(base, { method: 'POST', headers, body: '{}' });
  if (!editRes.ok) throw new Error(`Play edits.insert failed (${editRes.status}): ${await editRes.text()}`);
  const editId = (await editRes.json()).id;

  try {
    const trackRes = await fetch(`${base}/${editId}/tracks/${PLAY_CLOSED_TRACK}`, { headers });
    if (!trackRes.ok) throw new Error(`Play tracks.get failed (${trackRes.status}): ${await trackRes.text()}`);
    const track = await trackRes.json();
    const live = (track.releases || [])
      .filter((r) => r.status === 'completed' && (r.versionCodes || []).length > 0)
      .map((r) => ({
        versionCode: Math.max(...r.versionCodes.map((c) => Number.parseInt(c, 10))),
        // EAS 的 release 名稱格式：「43 (1.3.9)」
        version: r.name?.match(/\((\d+\.\d+\.\d+)\)/)?.[1] ?? r.name?.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null,
        name: r.name,
      }))
      .sort((a, b) => b.versionCode - a.versionCode)[0];
    if (!live) return { status: 'none' };
    if (!live.version) return { status: 'no_version_name', versionCode: live.versionCode, name: live.name };
    return { status: 'live', version: live.version, versionCode: live.versionCode };
  } finally {
    await fetch(`${base}/${editId}`, { method: 'DELETE', headers }).catch(() => {});
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

async function sendNtfy(env, { title, message, tags = [], click }) {
  const topic = (env.NTFY_TOPIC || '').trim();
  if (!topic) {
    console.warn('[AutoSync] NTFY_TOPIC is not set; skipping phone notification.');
    return;
  }
  const runUrl = env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : undefined;
  try {
    const res = await fetch('https://ntfy.sh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, message, tags, click: click || runUrl }),
    });
    if (!res.ok) console.warn(`[AutoSync] ntfy returned status ${res.status}`);
  } catch (err) {
    // 通知失敗不能讓版本同步跟著失敗
    console.warn('[AutoSync] ntfy send failed:', err.message);
  }
}

// 同步後再讀一次 Supabase，通知內容是資料庫的實際狀態，不是「應該成功了」
async function notifyPolicySynced(env, supabaseUrl, anonKey, platform, version, dryRun) {
  if (dryRun) {
    console.log(`[AutoSync][DRY-RUN] Would send phone notification for ${platform} ${version}`);
    return;
  }
  const policies = await getSupabaseCurrentPolicies(supabaseUrl, anonKey);
  const policy = policies.find((p) => p.platform === platform);
  const verified = policy?.minimum_supported_version === version;
  const name = platform === 'ios' ? 'iOS' : 'Android';
  await sendNtfy(env, {
    title: verified ? `✅ ${name} ${version} 更新通知已上線` : `❌ ${name} ${version} 更新通知沒有上線`,
    message: verified
      ? `從現在起，舊版使用者打開 App 就會看到更新通知。`
      : `舊版使用者目前看不到 ${version} 的更新通知，點這則看原因。`,
    tags: [verified ? 'white_check_mark' : 'warning'],
  });
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

  // 不寫入資料庫，只送一則測試通知，確認手機收得到
  if (args.includes('--test-notify')) {
    const policies = await getSupabaseCurrentPolicies(supabaseUrl, anonKey);
    const lines = policies.map((p) => `${p.platform}：最低版本 ${p.minimum_supported_version}`).join('\n');
    await sendNtfy(env, { title: '🧪 測試：版本同步通知', message: `目前資料庫的版本政策：\n${lines}`, tags: ['test_tube'] });
    return;
  }

  const policies = await getSupabaseCurrentPolicies(supabaseUrl, anonKey);
  const iosPolicy = policies.find((p) => p.platform === 'ios');
  const androidPolicy = policies.find((p) => p.platform === 'android');

  console.log(`[AutoSync] Current Supabase Policy: iOS = ${iosPolicy?.latest_version || 'none'} (build ${iosPolicy?.latest_build_number || 'none'}), Android = ${androidPolicy?.latest_version || 'none'} (build ${androidPolicy?.latest_build_number || 'none'})`);

  // 1. Check iOS App Store
  const liveIosVersion = await getLiveAppStoreVersion();
  console.log(`[AutoSync] Live Apple App Store version: ${liveIosVersion || 'not found'}`);

  if (liveIosVersion) {
    const cmp = compareSemver(liveIosVersion, iosPolicy?.latest_version);

    if (cmp > 0) {
      console.log(`[AutoSync] >> DETECTED iOS UPGRADE: App Store (${liveIosVersion}) > Supabase (${iosPolicy?.latest_version || 'none'})!`);
      if (!syncToken && !dryRun) {
        console.error('[AutoSync] ERROR: Missing APP_VERSION_POLICY_SYNC_TOKEN. Cannot trigger sync.');
        await sendNtfy(env, { title: '❌ 版本同步失敗', message: '缺少 APP_VERSION_POLICY_SYNC_TOKEN，更新提示沒有啟動。', tags: ['warning'] });
      } else {
        await syncPolicyToSupabase(supabaseUrl, syncToken, 'ios', liveIosVersion, NO_BUILD_GATE, dryRun);
        await notifyPolicySynced(env, supabaseUrl, anonKey, 'ios', liveIosVersion, dryRun);
      }
    } else {
      console.log(`[AutoSync] iOS policy is already up-to-date with App Store (${liveIosVersion}).`);
    }
  }

  // 2. Check Android Google Play
  const liveAndroid = await getLiveGooglePlayVersion();

  if (liveAndroid.status === 'not_public') {
    // 正式版還沒公開：Android 更新通知只看「封閉測試（alpha）」軌道，不看 iOS，也不看內部測試。
    // 不可用本機 build.gradle 的版號代替，那是「剛打包」不是「測試員已能下載」。
    let closed;
    try {
      closed = await getClosedTestingRelease(env);
    } catch (err) {
      console.warn('[AutoSync] Could not read closed testing track:', err.message);
      await sendNtfy(env, { title: '⚠️ 讀不到 Android 封閉測試版本', message: `Android 更新通知這輪沒有動作：${err.message}`, tags: ['warning'] });
      closed = { status: 'error' };
    }

    if (closed.status !== 'live') {
      console.log(`[AutoSync] Closed testing (${PLAY_CLOSED_TRACK}) has no published release (${closed.status}). Skipping Android auto-sync; policy stays as is.`);
    } else {
      const cmp = compareSemver(closed.version, androidPolicy?.latest_version);
      const isNewerBuild =
        cmp === 0 &&
        (typeof androidPolicy?.latest_build_number !== 'number' || closed.versionCode > androidPolicy.latest_build_number);
      if (cmp > 0 || isNewerBuild) {
        console.log(`[AutoSync] >> DETECTED Android closed testing release: ${closed.version} (versionCode ${closed.versionCode}) > Supabase (${androidPolicy?.latest_version || 'none'}, build ${androidPolicy?.latest_build_number ?? 'none'})!`);
        if (!syncToken && !dryRun) {
          console.error('[AutoSync] ERROR: Missing APP_VERSION_POLICY_SYNC_TOKEN. Cannot trigger sync.');
          await sendNtfy(env, { title: '❌ 版本同步失敗', message: '缺少 APP_VERSION_POLICY_SYNC_TOKEN，更新提示沒有啟動。', tags: ['warning'] });
        } else {
          await syncPolicyToSupabase(supabaseUrl, syncToken, 'android', closed.version, closed.versionCode, dryRun);
          await notifyPolicySynced(env, supabaseUrl, anonKey, 'android', closed.version, dryRun);
        }
      } else {
        console.log(`[AutoSync] Android policy is already up-to-date with closed testing (${closed.version}, versionCode ${closed.versionCode}).`);
      }
    }
  } else if (liveAndroid.version) {
    console.log(`[AutoSync] Live Google Play version: ${liveAndroid.version}`);
    const cmp = compareSemver(liveAndroid.version, androidPolicy?.latest_version);

    if (cmp > 0) {
      console.log(`[AutoSync] >> DETECTED Android UPGRADE: Google Play (${liveAndroid.version}) > Supabase (${androidPolicy?.latest_version || 'none'})!`);
      if (!syncToken && !dryRun) {
        console.error('[AutoSync] ERROR: Missing APP_VERSION_POLICY_SYNC_TOKEN. Cannot trigger sync.');
        await sendNtfy(env, { title: '❌ 版本同步失敗', message: '缺少 APP_VERSION_POLICY_SYNC_TOKEN，更新提示沒有啟動。', tags: ['warning'] });
      } else {
        await syncPolicyToSupabase(supabaseUrl, syncToken, 'android', liveAndroid.version, NO_BUILD_GATE, dryRun);
        await notifyPolicySynced(env, supabaseUrl, anonKey, 'android', liveAndroid.version, dryRun);
      }
    } else {
      console.log(`[AutoSync] Android policy is already up-to-date with Google Play.`);
    }
  } else {
    console.log(`[AutoSync] Google Play Store status: ${liveAndroid.status}. Skipping Android auto-sync.`);
  }

  console.log('[AutoSync] Daily scan completed.');
}

main().catch(async (err) => {
  console.error('[AutoSync] Fatal error:', err);
  await sendNtfy(loadEnv(), { title: '❌ 版本同步失敗', message: `更新提示可能沒有啟動：${err.message}`, tags: ['warning'] });
  process.exit(1);
});
