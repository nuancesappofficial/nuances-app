export type CampaignManager =
  | 'content_creation'
  | 'cold_messaging'
  | 'engaging';

export type CampaignStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

export type GrowthCampaign = {
  campaignId: string;
  name: string;
  ownerAgent: string;
  manager: CampaignManager;
  platform: string;
  method: string;
  status: CampaignStatus;
  createdAt: string;
};

export type RegisterCampaignInput = {
  name: string;
  ownerAgent: string;
  manager: string;
  platform: string;
  method: string;
};

export type CampaignFilters = {
  manager?: CampaignManager;
  status?: CampaignStatus;
};

export type CampaignRepository = {
  insert(campaign: GrowthCampaign): Promise<GrowthCampaign>;
  list(filters?: CampaignFilters): Promise<GrowthCampaign[]>;
  updateStatus(
    campaignId: string,
    status: CampaignStatus
  ): Promise<GrowthCampaign>;
};

type CampaignRegistryDependencies = {
  repository: CampaignRepository;
  now?: () => Date;
  randomSuffix?: () => string;
};

const CAMPAIGN_MANAGERS = new Set<CampaignManager>([
  'content_creation',
  'cold_messaging',
  'engaging',
]);

function normalizeDimension(value: string, field: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function normalizeManager(value: string): CampaignManager {
  const manager = normalizeDimension(value, 'manager') as CampaignManager;
  if (!CAMPAIGN_MANAGERS.has(manager)) {
    throw new Error(`Unsupported growth manager: ${manager}`);
  }
  return manager;
}

function dateStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function defaultRandomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

function buildTrackingUrl(campaign: GrowthCampaign): string {
  const query = new URLSearchParams({
    manager: campaign.manager,
    platform: campaign.platform,
    method: campaign.method,
    campaign_id: campaign.campaignId,
  });
  return `nuances://open?${query.toString()}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

export function createCampaignRegistry({
  repository,
  now = () => new Date(),
  randomSuffix = defaultRandomSuffix,
}: CampaignRegistryDependencies) {
  return {
    async registerCampaign(input: RegisterCampaignInput) {
      const createdAt = now();
      const manager = normalizeManager(input.manager);
      const platform = normalizeDimension(input.platform, 'platform');
      const method = normalizeDimension(input.method, 'method');
      const ownerAgent = normalizeDimension(input.ownerAgent, 'ownerAgent');
      const name = input.name.trim();
      if (!name) throw new Error('name is required');

      let campaign: GrowthCampaign | null = null;
      for (let attempt = 0; attempt < 5 && !campaign; attempt += 1) {
        try {
          campaign = await repository.insert({
            campaignId: `${manager}-${platform}-${method}-${dateStamp(createdAt)}-${randomSuffix()}`,
            name,
            ownerAgent,
            manager,
            platform,
            method,
            status: 'draft',
            createdAt: createdAt.toISOString(),
          });
        } catch (error) {
          if (!isUniqueViolation(error) || attempt === 4) throw error;
        }
      }
      if (!campaign) throw new Error('Unable to assign a unique Campaign ID');

      return { campaign, trackingUrl: buildTrackingUrl(campaign) };
    },

    async listCampaigns(filters: CampaignFilters = {}) {
      const campaigns = await repository.list(filters);
      return campaigns.map((campaign) => ({
        campaign,
        trackingUrl: buildTrackingUrl(campaign),
      }));
    },

    async activateCampaign(campaignId: string) {
      const campaign = await repository.updateStatus(campaignId, 'active');
      return { campaign, trackingUrl: buildTrackingUrl(campaign) };
    },
  };
}
