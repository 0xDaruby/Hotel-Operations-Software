'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { completePasswordSetup, validateSetupPassword } from './password-setup';
import { completePasswordRecovery } from './password-recovery';

export async function finishPasswordRecoveryAction(password: unknown, confirmation: unknown) {
  const validation = validateSetupPassword(password, confirmation);
  if (validation) return { ok: false, error: validation };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, error: 'Open a new password-reset link to continue.' };
  // Check privileged configuration before consuming the one-use reset session.
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); }
  catch { return { ok: false, error: 'Password recovery is temporarily unavailable.' }; }
  return completePasswordRecovery({
    claim: async () => {
      const claim = await supabase.rpc('claim_password_recovery');
      if (claim.error || typeof claim.data !== 'string') throw Error('Recovery denied');
      return claim.data;
    },
    update: async () => {
      const result = await supabase.auth.updateUser({ password: password as string });
      return !result.error;
    },
    finish: async (sessionId, saved) => {
      const result = await admin.rpc('finish_password_recovery', { p_user_id: data.user.id, p_session_id: sessionId, p_password_saved: saved });
      if (result.error) throw Error('Recovery cleanup failed');
    },
  });
}

export async function finishPasswordSetupAction(password: string, confirmation: string) {
  const validation = validateSetupPassword(password, confirmation);
  if (validation) return { ok: false, error: validation };
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: 'Open your setup email again to sign in.' };
  const { data: profile, error } = await supabase.from('staff_profiles')
    .select('setup_pending, active').eq('user_id', auth.user.id).maybeSingle();
  if (error || !profile?.setup_pending || profile.active) {
    return { ok: false, error: 'This account does not have pending staff setup. Contact the Owner / Manager.' };
  }
  try {
    // Resolve server configuration before changing the password. The profile
    // remains inactive if either operation fails.
    const admin = createAdminClient();
    return await completePasswordSetup({
      updatePassword: async () => {
        const result = await supabase.auth.updateUser({ password });
        return { error: result.error ? 'Your password could not be saved. Try another password or reopen your setup email.' : null };
      },
      enableProfile: async () => {
        const result = await admin.rpc('finish_staff_setup', { p_user_id: auth.user!.id });
        return { error: result.error?.message ?? null };
      },
    });
  } catch {
    return { ok: false, error: 'Staff setup is unavailable. Contact the Owner / Manager.' };
  }
}
