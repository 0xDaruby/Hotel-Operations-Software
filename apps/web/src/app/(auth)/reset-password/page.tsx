import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PasswordSetupForm } from '@/features/auth/password-setup-form';
import { isTransientAuthError } from '@/features/auth/session-access';

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  let allowed = false;
  let unavailable = Boolean(authError && isTransientAuthError(authError));
  if (data.user) {
    const access = await supabase.rpc('get_staff_access_status');
    if (!access.error && access.data === 'setup-pending') redirect('/set-password');
    const status = await supabase.rpc('get_password_recovery_status');
    allowed = !status.error && status.data === true;
    unavailable = Boolean(status.error);
  }
  return <main className="login-page"><section className="login-panel"><div className="login-card">
    <p className="eyebrow">Individual staff access</p><h1>Reset your password</h1>
    {allowed ? <><p className="login-help">Choose a new password. Your existing sessions will end and you’ll sign in again.</p><PasswordSetupForm mode="recovery" /></>
      : <><p className="form-error" role="alert">{unavailable ? 'Password recovery is temporarily unavailable. Try again shortly.' : 'This reset session is invalid, expired or already used. Request a new link to continue.'}</p>
        <Link className="button button-primary" href="/forgot-password">Request a new link</Link></>}
  </div></section></main>;
}
