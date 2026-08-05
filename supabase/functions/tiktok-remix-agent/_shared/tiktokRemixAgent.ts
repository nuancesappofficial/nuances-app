type AgentTask = {
  id: string;
  status: string;
  assignedAgent: string;
  action: string;
  brief: string;
};

type Campaign = {
  campaignId: string;
  platform: string;
  method: string;
};

function trackingUrl(campaign: Campaign): string {
  const query = new URLSearchParams({
    manager: 'content_creation',
    platform: campaign.platform,
    method: campaign.method,
    campaign_id: campaign.campaignId,
  });
  return `nuances://open?${query.toString()}`;
}

export function createTikTokRemixAgent() {
  return {
    createDraft({ task, campaign }: { task: AgentTask; campaign: Campaign }) {
      if (task.status !== 'approved') {
        throw new Error('TikTok Remix Agent requires an approved task');
      }
      if (task.assignedAgent !== 'tiktok_remix_agent') {
        throw new Error('Task must be assigned to tiktok_remix_agent');
      }
      if (campaign.platform !== 'tiktok' || campaign.method !== 'remix') {
        throw new Error('Campaign must be a TikTok remix campaign');
      }

      return {
        status: 'draft' as const,
        requiresPublishApproval: true as const,
        trackingUrl: trackingUrl(campaign),
        sourceBrief: {
          goal: 'Find a high-performing English-language clip that teaches, surprises, or starts a discussion.',
          filters: [
            'The idea must make sense without copying the original edit.',
            'The source must be creditable with a stable URL.',
            'Avoid private people, medical claims, and copyrighted clips that cannot be transformed.',
          ],
          reusePolicy: 'transform, comment, and credit; never repost unchanged',
        },
        script: {
          language: 'English',
          targetDurationSeconds: 24,
          hookOptions: [
            'This English phrase sounds simple, but most learners use it wrong.',
            'Save this before your next English conversation.',
            'Native speakers say this differently than textbooks teach it.',
          ],
          beats: [
            {
              seconds: '0–3',
              voiceover: 'Use one hook and show the transformed source idea.',
              visual: 'Remixed source moment with on-screen hook',
            },
            {
              seconds: '3–14',
              voiceover: 'Explain one useful nuance with a concrete example.',
              visual: 'Commentary, captions, and one example sentence',
            },
            {
              seconds: '14–20',
              voiceover: 'Give the viewer a quick before-and-after correction.',
              visual: 'Wrong versus natural phrasing',
            },
            {
              seconds: '20–24',
              voiceover: 'I save examples like this in Nuances so I can actually remember them.',
              visual: 'Show the real Nuances app',
            },
          ],
          caption: 'One small nuance can make your English sound much more natural. Source credit: [add source].',
          callToAction: 'Open Nuances and save one phrase you want to use this week.',
        },
        managerBrief: task.brief,
      };
    },
  };
}
