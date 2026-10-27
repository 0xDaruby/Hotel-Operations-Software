'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { staffSetupFragment } from '@/features/auth/setup-link';

export default function CompleteStaffEmailPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const type = new URLSearchParams(window.location.hash.slice(1)).get('type');
    const session = staffSetupFragment(window.location.hash);
    window.history.replaceState(null, '', window.location.pathname);
    void (async () => {
      await Promise.resolve();
      if (!session) {
        setError('This email link is invalid or expired. Request a new reset link, or ask the Owner / Manager to resend your setup email.');
        return;
      }
      try {
        const { error: sessionError } = await createClient().auth.setSession(session);
        if (sessionError) throw sessionError;
        router.replace(type === 'recovery' ? '/reset-password' : '/set-password');
        router.refresh();
      } catch {
        setError('This email link could not sign you in. Request a new reset link, or ask the Owner / Manager to resend your setup email.');
      }
    })();
  }, [router]);
  return <main className="login-page"><section className="login-panel"><div className="login-card">
    <h1>Verify your account</h1>
    {error ? <><p className="form-error" role="alert">{error}</p><a className="button button-primary" href="/forgot-password">Request a new reset link</a><a className="auth-back-link" href="/login">Back to sign in</a></> : <p role="status">Checking your email link…</p>}
  </div></section></main>;
}
