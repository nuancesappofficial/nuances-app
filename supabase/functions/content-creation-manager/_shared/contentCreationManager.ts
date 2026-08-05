type ContentCampaign = {
  campaignId: string;
  ownerAgent: string;
  manager: string;
  platform: string;
  method: string;
  status: string;
};

type PerformanceSnapshot = {
  campaignId: string;
  views: number;
  engagements: number;
  cardCreators: number;
  payingUsers: number;
};

export type ManagerDecision =
  | 'collect_more_data'
  | 'scale'
  | 'iterate'
  | 'stop';

type ManagerPolicy = {
  minimumViews?: number;
};

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function comparePerformance(
  left: PerformanceSnapshot,
  right: PerformanceSnapshot
): number {
  return (
    right.payingUsers - left.payingUsers ||
    rate(right.cardCreators, right.views) -
      rate(left.cardCreators, left.views) ||
    rate(right.engagements, right.views) -
      rate(left.engagements, left.views) ||
    right.views - left.views
  );
}

function reasonFor(
  decision: ManagerDecision,
  snapshot: PerformanceSnapshot,
  minimumViews: number
): string {
  if (decision === 'collect_more_data') {
    return `${snapshot.views} views is below the ${minimumViews}-view comparison threshold.`;
  }
  if (decision === 'scale') {
    return snapshot.payingUsers > 0
      ? `${snapshot.payingUsers} Paying Users is the strongest available outcome.`
      : `Best eligible Card Creator conversion at ${(
          rate(snapshot.cardCreators, snapshot.views) * 100
        ).toFixed(2)}%.`;
  }
  if (decision === 'iterate') {
    return `${snapshot.engagements} engagements and ${snapshot.cardCreators} Card Creators show interest but trail the leader.`;
  }
  return `Reached ${snapshot.views} views without engagement or Card Creators.`;
}

export function createContentCreationManager({
  minimumViews = 200,
}: ManagerPolicy = {}) {
  return {
    reviewCampaigns({
      campaigns,
      performanceSnapshots,
    }: {
      campaigns: ContentCampaign[];
      performanceSnapshots: PerformanceSnapshot[];
    }) {
      const snapshots = new Map(
        performanceSnapshots.map((snapshot) => [snapshot.campaignId, snapshot])
      );
      const activeCampaigns = campaigns.filter(
        (campaign) =>
          campaign.manager === 'content_creation' && campaign.status === 'active'
      );
      const eligibleSnapshots = activeCampaigns
        .map((campaign) => snapshots.get(campaign.campaignId))
        .filter(
          (snapshot): snapshot is PerformanceSnapshot =>
            Boolean(snapshot && snapshot.views >= minimumViews)
        )
        .sort(comparePerformance);
      const leaderId = eligibleSnapshots.find(
        (snapshot) => snapshot.payingUsers > 0 || snapshot.cardCreators > 0
      )?.campaignId;

      const decisions = activeCampaigns.map((campaign) => {
        const snapshot = snapshots.get(campaign.campaignId) ?? {
          campaignId: campaign.campaignId,
          views: 0,
          engagements: 0,
          cardCreators: 0,
          payingUsers: 0,
        };
        let decision: ManagerDecision;
        if (snapshot.views < minimumViews) {
          decision = 'collect_more_data';
        } else if (snapshot.payingUsers > 0 || campaign.campaignId === leaderId) {
          decision = 'scale';
        } else if (snapshot.cardCreators > 0 || snapshot.engagements > 0) {
          decision = 'iterate';
        } else {
          decision = 'stop';
        }
        return {
          campaignId: campaign.campaignId,
          decision,
          reason: reasonFor(decision, snapshot, minimumViews),
          snapshot,
        };
      });

      const campaignsById = new Map(
        activeCampaigns.map((campaign) => [campaign.campaignId, campaign])
      );
      const draftTasks = decisions.flatMap((item) => {
        if (item.decision !== 'scale' && item.decision !== 'iterate') return [];
        const campaign = campaignsById.get(item.campaignId)!;
        return [
          {
            campaignId: item.campaignId,
            assignedAgent: campaign.ownerAgent,
            action:
              item.decision === 'scale'
                ? ('create_more_variants' as const)
                : ('create_revised_variant' as const),
            brief: item.reason,
            requiresApproval: true as const,
          },
        ];
      });

      return { decisions, draftTasks };
    },
  };
}
