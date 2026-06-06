import { getAuthenticatedUserFromAuthorization } from '../ai-proxy/auth/resolveUserFromBearerToken.ts';
import { createServiceRoleClient } from '../_shared/entitlement.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type DeletionStep = {
  name: string;
  deleted?: number | null;
  skipped?: boolean;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function normalizeCachedImagePath(value: string | null | undefined, userId: string): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const publicMarker = '/storage/v1/object/public/cached-images/';
  const signMarker = '/storage/v1/object/sign/cached-images/';
  const publicIndex = raw.indexOf(publicMarker);
  if (publicIndex >= 0) {
    return decodeURIComponent(raw.slice(publicIndex + publicMarker.length).split('?')[0] || '');
  }
  const signIndex = raw.indexOf(signMarker);
  if (signIndex >= 0) {
    return decodeURIComponent(raw.slice(signIndex + signMarker.length).split('?')[0] || '');
  }
  return raw.startsWith(`${userId}/`) ? raw : null;
}

async function listCachedImagePathsForUser(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  prefix = userId
): Promise<string[]> {
  const { data, error } = await supabase.storage.from('cached-images').list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) {
    console.warn('[delete-account] cached image list failed', { prefix, error: error.message });
    return [];
  }

  const paths: string[] = [];
  for (const item of data || []) {
    const path = `${prefix}/${item.name}`;
    if (item.id || item.metadata) {
      paths.push(path);
    } else {
      paths.push(...(await listCachedImagePathsForUser(supabase, userId, path)));
    }
  }
  return paths;
}

async function removeCachedImages(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  explicitPaths: string[];
}): Promise<number> {
  const { supabase, userId, explicitPaths } = params;
  const listedPaths = await listCachedImagePathsForUser(supabase, userId);
  const paths = uniqueStrings([
    ...explicitPaths.map((path) => normalizeCachedImagePath(path, userId)),
    ...listedPaths,
  ]);
  if (paths.length === 0) return 0;

  let removed = 0;
  const chunkSize = 100;
  for (let index = 0; index < paths.length; index += chunkSize) {
    const chunk = paths.slice(index, index + chunkSize);
    const { data, error } = await supabase.storage.from('cached-images').remove(chunk);
    if (error) {
      console.warn('[delete-account] cached image removal failed', { error: error.message, count: chunk.length });
      continue;
    }
    removed += data?.length ?? chunk.length;
  }
  return removed;
}

async function deleteFromTable(
  supabase: ReturnType<typeof createServiceRoleClient>,
  table: string,
  userId: string
): Promise<number | null> {
  const { count, error } = await supabase.from(table).delete({ count: 'exact' }).eq('user_id', userId);
  if (error) throw error;
  return count;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const user = await getAuthenticatedUserFromAuthorization(req);
  const userId = user?.id ?? null;
  if (!userId) {
    return jsonResponse({ error: 'Unauthorized: missing valid JWT' }, 401);
  }

  try {
    const supabase = createServiceRoleClient();
    const steps: DeletionStep[] = [];

    const { data: cachedItems, error: cachedItemsError } = await supabase
      .from('cached_items')
      .select('image_storage_path, audio_storage_path, content_url')
      .eq('user_id', userId);
    if (cachedItemsError) throw cachedItemsError;

    const cachedImagePaths = uniqueStrings(
      (cachedItems || []).flatMap((item: any) => [
        item.image_storage_path,
        item.audio_storage_path,
        item.content_url,
      ])
    );
    const removedImages = await removeCachedImages({ supabase, userId, explicitPaths: cachedImagePaths });
    steps.push({ name: 'cached-images storage', deleted: removedImages });

    steps.push({ name: 'review_history', deleted: await deleteFromTable(supabase, 'review_history', userId) });
    steps.push({ name: 'sync_metadata', deleted: await deleteFromTable(supabase, 'sync_metadata', userId) });
    steps.push({ name: 'subscriptions', deleted: await deleteFromTable(supabase, 'subscriptions', userId) });
    steps.push({ name: 'cards', deleted: await deleteFromTable(supabase, 'cards', userId) });
    steps.push({ name: 'cached_items', deleted: await deleteFromTable(supabase, 'cached_items', userId) });

    const { count: profileCount, error: profileError } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .eq('id', userId);
    if (profileError) throw profileError;
    steps.push({ name: 'profiles', deleted: profileCount });

    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) throw authError;
    steps.push({ name: 'auth.users', deleted: 1 });

    return jsonResponse({
      deleted: true,
      userId,
      steps,
    });
  } catch (error) {
    console.error('[delete-account] failed:', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'delete-account failed',
      },
      500
    );
  }
});
