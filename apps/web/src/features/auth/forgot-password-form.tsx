'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { requestPasswordRecovery } from './password-recovery';

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [coolingDown, setCoolingDown] = useState(false);
  useEffect(() => {
    if (!coolingDown) return;
    const timeout = window.setTimeout(() => setCoolingDown(false), 60_000);
    return () => window.clearTimeout(timeout);
  }, [coolingDown]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || coolingDown) return;
    const email = new FormData(event.currentTarget).get('email');
    setPending(true); setError(''); setMessage('');
    const result = await requestPasswordRecovery(email, address => createClient().auth.resetPasswordForEmail(address, {
      // Reuse the fixed, production-allowlisted callback; it routes verified
      // recovery sessions separately from invitations and pending setup.
      redirectTo: `${window.location.origin}/auth/confirm?next=/set-password`,
    }));
    setPending(false);
    if (result.ok) { setMessage(result.message ?? 'Check your email.'); setCoolingDown(true); }
    else setError(result.error ?? 'Recovery could not be requested.');
  }
  return <form className="login-form" onSubmit={submit}>
    <label className="field"><span>Email address</span>
      <input name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required disabled={pending} />
    </label>
    <p className="auth-help">The email link expires after one hour. Once opened, finish within 15 minutes. Open it in the browser where you requested it.</p>
    {message ? <p className="auth-notice" role="status">{message}</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="button button-primary" type="submit" disabled={pending || coolingDown}>
      {pending ? 'Requesting link…' : coolingDown ? 'Link requested · wait a minute to retry' : 'Send reset link'}
    </button>
    <Link className="auth-back-link" href="/login">Back to sign in</Link>
  </form>;
}
