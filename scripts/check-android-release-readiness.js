#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function add(status, name, detail) {
  results.push({ status, name, detail });
}

function check(condition, name, passDetail, failDetail) {
  add(condition ? 'PASS' : 'FAIL', name, condition ? passDetail : failDetail);
}

const app = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));
const production = eas.build?.production || {};
const androidProduction = production.android || {};
const envExample = read('.env.example');
const revenueCat = read('src/services/subscription/revenueCat.ts');
const authClient = read('src/services/supabase/client.ts');
const appSource = read('App.tsx');
const tourMode = read('src/features/tour/tourMode.ts');
const sharePlugin = read('plugins/withAndroidShareIntent.js');
const visionGradle = read('modules/vision-ocr/android/build.gradle');

check(app.android?.package === 'com.jeffenglishlearning.nuances', 'Android package name', `使用 ${app.android?.package}`, 'package name 不符合預期。');
check(
  app.plugins?.includes('./plugins/withAndroidShareIntent.js') && sharePlugin.includes('android.intent.action.SEND_MULTIPLE'),
  'Sharesheet 持久化',
  'Expo config plugin 會重建 SEND/SEND_MULTIPLE intent filters。',
  'Sharesheet intent filters 未完整持久化。'
);
check(
  visionGradle.includes("com.google.mlkit:text-recognition:16.0.1") && app.plugins?.includes('./plugins/withAndroidShareIntent.js'),
  'ML Kit OCR local module',
  'Bundled ML Kit dependency 位於 local Expo module。',
  'ML Kit OCR dependency 未在 local module 中找到。'
);
check(eas.cli?.appVersionSource === 'remote', 'Remote app version source', 'EAS 使用 remote version source。', 'eas.json 未使用 remote app version source。');
check(androidProduction.buildType === 'app-bundle', 'Production AAB', 'Android production buildType 為 app-bundle。', 'Android production 並非 AAB。');
check(androidProduction.credentialsSource === 'remote', 'EAS-managed upload key', 'production 明確使用 remote credentials。', 'production 未明確使用 EAS remote credentials。');
check(androidProduction.autoIncrement === true, 'versionCode 策略', 'production build 會自動遞增 remote versionCode。', 'production 未設定 autoIncrement。');
check(
  production.env?.EXPO_PUBLIC_SUBSCRIPTION_DEV_BYPASS === 'false' && production.env?.EXPO_PUBLIC_INTERNAL_TESTER_TOOLS === 'false',
  'Production feature gates',
  'subscription bypass 與 internal tester tools 均關閉。',
  'production feature gate 未安全關閉。'
);
check(tourMode.includes('__DEV__ && explicitInternalTesterToolsFlag'), 'Tester tools hard gate', 'Tester tools 另受 __DEV__ 硬性限制。', 'Tester tools 缺少 __DEV__ 硬性限制。');
check(
  revenueCat.includes('EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY') &&
    revenueCat.includes('EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY') &&
    revenueCat.includes("Platform.OS === 'android'") &&
    revenueCat.includes("'premium'") &&
    revenueCat.includes('if (!getRevenueCatApiKey()) return false'),
  'RevenueCat 平台分流與 fail closed',
  'iOS/Android 使用各自 public key；缺 key 不授予 Premium。',
  'RevenueCat 平台 key 或 fail-closed 邏輯不完整。'
);
check(
  envExample.includes('EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=goog_') && envExample.includes('EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=premium'),
  'RevenueCat environment template',
  '.env.example 包含 Android public SDK key placeholder 與 premium entitlement。',
  '.env.example 缺少 Android RevenueCat 設定。'
);
check(
  authClient.includes('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID') && appSource.includes("Platform.OS === 'ios' ? ("),
  'Android Google / iOS Apple UI',
  'Android OAuth client ID 由環境提供；Apple button 僅在 iOS render。',
  'Google Android OAuth 或 Apple UI 平台限制不完整。'
);
const blocked = new Set(app.android?.blockedPermissions || []);
check(
  blocked.has('android.permission.READ_EXTERNAL_STORAGE') && blocked.has('android.permission.WRITE_EXTERNAL_STORAGE'),
  'Legacy storage permissions',
  'READ/WRITE_EXTERNAL_STORAGE 已由 Expo config 阻擋。',
  '不必要的 legacy storage permissions 未阻擋。'
);
check(
  blocked.has('android.permission.SYSTEM_ALERT_WINDOW'),
  'Overlay permission',
  'SYSTEM_ALERT_WINDOW 已由 Expo config 阻擋，不會進入 production manifest。',
  'production 仍可能包含不必要的 SYSTEM_ALERT_WINDOW。'
);

let trackedSensitive = '';
try {
  trackedSensitive = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((file) => /(?:\.jks|\.keystore|google-services\.json|service.?account.*\.json)$/i.test(file))
    .join(', ');
} catch (error) {
  add('WARN', 'Sensitive-file git audit', `無法執行 git ls-files：${error.message}`);
}
check(!trackedSensitive, 'No tracked signing/service credentials', '未追蹤 keystore 或 service-account JSON。', `發現敏感檔案：${trackedSensitive}`);

const localAab = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');
if (fs.existsSync(localAab)) {
  add('WARN', 'Local release AAB', '本機 Gradle AAB 存在；Expo generated release 預設可能為 debug signing，禁止上傳，必須另驗證憑證。');
} else {
  add('PASS', 'Local release AAB', '目前沒有可能被誤傳的本機 release AAB。');
}

for (const [name, variable] of [
  ['Google Android OAuth client ID', 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'],
  ['RevenueCat Android public SDK key', 'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY'],
]) {
  if (!String(process.env[variable] || '').trim()) add('MANUAL', name, `尚未在目前環境提供 ${variable}。`);
}
add('MANUAL', 'Google signing fingerprints', '在 EAS 建立 upload key／Play App Signing 後，將正確 SHA-1 與 SHA-256 加入 Google OAuth 設定；不得使用假值。');
add('MANUAL', 'Google Play setup', '仍需 Play Console app/account、product IDs、RevenueCat Play app 連線與 Google Play service credentials。');

for (const item of results) console.log(`${item.status.padEnd(6)} ${item.name}: ${item.detail}`);
const counts = Object.fromEntries(['PASS', 'WARN', 'FAIL', 'MANUAL'].map((status) => [status, results.filter((item) => item.status === status).length]));
console.log(`\nSummary: ${counts.PASS} PASS, ${counts.WARN} WARN, ${counts.FAIL} FAIL, ${counts.MANUAL} MANUAL`);
process.exitCode = counts.FAIL > 0 ? 1 : 0;
