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

function readSupabaseMigrations() {
  const migrationsDir = path.join(ROOT, 'supabase/migrations');
  if (!fs.existsSync(migrationsDir)) return '';
  return fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFile(`supabase/migrations/${file}`))
    .join('\n');
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
  const migrations = readSupabaseMigrations();
  const tables = ['profiles', 'cached_items', 'cards', 'review_history', 'sync_metadata', 'subscriptions', 'app_version_policy'];
  const missing = tables.filter((table) => {
    const rls = new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(migrations);
    if (table === 'cached_items') {
      const revoked =
        /revoke all privileges on table public\.cached_items from anon/i.test(migrations) &&
        /revoke all privileges on table public\.cached_items from authenticated/i.test(migrations);
      return !(rls && revoked);
    }
    const policy = new RegExp(`policy [\\s\\S]{0,160}public\\.${table}`, 'i').test(migrations) ||
      new RegExp(`on public\\.${table}`, 'i').test(migrations);
    return !(rls && policy);
  });
  add(
    missing.length === 0 ? 'pass' : 'fail',
    'Supabase RLS policy coverage',
    missing.length === 0
      ? 'Required remote tables have RLS policies; local-only cached_items is revoked from client roles.'
      : `Missing RLS/policies or local-only revocation: ${missing.join(', ')}`
  );
}

function checkStoragePolicies() {
  const migrations = readSupabaseMigrations();
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

function checkCrossUserAccessPolicies() {
  const migrations = readSupabaseMigrations();

  const tableRequirements = [
    ['profiles own profile', /on public\.profiles for select using \(auth\.uid\(\) = id\)/i],
    ['profiles own insert', /on public\.profiles for insert with check \(auth\.uid\(\) = id\)/i],
    ['profiles own update', /on public\.profiles for update using \(auth\.uid\(\) = id\)/i],
    ['cached_items client read/write revoked', /revoke all privileges on table public\.cached_items from anon[\s\S]*revoke all privileges on table public\.cached_items from authenticated/i],
    ['cards own rows', /on public\.cards for select using \(auth\.uid\(\) = user_id\)/i],
    ['cards own insert', /on public\.cards for insert with check \(auth\.uid\(\) = user_id\)/i],
    ['cards own update', /on public\.cards for update using \(auth\.uid\(\) = user_id\)/i],
    ['cards own delete', /on public\.cards for delete using \(auth\.uid\(\) = user_id\)/i],
    ['review_history own rows', /on public\.review_history for select using \(auth\.uid\(\) = user_id\)/i],
    ['review_history own insert', /on public\.review_history for insert with check \(auth\.uid\(\) = user_id\)/i],
    ['sync_metadata own rows', /on public\.sync_metadata for all using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/i],
    ['subscriptions own read', /on public\.subscriptions\s+for select[\s\S]{0,120}using \(auth\.uid\(\) = user_id\)/i],
  ];
  const storageRequirements = [
    ['cached-images own read', /on storage\.objects for select[\s\S]{0,220}bucket_id = 'cached-images'[\s\S]{0,220}\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i],
    ['cached-images own upload', /on storage\.objects for insert[\s\S]{0,220}bucket_id = 'cached-images'[\s\S]{0,220}\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i],
    ['cached-images own update', /on storage\.objects for update[\s\S]{0,260}bucket_id = 'cached-images'[\s\S]{0,260}\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i],
    ['cached-images own delete', /on storage\.objects for delete[\s\S]{0,220}bucket_id = 'cached-images'[\s\S]{0,220}\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i],
  ];

  const missing = [...tableRequirements, ...storageRequirements]
    .filter(([, regex]) => !regex.test(migrations))
    .map(([label]) => label);

  add(
    missing.length === 0 ? 'pass' : 'fail',
    'Cross-user access-control policy coverage',
    missing.length === 0
      ? 'RLS/storage policies restrict user-owned rows and cached image paths to auth.uid().'
      : `Missing expected ownership checks: ${summarizeFiles(missing, 8)}`
  );
}

function checkLocalOnlyCacheBoundary() {
  const syncSource = readFile('src/services/sync/index.ts');
  const shareExtensionHook = readFile('src/hooks/useShareExtension.ts');
  const migrations = readSupabaseMigrations();
  const requirements = [
    [
      'sync does not query cached_items',
      !/\.from\(['"]cached_items['"]\)/.test(syncSource),
    ],
    [
      'sync does not push cached_items',
      !/pushTableChanges\(['"]cached_items['"]/.test(syncSource),
    ],
    [
      'pulled cards discard cached_item_id',
      /function transformCards[\s\S]*cached_item_id:\s*null/.test(syncSource),
    ],
    [
      'pushed cards discard cached_item_id',
      /case ['"]cards['"]:[\s\S]*cached_item_id:\s*null/.test(syncSource),
    ],
    [
      'client roles are revoked from cached_items',
      /revoke all privileges on table public\.cached_items from anon/i.test(migrations) &&
        /revoke all privileges on table public\.cached_items from authenticated/i.test(migrations),
    ],
    [
      'remote card cache references are cleared',
      /new\.cached_item_id := null/i.test(migrations),
    ],
    [
      'share extension ingest does not trigger cloud sync',
      !shareExtensionHook.includes('syncWithRetry') &&
        !shareExtensionHook.includes("from '../services/sync'"),
    ],
  ];
  const missing = requirements.filter(([, ok]) => !ok).map(([label]) => label);

  add(
    missing.length === 0 ? 'pass' : 'fail',
    'Local-only cache sync boundary',
    missing.length === 0
      ? 'cached_items cannot be pulled/pushed by the app or client roles, and card sync drops cache references.'
      : `Missing cache isolation controls: ${missing.join(', ')}`
  );
}

function checkAccountIsolationBoundary() {
  const appSource = readFile('App.tsx');
  const localScope = readFile('src/services/auth/localDataScope.ts');
  const databaseSchema = readFile('src/database/schema.js');
  const syncSource = readFile('src/services/sync/index.ts');
  const deckMainFlow = readFile('src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx');
  const cacheListDataSource = readFile(
    'src/screens/flow/CacheScreenFlow/hooks/useCacheListDataSource.ts'
  );
  const settingsSource = readFile('src/services/settings/userSettings.ts');
  const imageStore = readFile('src/services/media/localCardImageStore.ts');
  const shareExtension = readFile('src/services/shareExtension/shareExtensionService.ts');
  const sharedDefaults = readFile('src/native/SharedDefaultsModule.ts');
  const nativeShareExtension = readFile('ios/NuancesShareExtension/ShareViewController.swift');
  const createCardFlow = readFile('src/screens/flow/CacheScreenFlow/CreateCardFlow.tsx');
  const addCacheItemFlow = readFile('src/screens/flow/CacheScreenFlow/AddCacheItemFlow.tsx');
  const cardDetailFlow = readFile('src/screens/flow/DeckScreenFlow/CardDetailFlow.tsx');
  const userIdentity = readFile('src/services/auth/userIdentity.ts');
  const cardCloudPersistence = readFile('src/services/cards/cardCloudPersistence.ts');
  const legacyCardUpgrade = readFile('src/services/cards/legacyCardIdUpgrade.ts');
  const cardImageQueue = readFile('src/services/cards/cardImageCloudQueue.ts');
  const accountDeletion = readFile('src/services/account/AccountDeletionService.ts');
  const migrations = readSupabaseMigrations();
  const requirements = [
    [
      'all Watermelon user tables are scoped',
      ['cards', 'cached_items', 'review_history', 'profiles', 'sync_metadata', 'user_settings']
        .every((table) => {
          const tableStart = databaseSchema.indexOf(`name: '${table}'`);
          if (tableStart < 0) return false;
          return databaseSchema
            .slice(tableStart, tableStart + 800)
            .includes("name: 'user_id'");
        }) &&
        deckMainFlow.includes("Q.where('user_id', userId)") &&
        cacheListDataSource.includes("Q.where('user_id', userId)"),
    ],
    [
      'auth suspension preserves local rows',
      !appSource.includes('clearAllLocalUserScopedData') &&
        !localScope.includes('prepareDestroyPermanently'),
    ],
    [
      'scope transitions wait for active sync',
      localScope.includes('await waitForSyncIdle(') &&
        syncSource.includes('export async function waitForSyncIdle'),
    ],
    [
      'full sync actually resets the Watermelon cursor',
      syncSource.includes("removeLocal('__watermelon_last_pulled_at')") &&
        syncSource.includes("removeLocal('__watermelon_last_pulled_schema_version')") &&
        localScope.includes("CURRENT_SYNC_SCOPE_VERSION = '4'"),
    ],
    [
      'sync verifies authenticated user',
      syncSource.includes('const verifiedUserId = await getAuthenticatedUserId()') &&
        syncSource.includes('assertSessionUser(userId)') &&
        syncSource.includes('assertChangesBelongToUser') &&
        syncSource.includes('assertPulledRowsBelongToUser'),
    ],
    [
      'sync uses server time and paginates cloud rows',
      syncSource.includes("supabase.rpc('sync_server_timestamp_ms')") &&
        syncSource.includes('.range(from, from + PULL_PAGE_SIZE - 1)') &&
        migrations.includes('function public.sync_server_timestamp_ms()'),
    ],
    [
      'auth transitions reject stale work',
      appSource.includes('authTransitionIdRef') &&
        appSource.includes('isStaleTransition()'),
    ],
    [
      'settings use account-specific storage',
      settingsSource.includes('`${SETTINGS_STORAGE_KEY}:${scopeId}`') &&
        settingsSource.includes('isCurrentSettingsScope'),
    ],
    [
      'local card images use account-specific storage',
      imageStore.includes('`${LOCAL_CARD_IMAGE_MAP_KEY}:${userId}`') &&
        imageStore.includes('card-images/${userId}/'),
    ],
    [
      'share ingest revalidates account ownership',
      shareExtension.includes('assertActiveAccount(userId)') &&
        shareExtension.includes('${SHARED_IMAGES_SUBDIR}/${userId}/') &&
        shareExtension.includes('`${SHARE_INGEST_EVENTS_KEY}:${userId') &&
        shareExtension.includes('snapshot?.ownerUserId !== userId') &&
        sharedDefaults.includes('setAppGroupActiveUserId') &&
        nativeShareExtension.includes('"owner_user_id": ownerUserID'),
    ],
    [
      'account deletion removes scoped artifacts',
      accountDeletion.includes('`user_app_settings_v1:${userId}`') &&
        accountDeletion.includes('`local_card_image_map_v1:${userId}`'),
    ],
    [
      'saved cards use stable cloud IDs and remote confirmation',
      createCardFlow.includes('assignCloudCardId(card)') &&
      createCardFlow.includes('queueSavedCardsForCloudPersistence') &&
        cardCloudPersistence.includes('Crypto.randomUUID()') &&
        cardCloudPersistence.includes('flushMutationBatch(') &&
        cardCloudPersistence.includes('markCardSyncDirty(userId)') &&
        cardCloudPersistence.includes(".select('id, user_id')") &&
        cardCloudPersistence.includes('queueDeletedCardForCloudPersistence') &&
        cardCloudPersistence.includes(".select('id, user_id, deleted_at')"),
    ],
    [
      'card sync triggers are coalesced and foreground-throttled',
      syncSource.includes('mutationVersionByUser') &&
        syncSource.includes('onlyIfDirtyAfterCurrent') &&
        syncSource.includes('export async function syncIfNeeded') &&
        appSource.includes("reason === 'foreground'") &&
        cardCloudPersistence.includes('CARD_MUTATION_DEBOUNCE_MS'),
    ],
    [
      'card image uploads sync once per batch',
      cardImageQueue.includes('jobsNeedingSync') &&
        cardImageQueue.includes(".in('id', jobsNeedingSync.map") &&
        !cardImageQueue.includes('async function processJob('),
    ],
    [
      'stale route records are revalidated before read/write',
      userIdentity.includes('assertRecordOwnedByCurrentUser') &&
        createCardFlow.includes('assertRecordOwnedByCurrentUser(') &&
        addCacheItemFlow.includes('assertRecordOwnedByCurrentUser(') &&
        cardDetailFlow.includes('cachedItem.userId === activeOwnerId'),
    ],
    [
      'startup backup is independent of subscription bootstrap',
      appSource.includes("triggerBackgroundCardSync('startup')") &&
        appSource.includes("triggerBackgroundCardSync('auth')") &&
        appSource.includes('function triggerBackgroundAccountRefresh(') &&
        appSource.includes('void SubscriptionService.syncEntitlements(userId)'),
    ],
    [
      'legacy cards are upgraded before sync',
      syncSource.includes('await upgradeLegacyCardIdsForUser(userId)') &&
        legacyCardUpgrade.includes(".eq('user_id', userId)") &&
        legacyCardUpgrade.includes('assertActiveAccount(normalizedUserId)') &&
        legacyCardUpgrade.includes('prepareDestroyPermanently()'),
    ],
    [
      'card images use a durable owner-scoped upload queue',
      createCardFlow.includes('queueCardImageUploads') &&
        appSource.includes('processPendingCardImageUploads') &&
        cardImageQueue.includes('`${QUEUE_KEY_PREFIX}:${userId}`') &&
        cardImageQueue.includes(".select('id, user_id, image_url')") &&
        cardImageQueue.includes('assertActiveAccount(job.userId)'),
    ],
    [
      'remote card owner is immutable and auth-bound',
      migrations.includes('create or replace function public.enforce_remote_card_owner()') &&
        migrations.includes("raise exception 'card owner is immutable'") &&
        /create policy "Users can update their own cards"[\s\S]*using \(auth\.uid\(\) = user_id\)[\s\S]*with check \(auth\.uid\(\) = user_id\)/i.test(migrations),
    ],
  ];
  const missing = requirements.filter(([, ok]) => !ok).map(([label]) => label);

  add(
    missing.length === 0 ? 'pass' : 'fail',
    'Local account-isolation boundary',
    missing.length === 0
      ? 'Database, sync, auth transitions, settings, and local card images are isolated by account.'
      : `Missing account-isolation controls: ${missing.join(', ')}`
  );
}

function checkRemoteAuthCallBoundary() {
  const tracked = gitLsFiles();
  const sourceFiles = tracked.filter((file) => /\.(ts|tsx)$/.test(file));
  const directRemoteAuthAllowed = new Set([
    'src/services/supabase/client.ts',
    'src/services/auth/userIdentity.ts',
    'src/services/sync/index.ts',
    'src/services/ai/edgeAiClient.ts',
    'src/services/tts/cloudSpeech.ts',
    'src/services/pronunciation/cloudCoach.ts',
  ]);
  const violations = [];

  for (const file of sourceFiles) {
    const content = readFile(file);
    if (
      !directRemoteAuthAllowed.has(file) &&
      (
        /supabase\.auth\.getUser\s*\(/.test(content) ||
        /\bgetCurrentUser\s*\(/.test(content) ||
        /\bgetCurrentAuthUserId\s*\(/.test(content) ||
        /\bgetVerifiedAuthUserId\s*\(/.test(content)
      )
    ) {
      violations.push(file);
    }
  }

  add(
    violations.length === 0 ? 'pass' : 'fail',
    'Remote auth call timing boundary',
    violations.length === 0
      ? 'UI and local-data paths use persisted session identity; remote getUser checks are limited to network-required services.'
      : `Remote auth verification found outside approved network services: ${summarizeFiles(violations)}`
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
  const lexicalDefinitionScopeOk =
    aiProxy.includes('getLexicalDefinitionScopeInstruction') &&
    aiProxy.includes('best matches the target’s contribution here') &&
    aiProxy.includes('same lexical meaning') &&
    aiProxy.includes('relationship assumption') &&
    aiProxy.includes('into culturalBackground') &&
    !aiProxy.includes('lead someone on');

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
  add(
    lexicalDefinitionScopeOk ? 'pass' : 'fail',
    'AI lexical definition scope',
    lexicalDefinitionScopeOk
      ? 'Card definitions preserve lexical core meaning and keep source-only implications in contextual fields.'
      : 'AI card prompts are missing lexical-core versus source-context separation.'
  );
}

function checkCacheShareSafety() {
  const nativeShare = readFile('ios/NuancesShareExtension/ShareViewController.swift');
  const pluginShare = readFile('plugins/ShareViewController.swift');
  const nativeDefaults = readFile('ios/Nuances/SharedDefaultsModule.swift');
  const nativeBridge = readFile('ios/Nuances/SharedDefaultsModuleBridge.m');
  const sharedDefaults = readFile('src/native/SharedDefaultsModule.ts');
  const shareService = readFile('src/services/shareExtension/shareExtensionService.ts');
  const cacheScreen = readFile('src/screens/flow/CacheScreenFlow/index.tsx');
  const ocrBackfill = readFile('src/screens/flow/CacheScreenFlow/hooks/useCacheOcrBackfill.ts');

  const parityOk =
    (nativeShare === pluginShare || nativeShare.endsWith(pluginShare)) &&
    nativeShare.includes('alreadyQueued');
  const atomicClearOk =
    nativeDefaults.includes('clearSharedContentIfTimestampMatches') &&
    nativeBridge.includes('clearSharedContentIfTimestampMatches') &&
    sharedDefaults.includes('return false;');
  const boundsOk =
    sharedDefaults.includes('MAX_SHARED_QUEUE_ITEMS = 50') &&
    sharedDefaults.includes('MAX_IMAGES_PER_SHARED_ITEM = 10') &&
    shareService.includes('getValidatedSharedImagePath') &&
    shareService.includes('getRemainingCacheCapacity');
  const renderingOk =
    cacheScreen.includes('MAX_RENDERED_CACHE_CARDS = 8') &&
    ocrBackfill.includes('MAX_OCR_ITEMS_PER_PASS = 3');

  const failures = [];
  if (!parityOk) failures.push('Share plugin/native parity or queue dedupe');
  if (!atomicClearOk) failures.push('timestamp-safe queue clear');
  if (!boundsOk) failures.push('queue/path/cache bounds');
  if (!renderingOk) failures.push('render/OCR workload bounds');
  add(
    failures.length === 0 ? 'pass' : 'fail',
    'Cache/share ingestion safety',
    failures.length === 0
      ? 'Share replay is idempotent, queue clearing is timestamp-safe, and cache rendering/OCR workloads are bounded.'
      : `Missing controls: ${failures.join(', ')}.`
  );
}

function checkAndroidShareAndOCRSafety() {
  const appConfig = readFile('app.json');
  const sharePlugin = readFile('plugins/withAndroidShareIntent.js');
  const shareNative = readFile('modules/android-share-intent/android/src/main/java/expo/modules/androidshareintent/AndroidShareIntentModule.kt');
  const shareJs = readFile('modules/android-share-intent/src/index.ts');
  const shareService = readFile('src/services/shareExtension/shareExtensionService.ts');
  const ocrConfig = readFile('modules/vision-ocr/expo-module.config.json');
  const ocrGradle = readFile('modules/vision-ocr/android/build.gradle');
  const ocrNative = readFile('modules/vision-ocr/android/src/main/java/expo/modules/visionocr/NuancesVisionOCRModule.kt');

  const filtersOk = appConfig.includes('./plugins/withAndroidShareIntent.js') &&
    sharePlugin.includes('android.intent.action.SEND_MULTIPLE') &&
    sharePlugin.includes('text/plain') && sharePlugin.includes('image/*') &&
    !sharePlugin.includes("'*/*'") && !sharePlugin.includes('"*/*"');
  const queueOk = shareNative.includes('MAX_QUEUE = 50') &&
    shareNative.includes('MAX_IMAGES = 10') && shareNative.includes('MAX_TEXT = 2000') &&
    shareNative.includes('stableId(') && shareNative.includes('copyImages(') &&
    shareJs.includes('acknowledgeSharedPayloads') && shareService.includes('payload.ownerUserId !== userId') &&
    shareService.includes("item.sourceApp = 'android_share_sheet'");
  const ocrOk = ocrConfig.includes('"android"') &&
    ocrGradle.includes('com.google.mlkit:text-recognition:16.0.1') &&
    ocrNative.includes('TextRecognition.getClient') && ocrNative.includes('InputImage.fromFilePath');

  const failures = [];
  if (!filtersOk) failures.push('narrow SEND/SEND_MULTIPLE filters');
  if (!queueOk) failures.push('bounded, owned, replay-safe local share queue');
  if (!ocrOk) failures.push('bundled Android ML Kit OCR');
  add(
    failures.length === 0 ? 'pass' : 'fail',
    'Android share and on-device OCR boundary',
    failures.length === 0
      ? 'Android shares are narrowly filtered, copied locally, account-bound and acknowledged by stable ID; OCR uses bundled ML Kit.'
      : `Missing controls: ${failures.join(', ')}.`
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
checkCrossUserAccessPolicies();
checkLocalOnlyCacheBoundary();
checkAccountIsolationBoundary();
checkRemoteAuthCallBoundary();
checkEdgeAuthBoundaries();
checkDeleteAccountBoundary();
checkEntitlementSpoofingBoundary();
checkInputAndOutputHandling();
checkCacheShareSafety();
checkAndroidShareAndOCRSafety();
checkLocalStorageAndLogging();
checkDevBypass();
runNpmAudit();
runLiveUnauthChecks().then(printResults).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
