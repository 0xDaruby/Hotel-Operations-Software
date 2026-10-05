import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PasswordSetupForm } from '@/features/auth/password-setup-form';

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const { data: profile, error } = await supabase.from('staff_profiles')
    .select('setup_pending, active').eq('user_id', data.user.id).maybeSingle();
  if (error) throw new Error('Unable to check staff setup. Please try again.');
  if (!profile?.setup_pending) redirect(profile?.active ? '/' : '/login?reason=inactive');
  return <main className="login-page"><section className="login-panel"><div className="login-card">
    <p className="eyebrow">Individual staff access</p><h1>Set your password</h1>
    <p className="login-help">Complete your account setup to open the hotel workspace.</p><PasswordSetupForm />
  </div></section></main>;
}
