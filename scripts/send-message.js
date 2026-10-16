#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

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

function parseArgs(argv) {
  const options = {
    type: 'both',
    targetType: 'all',
    targetEmail: null,
    targetUserId: null,
    title: '',
    body: '',
    actionUrl: null,
    actionText: null,
    priority: 'normal',
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') {
      options.targetType = 'all';
    } else if (arg === '--email') {
      options.targetType = 'user';
      options.targetEmail = argv[i + 1];
      i += 1;
    } else if (arg === '--user-id' || arg === '--userId') {
      options.targetType = 'user';
      options.targetUserId = argv[i + 1];
      i += 1;
    } else if (arg === '--type') {
      options.type = argv[i + 1];
      i += 1;
    } else if (arg === '--title') {
      options.title = argv[i + 1];
      i += 1;
    } else if (arg === '--body') {
      options.body = argv[i + 1];
      i += 1;
    } else if (arg === '--url') {
      options.actionUrl = argv[i + 1];
      i += 1;
    } else if (arg === '--button' || arg === '--action-text') {
      options.actionText = argv[i + 1];
      i += 1;
    } else if (arg === '--priority') {
      options.priority = argv[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.title || !options.body) {
    console.error('Usage: node scripts/send-message.js --title "<Title>" --body "<Body>" [options]');
    console.error('Options:');
    console.error('  --all                  Send to all users (default)');
    console.error('  --email <email>        Send to user with specified email');
    console.error('  --user-id <uuid>       Send to user with specified user ID');
    console.error('  --type <push|in_app|both>  Channel type (default: both)');
    console.error('  --url <url>            Action URL / Deep link (optional)');
    console.error('  --button <text>        Action button text (optional)');
    console.error('  --priority <normal|high|urgent>  Message priority (default: normal)');
    console.error('  --dry-run              Print payload without sending');
    process.exit(1);
  }

  const payload = {
    type: options.type,
    title: options.title,
    body: options.body,
    targetType: options.targetType,
    targetEmail: options.targetEmail,
    targetUserId: options.targetUserId,
    actionUrl: options.actionUrl,
    actionText: options.actionText,
    priority: options.priority,
  };

  if (options.dryRun) {
    console.log('[send-message] Dry Run Payload:');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const env = loadEnv();
  const supabaseUrl = (env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '');
  const adminKey =
    env.APP_MESSAGE_ADMIN_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.APP_VERSION_POLICY_SYNC_TOKEN ||
    env.SUPABASE_APP_VERSION_POLICY_SYNC_TOKEN ||
    '';

  if (!supabaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_URL in .env.local');
  }
  if (!adminKey) {
    throw new Error('Missing APP_MESSAGE_ADMIN_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const endpoint = `${supabaseUrl}/functions/v1/send-realtime-message`;
  console.log(`[send-message] Sending ${options.type} message to ${endpoint}...`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
      Authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify(payload),
  });

  const responseData = await response.json().catch(() => null);

  if (!response.ok) {
    console.error('[send-message] Failed:', response.status, responseData);
    process.exit(1);
  }

  console.log('✅ Message dispatched successfully:');
  console.log(JSON.stringify(responseData, null, 2));
}

main().catch((err) => {
  console.error('[send-message] Error:', err.message || err);
  process.exit(1);
});
