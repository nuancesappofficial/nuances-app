import { supabase } from '@services/supabase/client';

type FreshTestAccountResetResult = {
  reset: boolean;
  user_id: string;
};

export async function resetFreshTestAccount(): Promise<FreshTestAccountResetResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user.id;
  if (!userId) {
    throw new Error('Fresh test account reset requires an authenticated session.');
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      english_level: null,
      learning_goal: null,
      ai_breakdown_mode: 'context',
      onboarding_completed: false,
      has_seen_tour: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (profileError) {
    throw new Error(`Fresh test profile reset failed: ${profileError.message}`);
  }

  const { error: cardsError } = await supabase.from('cards').delete().eq('user_id', userId);
  if (cardsError) {
    throw new Error(`Fresh test card reset failed: ${cardsError.message}`);
  }

  const { error: syncError } = await supabase
    .from('sync_metadata')
    .delete()
    .eq('user_id', userId);
  if (syncError) {
    throw new Error(`Fresh test sync reset failed: ${syncError.message}`);
  }

  return { reset: true, user_id: userId };
}
