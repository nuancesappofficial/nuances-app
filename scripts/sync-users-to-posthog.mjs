#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  const env = {};
  for (const file of envFiles) {
    try {
      const content = readFileSync(file, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim();
          if (!(k in env)) env[k] = v;
        }
      }
    } catch {
      // ignore missing file
    }
  }
  return env;
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    email: null,
    limit: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--email' && args[i + 1]) {
      options.email = args[++i].trim().toLowerCase();
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
使用方式:
  node scripts/sync-users-to-posthog.mjs [options]

選項:
  --email <email>   僅同步指定使用者
  --limit <n>       限制同步筆數
  --dry-run         模擬執行，不實際呼叫 PostHog API
  --help, -h        顯示此說明
      `);
      process.exit(0);
    } else if (!arg.startsWith('-') && !options.email) {
      options.email = arg.trim().toLowerCase();
    }
  }
  return options;
}

function queryUsersFromSupabase(options) {
  let whereClause = '';
  if (options.email) {
    whereClause = `WHERE lower(u.email) = lower('${options.email.replace(/'/g, "''")}')`;
  }

  let limitClause = '';
  if (options.limit && Number.isInteger(options.limit) && options.limit > 0) {
    limitClause = `LIMIT ${options.limit}`;
  }

  const sql = `
SELECT 
  u.id as user_id,
  u.email,
  to_char(u.created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as registered_at,
  to_char(u.last_sign_in_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as last_sign_in_at,
  coalesce(p.subscription_tier, 'free') as subscription_tier,
  to_char(p.subscription_expires_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as subscription_expires_at,
  to_char(p.trial_ends_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as trial_ends_at,
  coalesce(usage.total_calls, 0)::int as total_api_calls,
  coalesce(usage.total_tokens, 0)::bigint as total_tokens,
  coalesce(usage.input_tokens, 0)::bigint as total_input_tokens,
  coalesce(usage.output_tokens, 0)::bigint as total_output_tokens,
  round(coalesce(usage.cost_usd, 0), 4)::float as total_cost_usd,
  round(coalesce(usage.cost_twd, 0), 2)::float as total_cost_twd,
  to_char(usage.last_event_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as last_consumption_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
LEFT JOIN (
  SELECT 
    user_id,
    count(*) as total_calls,
    sum(input_tokens) as input_tokens,
    sum(output_tokens) as output_tokens,
    sum(total_tokens) as total_tokens,
    sum(estimated_cost_usd) as cost_usd,
    sum(estimated_cost_twd) as cost_twd,
    max(occurred_at) as last_event_at
  FROM public.ai_usage_cost_events
  GROUP BY user_id
) usage ON u.id = usage.user_id
${whereClause}
ORDER BY coalesce(usage.cost_usd, 0) DESC, u.created_at DESC
${limitClause};
  `.trim();

  const raw = execFileSync(
    'supabase',
    ['db', 'query', '--linked', '--output-format', 'json', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  );

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`無法解析 Supabase CLI 輸出：${raw}`);
  }

  const parsed = JSON.parse(raw.slice(start, end + 1));
  return parsed.rows || [];
}

async function sendBatchToPostHog(host, apiKey, batchItems) {
  const url = `${host.replace(/\/+$/, '')}/batch/`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      batch: batchItems,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PostHog Batch API 失敗 (${response.status}): ${errorText}`);
  }
}

async function main() {
  const options = parseCliArgs();
  const env = loadEnv();

  const apiKey = (
    process.env.POSTHOG_PROJECT_KEY ||
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY ||
    env.POSTHOG_PROJECT_KEY ||
    env.EXPO_PUBLIC_POSTHOG_API_KEY ||
    ''
  ).trim();

  const host = (
    process.env.POSTHOG_HOST ||
    process.env.EXPO_PUBLIC_POSTHOG_HOST ||
    env.POSTHOG_HOST ||
    env.EXPO_PUBLIC_POSTHOG_HOST ||
    'https://us.i.posthog.com'
  ).trim();

  if (!apiKey) {
    console.error('❌ 錯誤：未找到 PostHog API Key (EXPO_PUBLIC_POSTHOG_API_KEY / POSTHOG_PROJECT_KEY)');
    process.exit(1);
  }

  console.log(`🔍 正在從 Supabase 取得使用者與用量資料...`);
  const rows = queryUsersFromSupabase(options);

  if (rows.length === 0) {
    console.log(options.email ? `⚠️ 查無 Email: ${options.email}` : '⚠️ 資料庫無使用者');
    return;
  }

  console.log(`📊 共撈取到 ${rows.length} 位使用者。`);

  const batchEvents = rows.map((u) => ({
    event: '$set',
    distinct_id: u.user_id,
    timestamp: u.last_consumption_at || u.last_sign_in_at || u.registered_at || new Date().toISOString(),
    properties: {
      $set: {
        email: u.email,
        subscription_tier: u.subscription_tier,
        subscription_expires_at: u.subscription_expires_at,
        trial_ends_at: u.trial_ends_at,
        total_api_calls: Number(u.total_api_calls || 0),
        total_tokens: Number(u.total_tokens || 0),
        total_input_tokens: Number(u.total_input_tokens || 0),
        total_output_tokens: Number(u.total_output_tokens || 0),
        total_cost_usd: Number(u.total_cost_usd || 0),
        total_cost_twd: Number(u.total_cost_twd || 0),
        registered_at: u.registered_at,
        last_sign_in_at: u.last_sign_in_at,
        last_consumption_at: u.last_consumption_at,
      },
    },
  }));

  if (options.dryRun) {
    console.log(`\n[DRY RUN 模擬] 前 3 筆將送往 PostHog 的資料預覽：`);
    console.log(JSON.stringify(batchEvents.slice(0, 3), null, 2));
    console.log(`\n✅ DRY RUN 完成，未實際發送 API。`);
    return;
  }

  const BATCH_SIZE = 50;
  let sentCount = 0;

  for (let i = 0; i < batchEvents.length; i += BATCH_SIZE) {
    const chunk = batchEvents.slice(i, i + BATCH_SIZE);
    process.stdout.write(`🚀 正在同步至 PostHog (${i + 1} ~ ${Math.min(i + chunk.length, batchEvents.length)} / ${batchEvents.length})... `);
    await sendBatchToPostHog(host, apiKey, chunk);
    sentCount += chunk.length;
    console.log('✅ 成功');
  }

  console.log(`\n🎉 全部同步完成！已成功將 ${sentCount} 位使用者的方案與累積用量存入 PostHog Person Properties。`);
  console.log(`💡 現在您可以在 PostHog 的 Persons 列表中直接輸入用戶 Email 搜尋方案與用量：`);
  console.log(`   https://us.posthog.com/project/531181/persons\n`);
}

main().catch((err) => {
  console.error(`❌ 同步過程發生錯誤:`, err.message);
  process.exit(1);
});
