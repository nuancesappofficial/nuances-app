/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHOULD_CHECK_LIVE = process.argv.includes('--live');

const checks = [];

function readFile(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : null;
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function add(status, label, detail) {
  checks.push({ status, label, detail });
}

function hasEnvName(name) {
  const envExample = readFile('.env.example') || '';
  const envLocal = readFile('.env.local') || '';
  const env = readFile('.env') || '';
  return [envExample, envLocal, env].some((content) => new RegExp(`^${name}=`, 'm').test(content));
}

function getFirstEnvValue(name) {
  const files = ['.env.local', '.env', '.env.example'];
  for (const file of files) {
    const content = readFile(file) || '';
    const match = content.match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

const paywallFooter = readFile('src/components/UI/ProfileScreenUI/PaywallFooter.tsx') || '';
const legalLinks = readFile('src/constants/legalLinks.ts') || '';
const appJson = readFile('app.json') || '';
const todo = readFile('to-do list.md') || '';

const icon = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL',
};

function addStaticChecks() {
  add(
    hasEnvName('EXPO_PUBLIC_SUPABASE_URL') ? 'pass' : 'fail',
    'Supabase public URL env exists',
    'Required for client calls and readiness checks.'
  );
  add(
    hasEnvName('EXPO_PUBLIC_SUPABASE_ANON_KEY') ? 'pass' : 'fail',
    'Supabase anon key env exists',
    'Required for client calls and Edge Function invocation.'
  );
  add(
    hasEnvName('EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY') ? 'pass' : 'warn',
    'RevenueCat public Apple API key env exists',
    'Required before testing purchases in a native/TestFlight build.'
  );
  add(
    hasEnvName('EXPO_PUBLIC_APP_STORE_URL') && !getFirstEnvValue('EXPO_PUBLIC_APP_STORE_URL').includes('YOUR_APP_ID')
      ? 'pass'
      : 'warn',
    'App Store update URL env exists',
    'Replace the example URL once the App Store listing is available.'
  );
  add(
    hasEnvName('EXPO_PUBLIC_DELETE_ACCOUNT_FUNCTION_NAME') ? 'pass' : 'warn',
    'Delete account function name env exists',
    'Falls back to delete-account when omitted.'
  );
  add(
    /NSCameraUsageDescription/.test(appJson) &&
      /NSPhotoLibraryUsageDescription/.test(appJson) &&
      /NSMicrophoneUsageDescription/.test(appJson)
      ? 'pass'
      : 'fail',
    'iOS permission descriptions are configured',
    'Camera, Photos, and Microphone usage strings should be explicit.'
  );
  add(
    exists('supabase/functions/delete-account/index.ts') ? 'pass' : 'fail',
    'delete-account Edge Function exists',
    'Required for backend account deletion support.'
  );
  add(
    exists('supabase/migrations/20260603_add_app_version_policy.sql') ? 'pass' : 'warn',
    'App version policy migration exists',
    'Required for remote update prompts.'
  );
add(
  [paywallFooter, legalLinks].some((content) =>
    content.includes('https://example.com') || content.includes('your-domain.com')
  )
    ? 'fail'
    : 'pass',
  'Legal links are not placeholders',
  'Privacy Policy and Terms links must be real before App Review.'
);
  add(
    todo.includes('✓ Add backend account deletion support') ||
      todo.includes('[x] Add backend account deletion support')
      ? 'pass'
      : 'warn',
    'Checklist marks backend account deletion complete',
    'Keep to-do list.md synchronized with implemented backend support.'
  );
}

async function checkFunctionLive(functionName) {
  const supabaseUrl = getFirstEnvValue('EXPO_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = getFirstEnvValue('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey || supabaseUrl.includes('your_supabase_project_url')) {
    add('warn', `${functionName} live endpoint`, 'Skipped because Supabase env values are not configured locally.');
    return;
  }

  const endpoint = `${supabaseUrl}/functions/v1/${functionName}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ readinessProbe: true }),
    });
    add(
      response.status === 404 ? 'fail' : 'pass',
      `${functionName} live endpoint`,
      `HTTP ${response.status}; non-404 response means the Edge Function is deployed and reachable.`
    );
  } catch (error) {
    add(
      'fail',
      `${functionName} live endpoint`,
      error instanceof Error ? error.message : 'Network request failed.'
    );
  }
}

async function addLiveChecks() {
  if (!SHOULD_CHECK_LIVE) return;
  await Promise.all([
    checkFunctionLive('ai-proxy'),
    checkFunctionLive('tts-proxy'),
    checkFunctionLive('sync-entitlement'),
    checkFunctionLive('revenuecat-webhook'),
    checkFunctionLive('delete-account'),
  ]);
}

function printResults() {
  for (const check of checks) {
    console.log(`[${icon[check.status]}] ${check.label}`);
    console.log(`       ${check.detail}`);
  }

  const failCount = checks.filter((check) => check.status === 'fail').length;
  const warnCount = checks.filter((check) => check.status === 'warn').length;

  console.log('');
  console.log(`Summary: ${failCount} fail, ${warnCount} warn, ${checks.length - failCount - warnCount} pass`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

addStaticChecks();
addLiveChecks().then(printResults).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
