'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Circle } from 'lucide-react';
import { PasswordInput } from '@/components/ui/password-input';
import { finishPasswordSetupAction, finishPasswordRecoveryAction } from './password-setup-actions';

export function PasswordSetupForm({ mode = 'setup' }: { mode?: 'setup' | 'recovery' }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const id = useId();
  const lengthMet = password.length >= 12 && password.length <= 72;
  const matches = Boolean(confirmation) && password === confirmation;
  const checks = [
    { text: '12–72 characters', met: lengthMet },
    { text: 'Passwords match', met: matches },
  ];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPasswordVisible(false);
    setConfirmationVisible(false);
    setPending(true);
    setError('');
    try {
      const finish = mode === 'recovery' ? finishPasswordRecoveryAction : finishPasswordSetupAction;
      const result = await finish(String(fields.get('password') ?? ''), String(fields.get('confirmation') ?? ''));
      if (!result.ok) { setError(result.error ?? 'Staff setup could not be completed.'); return; }
      router.replace(mode === 'recovery' ? '/login?reason=password-reset' : '/');
      router.refresh();
    } catch {
      setError(mode === 'recovery' ? 'Password recovery could not finish. Request a new reset link or try again.' : 'Staff setup could not be completed. Try again.');
    } finally { setPending(false); }
  }
  return <form className="login-form password-setup-form" onSubmit={submit}>
    <div className="password-setup-entry">
      <PasswordInput id={`${id}-password`} label="New password" name="password" value={password}
        onChange={event => { setPassword(event.target.value); setError(''); }} visible={passwordVisible}
        onVisibilityChange={() => setPasswordVisible(visible => !visible)}
        aria-describedby={`${id}-length ${id}-help`} autoComplete="new-password"
        minLength={12} maxLength={72} required disabled={pending} />
      <div className="password-length-bars" data-ready={lengthMet} aria-hidden="true">
        {[1, 8, 12, 16, 20].map(length => <span key={length} data-filled={password.length >= length} />)}
      </div>
      <p className="password-length-caption" id={`${id}-length`}>
        <span>Password length</span><span>{password.length} {password.length === 1 ? 'character' : 'characters'}</span>
      </p>
    </div>
    <PasswordInput id={`${id}-confirmation`} label="Confirm password" name="confirmation" value={confirmation}
      onChange={event => { setConfirmation(event.target.value); setError(''); }} visible={confirmationVisible}
      onVisibilityChange={() => setConfirmationVisible(visible => !visible)}
      aria-describedby={`${id}-checks`} autoComplete="new-password"
      minLength={12} maxLength={72} required disabled={pending} />
    <div className="password-setup-guidance">
      <ul className="password-setup-checks" id={`${id}-checks`} aria-label="Password checks">
        {checks.map(check => <li key={check.text} data-met={check.met}>
          {check.met ? <Check aria-hidden="true" size={16} strokeWidth={2} /> : <Circle aria-hidden="true" size={16} strokeWidth={1.5} />}
          <span>{check.text}<span className="sr-only">{check.met ? ' — met' : ' — not yet met'}</span></span>
        </li>)}
      </ul>
      <p id={`${id}-help`}>Choose a password you use only for this account. A longer passphrase can be easier to remember.</p>
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {error && mode === 'recovery' ? <a className="auth-back-link" href="/forgot-password">Request a new link</a> : null}
    <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : mode === 'recovery' ? 'Reset password and sign in' : 'Set password and continue'}</button>
  </form>;
}
