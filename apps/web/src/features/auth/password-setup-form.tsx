'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { finishPasswordSetupAction } from './password-setup-actions';

export function PasswordSetupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const result = await finishPasswordSetupAction(String(fields.get('password') ?? ''), String(fields.get('confirmation') ?? ''));
      if (!result.ok) { setError(result.error ?? 'Staff setup could not be completed.'); return; }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Staff setup could not be completed. Try again.');
    } finally { setPending(false); }
  }
  return <form className="login-form" onSubmit={submit}>
    <label className="field"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required disabled={pending} /></label>
    <label className="field"><span>Confirm password</span><input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={72} required disabled={pending} /></label>
    <p>Use 12–72 characters. Choose a password you use only for this account.</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Set password and continue'}</button>
  </form>;
}
