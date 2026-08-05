import type {
  CampaignFilters,
  CampaignRepository,
  GrowthCampaign,
} from './campaignRegistry.ts';

type SupabaseLike = {
  from(table: string): any;
};

type CampaignRow = {
  campaign_id: string;
  name: string;
  owner_agent: string;
  manager: GrowthCampaign['manager'];
  platform: string;
  method: string;
  status: GrowthCampaign['status'];
  created_at: string;
};

const SELECT_COLUMNS =
  'campaign_id, name, owner_agent, manager, platform, method, status, created_at';

function fromRow(row: CampaignRow): GrowthCampaign {
  return {
    campaignId: row.campaign_id,
    name: row.name,
    ownerAgent: row.owner_agent,
    manager: row.manager,
    platform: row.platform,
    method: row.method,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function createSupabaseCampaignRepository(
  supabase: SupabaseLike
): CampaignRepository {
  return {
    async insert(campaign) {
      const { data, error } = await supabase
        .from('growth_campaigns')
        .insert({
          campaign_id: campaign.campaignId,
          name: campaign.name,
          owner_agent: campaign.ownerAgent,
          manager: campaign.manager,
          platform: campaign.platform,
          method: campaign.method,
          status: campaign.status,
          created_at: campaign.createdAt,
        })
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return fromRow(data as CampaignRow);
    },

    async list(filters: CampaignFilters = {}) {
      let query = supabase
        .from('growth_campaigns')
        .select(SELECT_COLUMNS)
        .order('created_at', { ascending: false });
      if (filters.manager) query = query.eq('manager', filters.manager);
      if (filters.status) query = query.eq('status', filters.status);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as CampaignRow[]).map(fromRow);
    },

    async updateStatus(campaignId, status) {
      const { data, error } = await supabase
        .from('growth_campaigns')
        .update({ status })
        .eq('campaign_id', campaignId)
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return fromRow(data as CampaignRow);
    },
  };
}
