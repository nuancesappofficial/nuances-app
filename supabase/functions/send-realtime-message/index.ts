import { createServiceRoleClient } from '../_shared/entitlement.ts';

function buildCorsHeaders(req?: Request): Record<string, string> {
  const configuredOrigin = (Deno.env.get('APP_MESSAGE_ALLOWED_ORIGIN') ?? '').trim();
  const requestOrigin = req?.headers.get('origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key, x-sync-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (configuredOrigin && requestOrigin === configuredOrigin) {
    headers['Access-Control-Allow-Origin'] = configuredOrigin;
    headers['Vary'] = 'Origin';
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return headers;
}

function jsonResponse(payload: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function verifyAdminAuth(req: Request): boolean {
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const syncToken = (
    Deno.env.get('APP_MESSAGE_ADMIN_KEY') ??
    Deno.env.get('APP_VERSION_POLICY_SYNC_TOKEN') ??
    serviceRoleKey
  ).trim();

  const authHeader = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const adminKeyHeader = (req.headers.get('x-admin-key') ?? req.headers.get('x-sync-token') ?? '').trim();

  if (adminKeyHeader && (adminKeyHeader === syncToken || adminKeyHeader === serviceRoleKey)) {
    return true;
  }
  if (authHeader && (authHeader === serviceRoleKey || authHeader === syncToken)) {
    return true;
  }
  return false;
}

type SendMessageRequest = {
  type?: 'push' | 'in_app' | 'both';
  title: string;
  body: string;
  targetType?: 'all' | 'user';
  targetUserId?: string;
  targetEmail?: string;
  actionUrl?: string;
  actionText?: string;
  priority?: 'normal' | 'high' | 'urgent';
  expiresAt?: string;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority?: 'default' | 'high';
  data?: Record<string, unknown>;
};

async function sendExpoPushBatch(messages: ExpoPushMessage[]): Promise<{ success: number; errors: unknown[] }> {
  if (messages.length === 0) return { success: 0, errors: [] };

  const chunks: ExpoPushMessage[][] = [];
  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    chunks.push(messages.slice(i, i + chunkSize));
  }

  let successCount = 0;
  const errors: unknown[] = [];

  for (const chunk of chunks) {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        const text = await response.text();
        errors.push({ status: response.status, response: text });
      } else {
        const result = (await response.json()) as { data?: Array<{ status: string; message?: string }> };
        const receipts = result?.data || [];
        for (const receipt of receipts) {
          if (receipt.status === 'ok') {
            successCount += 1;
          } else {
            errors.push(receipt);
          }
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { success: successCount, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req);
  }

  if (!verifyAdminAuth(req)) {
    return jsonResponse({ error: 'Unauthorized: invalid admin key or service role token' }, 401, req);
  }

  try {
    const payload = (await req.json()) as SendMessageRequest;
    const title = (payload.title ?? '').trim();
    const body = (payload.body ?? '').trim();

    if (!title || !body) {
      return jsonResponse({ error: 'Missing required fields: title and body' }, 400, req);
    }

    const type = payload.type ?? 'both';
    const targetType = payload.targetType ?? 'all';
    let targetUserId = payload.targetUserId?.trim() || null;
    const targetEmail = payload.targetEmail?.trim()?.toLowerCase() || null;
    const actionUrl = payload.actionUrl?.trim() || null;
    const actionText = payload.actionText?.trim() || null;
    const priority = payload.priority ?? 'normal';
    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null;

    const supabase = createServiceRoleClient();

    // If targetEmail is provided without targetUserId, look up targetUserId from auth.users
    if (targetType === 'user' && !targetUserId && targetEmail) {
      const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
      if (!userError && userData?.users) {
        const found = userData.users.find((u) => u.email?.toLowerCase() === targetEmail);
        if (found) {
          targetUserId = found.id;
        }
      }
      if (!targetUserId) {
        return jsonResponse(
          { error: `User with email ${targetEmail} not found` },
          404,
          req
        );
      }
    }

    let insertedMessage: Record<string, unknown> | null = null;

    // 1. In-App Announcement (if type is 'in_app' or 'both')
    if (type === 'in_app' || type === 'both') {
      const { data, error: insertError } = await supabase
        .from('app_messages')
        .insert({
          type,
          title,
          body,
          target_type: targetType,
          target_user_id: targetUserId,
          target_email: targetEmail,
          action_url: actionUrl,
          action_text: actionText,
          priority,
          is_active: true,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to insert in-app message: ${insertError.message}`);
      }
      insertedMessage = data;
    }

    // 2. Remote Push Notifications (if type is 'push' or 'both')
    let pushTokensFound = 0;
    let pushSentCount = 0;
    let pushErrors: unknown[] = [];

    if (type === 'push' || type === 'both') {
      let tokensQuery = supabase.from('user_push_tokens').select('push_token, user_id');

      if (targetType === 'user' && targetUserId) {
        tokensQuery = tokensQuery.eq('user_id', targetUserId);
      }

      const { data: tokenRows, error: tokenError } = await tokensQuery;
      if (tokenError) {
        throw new Error(`Failed to fetch push tokens: ${tokenError.message}`);
      }

      const tokens = (tokenRows || [])
        .map((row) => row.push_token)
        .filter((token): token is string => typeof token === 'string' && token.startsWith('ExponentPushToken'));

      pushTokensFound = tokens.length;

      if (tokens.length > 0) {
        const expoMessages: ExpoPushMessage[] = tokens.map((to) => ({
          to,
          title,
          body,
          sound: 'default',
          priority: priority === 'urgent' ? 'high' : 'default',
          data: {
            kind: 'nuances-announcement',
            messageId: insertedMessage ? (insertedMessage.id as string) : null,
            actionUrl,
            actionText,
          },
        }));

        const pushResult = await sendExpoPushBatch(expoMessages);
        pushSentCount = pushResult.success;
        pushErrors = pushResult.errors;
      }
    }

    console.log('[send-realtime-message] dispatched:', {
      type,
      targetType,
      targetUserId,
      targetEmail,
      title,
      inAppCreated: Boolean(insertedMessage),
      pushTokensFound,
      pushSentCount,
    });

    return jsonResponse(
      {
        ok: true,
        message: insertedMessage,
        inAppCreated: Boolean(insertedMessage),
        pushTokensFound,
        pushSentCount,
        pushErrors,
      },
      200,
      req
    );
  } catch (error) {
    console.error('[send-realtime-message] error:', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      500,
      req
    );
  }
});
