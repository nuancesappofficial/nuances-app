type SupabaseClientLike = {
  rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

type IncrementRateLimitCounterParams = {
  supabase: SupabaseClientLike;
  service: string;
  userId: string;
  bucket: string;
  bucketKey: string;
  expireInMs: number;
};

export async function incrementPostgresRateLimitCounter({
  supabase,
  service,
  userId,
  bucket,
  bucketKey,
  expireInMs,
}: IncrementRateLimitCounterParams): Promise<number> {
  const expiresAt = new Date(Date.now() + Math.max(1, expireInMs)).toISOString();
  const { data, error } = await supabase.rpc('increment_edge_rate_limit_counter', {
    p_service: service,
    p_user_id: userId,
    p_bucket: bucket,
    p_bucket_key: bucketKey,
    p_expires_at: expiresAt,
  });

  if (error) {
    throw error;
  }

  const count = Number(data);
  if (!Number.isFinite(count)) {
    throw new Error(`Invalid rate limit counter response: ${String(data)}`);
  }

  return count;
}
