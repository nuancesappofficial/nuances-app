import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'cjmfobjitkmmideecfsw';

function readEnv(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

function findSecretKey(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSecretKey(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const values = Object.values(value);
  const secret = values.find(
    (candidate) =>
      typeof candidate === 'string' && candidate.startsWith('sb_secret_')
  );
  if (secret) return secret;
  for (const item of values) {
    const found = findSecretKey(item);
    if (found) return found;
  }
  return null;
}

const env = readEnv('.env.local');
const email = env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
if (!email || !env.EXPO_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing QA account or Supabase configuration in .env.local');
}

const keyOutput = execFileSync(
  'supabase',
  [
    'projects',
    'api-keys',
    '--project-ref',
    PROJECT_REF,
    '--reveal',
    '--output',
    'json',
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
);
const serviceKey = findSecretKey(JSON.parse(keyOutput));
if (!serviceKey) throw new Error('Supabase service key was not available');

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const {
  data: { users },
  error: usersError,
} = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (usersError) throw usersError;
const user = users.find(
  (candidate) => candidate.email?.toLowerCase() === email.toLowerCase()
);
if (!user) throw new Error(`QA account not found: ${email}`);

const resetTables = [
  'review_history',
  'sync_metadata',
  'subscriptions',
  'cards',
  'cached_items',
  'free_starter_card_generations',
  'app_diagnostic_logs',
];

for (const table of resetTables) {
  const { error } = await supabase.from(table).delete().eq('user_id', user.id);
  if (error && error.code !== '42P01') throw error;
}

const { error: profileError } = await supabase
  .from('profiles')
  .update({
    english_level: null,
    learning_goal: null,
    ai_breakdown_mode: 'context',
    onboarding_completed: false,
    has_seen_tour: false,
    updated_at: new Date().toISOString(),
  })
  .eq('id', user.id);
if (profileError) throw profileError;

const { data: allowance, error: allowanceError } = await supabase.rpc(
  'get_free_starter_card_allowance',
  { p_user_id: user.id, p_limit: 20, p_email: user.email }
);
if (allowanceError) throw allowanceError;

console.log(
  JSON.stringify({
    reset: true,
    email,
    userId: user.id,
    onboardingCompleted: false,
    hasSeenTour: false,
    allowance: allowance?.[0] ?? null,
  })
);
