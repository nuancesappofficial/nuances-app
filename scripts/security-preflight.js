/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOULD_CHECK_LIVE_UNAUTH = process.argv.includes('--live-unauth');
const SHOULD_RUN_NPM_AUDIT = process.argv.includes('--npm-audit');

const checks = [];

function readFile(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function add(status, label, detail) {
  checks.push({ status, label, detail });
}

function gitLsFiles() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getFirstEnvValue(name) {
  for (const file of ['.env.local', '.env', '.env.example']) {
    const content = readFile(file);
    const match = content.match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function summarizeFiles(files, limit = 5) {
  if (files.length <= limit) return files.join(', ');
  return `${files.slice(0, limit).join(', ')} (+${files.length - limit} more)`;
}

function isTextFile(file) {
  return /\.(ts|tsx|js|mjs|json|md|sql|toml|yml|yaml|txt|env|example|config|plist|pbxproj|sh|ps1|rb|py)$/i.test(file) ||
    /^(\.env|\.gitignore|\.npmrc|package-lock\.json|package\.json)$/.test(file);
}

function checkSecrets() {
  const tracked = gitLsFiles();
  const trackedEnvFiles = tracked.filter((file) => /^\.env($|\.)/.test(file) && file !== '.env.example');
  const trackedSecretKeyFiles = tracked.filter((file) => /\.(p8|p12|mobileprovision|pem|jks|key)$/i.test(file));
  const secretPatterns = [
    { label: 'Supabase service-role assignment', regex: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?(?!your_|<|$)[A-Za-z0-9._-]{20,}/ },
    { label: 'RevenueCat secret/webhook token assignment', regex: /REVENUECAT_(SECRET_KEY|WEBHOOK_AUTH_TOKEN)\s*=\s*['"]?(?!your_|<|$)[A-Za-z0-9._-]{20,}/ },
    { label: 'OpenAI secret key', regex: /sk-[A-Za-z0-9_-]{20,}/ },
    { label: 'Google/Gemini API key', regex: /AIza[A-Za-z0-9_-]{20,}/ },
    { label: 'Private key material', regex: /-----BEGIN (RSA |EC |OPENSSH |PRIVATE )?PRIVATE KEY-----/ },
  ];
  const hits = [];

  for (const file of tracked) {
    if (file === 'package-lock.json') continue;
    if (!isTextFile(file)) continue;
    const content = readFile(file);
    for (const pattern of secretPatterns) {
      if (pattern.regex.test(content)) {
        hits.push(`${file} (${pattern.label})`);
      }
    }
  }

  add(
    trackedEnvFiles.length === 0 && trackedSecretKeyFiles.length === 0 && hits.length === 0 ? 'pass' : 'fail',
    'Secrets scan',
    trackedEnvFiles.length > 0
      ? `Tracked env files found: ${trackedEnvFiles.join(', ')}`
      : trackedSecretKeyFiles.length > 0
        ? `Tracked secret/key files found: ${trackedSecretKeyFiles.join(', ')}`
      : hits.length > 0
        ? `Potential committed secret patterns: ${summarizeFiles(hits)}`
        : 'No tracked .env files or high-confidence secret patterns found.'
  );
}

function checkExpoPublicUsage() {
  const tracked = gitLsFiles();
  const sourceFiles = tracked.filter((file) => /\.(ts|tsx|js|mjs|json)$/.test(file));
  const publicEnvNames = new Set();
  for (const file of sourceFiles) {
    const content = readFile(file);
    for (const match of content.matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) {
      publicEnvNames.add(match[0]);
    }
  }

  const forbidden = [...publicEnvNames].filter((name) =>
    /(SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|WEBHOOK_AUTH|OPENAI|GEMINI|AZURE|APPLE_SHARED_SECRET)/.test(name)
  );
  const envExample = readFile('.env.example');
  const defaultPlanEnabled = /^EXPO_PUBLIC_SUBSCRIPTION_DEV_DEFAULT_PLAN\s*=/m.test(envExample);

  add(
    forbidden.length === 0 && !defaultPlanEnabled ? 'pass' : 'fail',
    'EXPO_PUBLIC client-safe usage',
    forbidden.length > 0
      ? `Forbidden public env names: ${forbidden.join(', ')}`
      : defaultPlanEnabled
        ? 'EXPO_PUBLIC_SUBSCRIPTION_DEV_DEFAULT_PLAN is defined in .env.example.'
        : `Public env usage looks client-safe (${publicEnvNames.size} names scanned).`
  );
}

function checkRlsPolicies() {
  const migrations = gitLsFiles()
    .filter((file) => file.startsWith('supabase/migrations/') && file.endsWith('.sql'))
    .map(readFile)
    .join('\n');
  const tables = ['profiles', 'cached_items', 'cards', 'review_history', 'sync_metadata', 'subscriptions', 'app_version_policy'];
  const missing = tables.filter((table) => {
    const rls = new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(migrations);
    const policy = new RegExp(`policy [\\s\\S]{0,160}public\\.${table}`, 'i').test(migrations) ||
      new RegExp(`on public\\.${table}`, 'i').test(migrations);
    return !(rls && policy);
  });
  add(
    missing.length === 0 ? 'pass' : 'fail',
    'Supabase RLS policy coverage',
    missing.length === 0 ? 'Required tables have RLS and policies in migrations.' : `Missing RLS/policies: ${missing.join(', ')}`
  );
}

function checkStoragePolicies() {
  const migrations = gitLsFiles()
    .filter((file) => file.startsWith('supabase/migrations/') && file.endsWith('.sql'))
    .map(readFile)
    .join('\n');
  const hasCachedImagesOwnerPolicies =
    /bucket_id = 'cached-images'/.test(migrations) &&
    /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/.test(migrations) &&
    /for insert/.test(migrations) &&
    /for update/.test(migrations) &&
    /for delete/.test(migrations);
  const hasAudioPublicPolicy = /bucket_id = 'audio_cache'/.test(migrations) && /for select/.test(migrations);
  add(
    hasCachedImagesOwnerPolicies && hasAudioPublicPolicy ? 'pass' : 'fail',
    'Supabase Storage policy coverage',
    hasCachedImagesOwnerPolicies && hasAudioPublicPolicy
      ? 'cached-images is user-owned; audio_cache public-read assumption is explicit.'
      : 'Storage policies are missing expected cached-images/audio_cache protections.'
  );
}

function checkEdgeAuthBoundaries() {
  const aiProxy = readFile('supabase/functions/ai-proxy/index.ts');
  const ttsProxy = readFile('supabase/functions/tts-proxy/index.ts');
  const syncEntitlement = readFile('supabase/functions/sync-entitlement/index.ts');
  const deleteAccount = readFile('supabase/functions/delete-account/index.ts');
  const revenueCatWebhook = readFile('supabase/functions/revenuecat-webhook/index.ts');

  const required = [
    ['ai-proxy JWT', aiProxy.includes('getAuthenticatedUserFromAuthorization') && aiProxy.includes('missing valid JWT')],
    ['tts-proxy JWT', ttsProxy.includes('getAuthenticatedUserFromAuthorization') && ttsProxy.includes('missing valid JWT')],
    ['sync-entitlement JWT', syncEntitlement.includes('getAuthenticatedUserFromAuthorization') && syncEntitlement.includes('missing valid JWT')],
    ['delete-account JWT', deleteAccount.includes('getAuthenticatedUserFromAuthorization') && deleteAccount.includes('missing valid JWT')],
    ['revenuecat-webhook token', revenueCatWebhook.includes('REVENUECAT_WEBHOOK_AUTH_TOKEN') && revenueCatWebhook.includes('timingSafeEqual')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([label]) => label);
  add(
    missing.length === 0 ? 'pass' : 'fail',
    'Edge Function auth boundaries',
    missing.length === 0 ? 'JWT/token checks found for protected Edge Functions.' : `Missing auth checks: ${missing.join(', ')}`
  );
}

function checkDeleteAccountBoundary() {
  const source = readFile('supabase/functions/delete-account/index.ts');
  const usesAuthenticatedUser = /const userId = user\?\.id/.test(source);
  const doesNotReadRequestBody = !/req\.json\(\)/.test(source);
  const filtersByUser = ['review_history', 'sync_metadata', 'subscriptions', 'cards', 'cached_items']
    .every((table) => source.includes(`'${table}'`) && source.includes(".eq('user_id', userId)"));
  const deletesOwnProfile = source.includes(".from('profiles')") && source.includes(".eq('id', userId)");
  add(
    usesAuthenticatedUser && doesNotReadRequestBody && filtersByUser && deletesOwnProfile ? 'pass' : 'fail',
    'delete-account ownership boundary',
    usesAuthenticatedUser && doesNotReadRequestBody && filtersByUser && deletesOwnProfile
      ? 'delete-account derives userId from JWT and filters deletes to that user.'
      : 'delete-account ownership boundary needs review.'
  );
}

function checkEntitlementSpoofingBoundary() {
  const sync = readFile('supabase/functions/sync-entitlement/index.ts');
  const webhook = readFile('supabase/functions/revenuecat-webhook/index.ts');
  const shared = readFile('supabase/functions/_shared/entitlement.ts');
  const ok =
    sync.includes('syncRevenueCatSubscriptionToSupabase') &&
    shared.includes('fetchRevenueCatSubscriber') &&
    shared.includes('REVENUECAT_SECRET_KEY') &&
    webhook.includes('REVENUECAT_WEBHOOK_AUTH_TOKEN') &&
    webhook.includes('timingSafeEqual');
  add(
    ok ? 'pass' : 'fail',
    'RevenueCat entitlement spoofing boundary',
    ok ? 'Premium state is synced server-side from RevenueCat API/webhook token, not client-provided entitlement data.' : 'Entitlement spoofing boundary needs review.'
  );
}

function checkInputAndOutputHandling() {
  const aiProxy = readFile('supabase/functions/ai-proxy/index.ts');
  const requestSanitizers = readFile('supabase/functions/ai-proxy/_shared/requestSanitizers.ts');
  const shareExtension = readFile('src/services/shareExtension/shareExtensionService.ts');
  const edgeClient = readFile('src/services/ai/edgeAiClient.ts');
  const inputOk =
    requestSanitizers.includes('sanitizeText') &&
    aiProxy.includes('MAX_SENTENCE_CHARS') &&
    aiProxy.includes('MAX_AUDIO_BASE64_CHARS') &&
    shareExtension.includes('MAX_TEXT_LENGTH') &&
    edgeClient.includes('normalizePayload');
  const outputOk =
    aiProxy.includes('extractFirstJsonObject') &&
    aiProxy.includes('sanitizeText(parsed') &&
    !aiProxy.includes('rawContentPreview');

  add(
    inputOk ? 'pass' : 'fail',
    'AI/OCR/share-extension input validation',
    inputOk ? 'Length caps and sanitizers found across AI proxy, client payloads, and share extension.' : 'Missing expected input validation caps/sanitizers.'
  );
  add(
    outputOk ? 'pass' : 'fail',
    'AI output handling',
    outputOk ? 'AI output is parsed/sanitized and raw content previews are not logged.' : 'AI output handling or raw logging needs review.'
  );
}

function checkLocalStorageAndLogging() {
  const tracked = gitLsFiles();
  const tsFiles = tracked.filter((file) => /\.(ts|tsx)$/.test(file));
  const suspiciousStorage = [];
  const sensitiveLogs = [];
  for (const file of tsFiles) {
    const content = readFile(file);
    if (/AsyncStorage\.setItem\([^)]*(token|secret|password|service|api[_-]?key)/i.test(content)) {
      suspiciousStorage.push(file);
    }
    if (/console\.(log|warn|error|info)\([^)]*(accessToken|refreshToken|Authorization|Bearer|rawContentPreview)/.test(content)) {
      sensitiveLogs.push(file);
    }
  }
  add(
    suspiciousStorage.length === 0 ? 'pass' : 'fail',
    'Local storage secret review',
    suspiciousStorage.length === 0 ? 'No obvious AsyncStorage writes of secrets/tokens found.' : `Suspicious storage writes: ${summarizeFiles(suspiciousStorage)}`
  );
  add(
    sensitiveLogs.length === 0 ? 'pass' : 'fail',
    'Sensitive logging review',
    sensitiveLogs.length === 0 ? 'No obvious logs of tokens/Authorization/raw AI output previews found.' : `Potential sensitive logs: ${summarizeFiles(sensitiveLogs)}`
  );
}

function checkDevBypass() {
  const envExample = readFile('.env.example');
  const aiProxy = readFile('supabase/functions/ai-proxy/index.ts');
  const ttsProxy = readFile('supabase/functions/tts-proxy/index.ts');
  const sourceOk =
    aiProxy.includes('isProductionRuntime') &&
    aiProxy.includes('ignoring bypass header') &&
    ttsProxy.includes('isProductionRuntime') &&
    ttsProxy.includes('ignoring bypass header');
  const envOk =
    /^EXPO_PUBLIC_SUBSCRIPTION_DEV_BYPASS=false$/m.test(envExample) &&
    !/^EXPO_PUBLIC_SUBSCRIPTION_DEV_DEFAULT_PLAN=/m.test(envExample);
  add(
    sourceOk && envOk ? 'pass' : 'fail',
    'Production subscription dev bypass disabled',
    sourceOk && envOk ? 'Production bypass is blocked server-side and .env.example defaults to false/no default premium plan.' : 'Dev bypass controls need review.'
  );
}

async function checkLiveUnauth(functionName, expectedStatuses) {
  const supabaseUrl = getFirstEnvValue('EXPO_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = getFirstEnvValue('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey || supabaseUrl.includes('your_supabase_project_url')) {
    add('warn', `${functionName} unauth smoke`, 'Skipped because Supabase env values are not configured locally.');
    return;
  }
  const endpoint = `${supabaseUrl}/functions/v1/${functionName}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({ securitySmokeProbe: true }),
    });
    add(
      expectedStatuses.includes(response.status) ? 'pass' : 'fail',
      `${functionName} unauth smoke`,
      `HTTP ${response.status}; expected one of ${expectedStatuses.join(', ')}.`
    );
  } catch (error) {
    add('fail', `${functionName} unauth smoke`, error instanceof Error ? error.message : 'Network request failed.');
  }
}

async function runLiveUnauthChecks() {
  if (!SHOULD_CHECK_LIVE_UNAUTH) return;
  await Promise.all([
    checkLiveUnauth('ai-proxy', [401]),
    checkLiveUnauth('tts-proxy', [401]),
    checkLiveUnauth('sync-entitlement', [401]),
    checkLiveUnauth('delete-account', [401]),
    checkLiveUnauth('revenuecat-webhook', [401, 500]),
  ]);
}

function runNpmAudit() {
  if (!SHOULD_RUN_NPM_AUDIT) return;
  const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const raw = result.stdout || result.stderr || '';
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const metadata = parsed?.metadata?.vulnerabilities || {};
  const high = Number(metadata.high || 0);
  const critical = Number(metadata.critical || 0);
  const moderate = Number(metadata.moderate || 0);
  const low = Number(metadata.low || 0);
  const total = Number(metadata.total || 0);

  add(
    high > 0 || critical > 0 ? 'fail' : total > 0 ? 'warn' : 'pass',
    'npm audit production dependencies',
    high > 0 || critical > 0
      ? `High/critical production advisories remain: critical=${critical}, high=${high}, moderate=${moderate}, low=${low}.`
      : total > 0
        ? `No high/critical advisories. Remaining production advisories: moderate=${moderate}, low=${low}.`
        : 'No production dependency advisories reported.'
  );
}

function printResults() {
  const icon = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
  for (const check of checks) {
    console.log(`[${icon[check.status]}] ${check.label}`);
    console.log(`       ${check.detail}`);
  }
  const failCount = checks.filter((check) => check.status === 'fail').length;
  const warnCount = checks.filter((check) => check.status === 'warn').length;
  console.log('');
  console.log(`Summary: ${failCount} fail, ${warnCount} warn, ${checks.length - failCount - warnCount} pass`);
  if (failCount > 0) process.exitCode = 1;
}

checkSecrets();
checkExpoPublicUsage();
checkRlsPolicies();
checkStoragePolicies();
checkEdgeAuthBoundaries();
checkDeleteAccountBoundary();
checkEntitlementSpoofingBoundary();
checkInputAndOutputHandling();
checkLocalStorageAndLogging();
checkDevBypass();
runNpmAudit();
runLiveUnauthChecks().then(printResults).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
