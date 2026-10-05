'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function CompleteStaffEmailPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    void (async () => {
      await Promise.resolve();
      if (params.get('type') !== 'recovery' || !accessToken || !refreshToken) {
        setError('This setup link is invalid or expired. Ask the Owner / Manager to send a new setup email.');
        return;
      }
      try {
        const { error: sessionError } = await createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (sessionError) throw sessionError;
        router.replace('/set-password');
        router.refresh();
      } catch {
        setError('This setup link could not sign you in. Ask the Owner / Manager to send a new setup email.');
      }
    })();
  }, [router]);
  return <main className="login-page"><section className="login-panel"><div className="login-card">
    <h1>Staff account setup</h1>
    {error ? <><p className="form-error" role="alert">{error}</p><a className="button button-secondary" href="/login">Back to sign in</a></> : <p role="status">Checking your setup link…</p>}
  </div></section></main>;
}
