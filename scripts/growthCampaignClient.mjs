import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_ENDPOINT =
  'https://cjmfobjitkmmideecfsw.supabase.co/functions/v1/growth-campaigns';

export function createGrowthCampaignClient({
  endpoint = DEFAULT_ENDPOINT,
  getToken,
  fetchImpl = fetch,
}) {
  async function request(url, init = {}) {
    const token = await getToken();
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        'x-growth-token': token,
      },
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.reason ?? body?.error ?? `Registry returned ${response.status}`);
    }
    return body;
  }

  return {
    registerCampaign(input) {
      return request(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
    },

    listCampaigns(filters = {}) {
      const query = new URLSearchParams();
      if (filters.manager) query.set('manager', filters.manager);
      if (filters.status) query.set('status', filters.status);
      const suffix = query.size ? `?${query.toString()}` : '';
      return request(`${endpoint}${suffix}`);
    },

    activateCampaign(campaignId) {
      return request(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'activate', campaignId }),
      });
    },
  };
}

function keychainToken() {
  return execFileSync(
    'security',
    [
      'find-generic-password',
      '-a',
      'users',
      '-s',
      'nuances-growth-operations-token',
      '-w',
    ],
    { encoding: 'utf8' }
  ).trim();
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`Expected --key value, received: ${key ?? '<empty>'}`);
    }
    options[key.slice(2)] = value;
  }
  return options;
}

async function runCli() {
  const [command, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  const client = createGrowthCampaignClient({ getToken: keychainToken });

  let result;
  if (command === 'register') {
    result = await client.registerCampaign({
      name: options.name,
      ownerAgent: options['owner-agent'],
      manager: options.manager,
      platform: options.platform,
      method: options.method,
    });
  } else if (command === 'list') {
    result = await client.listCampaigns({
      manager: options.manager,
      status: options.status,
    });
  } else if (command === 'activate') {
    result = await client.activateCampaign(options['campaign-id']);
  } else {
    throw new Error(
      'Usage: growthCampaignClient.mjs <register|list|activate> [--key value]'
    );
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
