type FetchLike = typeof fetch;

type AdapterOptions = {
  host: string;
  projectId: string;
  token: string;
  fetchImpl?: FetchLike;
};

type Conversion = {
  campaignId: string;
  cardCreators: number;
  payingUsers: number;
};

function quoteHogQL(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function asCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0;
}

export function createPostHogPerformanceAdapter({
  host,
  projectId,
  token,
  fetchImpl = fetch,
}: AdapterOptions) {
  const normalizedHost = host.replace(/\/$/, '');

  return {
    async getConversions({
      campaignIds,
      lookbackDays = 30,
    }: {
      campaignIds: string[];
      lookbackDays?: number;
    }): Promise<Conversion[]> {
      const uniqueIds = [...new Set(campaignIds.filter(Boolean))];
      if (uniqueIds.length === 0) return [];
      const days = Math.min(365, Math.max(1, Math.trunc(lookbackDays)));
      const idList = uniqueIds.map(quoteHogQL).join(', ');
      const query = `
SELECT
  properties.growth_campaign_id AS campaign_id,
  uniqIf(distinct_id, event = 'card_creation_succeeded') AS card_creators,
  uniqIf(distinct_id, event = 'subscription_started') AS paying_users
FROM events
WHERE event IN ('card_creation_succeeded', 'subscription_started')
  AND timestamp >= now() - INTERVAL ${days} DAY
  AND properties.growth_campaign_id IN (${idList})
GROUP BY campaign_id
ORDER BY campaign_id
      `.trim();

      const response = await fetchImpl(
        `${normalizedHost}/api/projects/${encodeURIComponent(projectId)}/query/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
        }
      );
      if (!response.ok) {
        throw new Error(`PostHog query failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { results?: unknown[][] };
      const byCampaign = new Map<string, Conversion>();
      for (const row of payload.results ?? []) {
        const campaignId = String(row[0] ?? '');
        if (!campaignId) continue;
        byCampaign.set(campaignId, {
          campaignId,
          cardCreators: asCount(row[1]),
          payingUsers: asCount(row[2]),
        });
      }
      return uniqueIds.map(
        (campaignId) =>
          byCampaign.get(campaignId) ?? {
            campaignId,
            cardCreators: 0,
            payingUsers: 0,
          }
      );
    },
  };
}
