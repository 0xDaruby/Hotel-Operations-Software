'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { completePasswordSetup, validateSetupPassword } from './password-setup';

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
