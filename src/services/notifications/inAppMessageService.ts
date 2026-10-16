import { supabase } from '@services/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type AppMessage = {
  id: string;
  type: 'push' | 'in_app' | 'both';
  title: string;
  body: string;
  target_type: 'all' | 'user';
  target_user_id: string | null;
  target_email: string | null;
  action_url: string | null;
  action_text: string | null;
  priority: 'normal' | 'high' | 'urgent';
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
};

type MessageListener = (message: AppMessage) => void;

class InAppMessageService {
  private activeChannel: RealtimeChannel | null = null;
  private currentUserId: string | null = null;
  private listeners: Set<MessageListener> = new Set();
  private dismissedIds: Set<string> = new Set();
  private isChecking = false;

  public subscribe(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(message: AppMessage) {
    if (this.dismissedIds.has(message.id)) return;
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (err) {
        console.warn('[InAppMessageService] listener error:', err);
      }
    }
  }

  public async init(userId: string | null): Promise<void> {
    this.currentUserId = userId;
    this.setupRealtimeChannel();
    await this.checkForUnreadMessages();
  }

  public updateUserId(userId: string | null): void {
    if (this.currentUserId === userId) return;
    this.currentUserId = userId;
    this.setupRealtimeChannel();
    void this.checkForUnreadMessages();
  }

  private setupRealtimeChannel(): void {
    if (this.activeChannel) {
      void supabase.removeChannel(this.activeChannel);
      this.activeChannel = null;
    }

    this.activeChannel = supabase
      .channel('realtime:app_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_messages' },
        (payload) => {
          const message = payload.new as AppMessage;
          if (!message || !message.is_active) return;
          if (message.type === 'push') return; // purely push messages are not displayed as in-app dialogs

          // Address check: either sent to all, or specifically to this user
          if (message.target_type === 'user' && this.currentUserId && message.target_user_id !== this.currentUserId) {
            return;
          }

          if (message.expires_at && new Date(message.expires_at).getTime() <= Date.now()) {
            return;
          }

          this.notify(message);
        }
      )
      .subscribe((status) => {
        if (__DEV__) {
          console.log('[InAppMessageService] Realtime channel status:', status);
        }
      });
  }

  public async checkForUnreadMessages(): Promise<AppMessage | null> {
    if (this.isChecking) return null;
    this.isChecking = true;

    try {
      // 1. Fetch active messages
      let query = supabase
        .from('app_messages')
        .select('*')
        .eq('is_active', true)
        .in('type', ['in_app', 'both'])
        .order('created_at', { ascending: false })
        .limit(10);

      const { data: messages, error: messagesError } = await query;
      if (messagesError || !messages || messages.length === 0) {
        return null;
      }

      // 2. Fetch read receipts for current user
      let readIds = new Set<string>();
      if (this.currentUserId) {
        const { data: readReceipts } = await supabase
          .from('user_read_messages')
          .select('message_id')
          .eq('user_id', this.currentUserId);

        if (readReceipts) {
          readIds = new Set(readReceipts.map((r) => r.message_id));
        }
      }

      // 3. Find first unread valid message
      const now = Date.now();
      const unreadMessage = (messages as AppMessage[]).find((m) => {
        if (this.dismissedIds.has(m.id)) return false;
        if (readIds.has(m.id)) return false;
        if (m.expires_at && new Date(m.expires_at).getTime() <= now) return false;
        if (m.target_type === 'user' && this.currentUserId && m.target_user_id !== this.currentUserId) {
          return false;
        }
        return true;
      });

      if (unreadMessage) {
        this.notify(unreadMessage);
        return unreadMessage;
      }

      return null;
    } catch (err) {
      console.warn('[InAppMessageService] check unread failed:', err);
      return null;
    } finally {
      this.isChecking = false;
    }
  }

  public async markAsRead(messageId: string): Promise<void> {
    this.dismissedIds.add(messageId);

    if (!this.currentUserId) return;

    try {
      await supabase.from('user_read_messages').upsert(
        {
          user_id: this.currentUserId,
          message_id: messageId,
          read_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,message_id' }
      );
    } catch (err) {
      console.warn('[InAppMessageService] mark as read failed:', err);
    }
  }

  public cleanup(): void {
    if (this.activeChannel) {
      void supabase.removeChannel(this.activeChannel);
      this.activeChannel = null;
    }
    this.listeners.clear();
  }
}

export const inAppMessageService = new InAppMessageService();
