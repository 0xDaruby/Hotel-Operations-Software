'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hasStaffSetupResponse } from './setup-link';
import { setRememberBrowserSession } from '@/lib/supabase/browser-persistence';
import Link from 'next/link';
import { authRateLimited, normalizeAuthEmail, validLoginPassword } from './auth-input';

const reasonMessages: Record<string, string> = {
  inactive: 'This staff account is inactive. Ask the Owner / Manager for access.',
  revoked: 'Your staff session has ended. Sign in again if your account is active.',
  deleted: 'This staff login has been deleted. Contact the Owner / Manager.',
  'signed-out': 'Your session has ended. Please sign in again.',
  missing: 'Your sign-in is valid, but no staff profile is linked to it yet.',
  'invalid-role': 'This account does not have a supported hotel role.',
  'setup-link': 'This email link is invalid or expired. Use Forgot password, or ask the Owner / Manager to resend your setup email.',
  'password-reset': 'Your password was reset. Sign in with your new password.',
};

type LoginFormProps = {
  nextPath: string;
  reason?: string;
};

export function LoginForm({ nextPath, reason }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState(reason ? reasonMessages[reason] : '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    // The root setup-link bridge consumes this link. Do not clear its session
    // during a redirect from a previously signed-in account.
    if (hasStaffSetupResponse(window.location.hash)) {
      return;
    }
    if (!reason) return;
    void createClient().auth.signOut({ scope: 'local' });
  }, [reason]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    setIsPasswordVisible(false);

    const formData = new FormData(event.currentTarget);
    const email = normalizeAuthEmail(formData.get('email'));
    const password = formData.get('password');
    if (!email || !validLoginPassword(password)) {
      setError('Enter a valid email address and password.'); setIsSubmitting(false); return;
    }
    try {
      setRememberBrowserSession(rememberMe);
      const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });
      if (signInError) {
        if (authRateLimited(signInError)) {
          setError('Too many sign-in attempts. Wait a few minutes before trying again.'); setIsSubmitting(false); return;
        }
        setError('We could not sign you in. Check your email and password. New staff must open their setup email and choose a password first.');
        setIsSubmitting(false);
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError('We could not complete sign-in. Check your connection and that cookies are allowed, then try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Email address</span>
        <input
          autoComplete="username"
          disabled={isSubmitting}
          inputMode="email"
          name="email"
          maxLength={254}
          placeholder="name@hotel.com"
          required
          type="email"
        />
      </label>
      <div className="field">
        <label htmlFor="password">Password</label>
        <div className="password-input-control">
          <input
            autoComplete="current-password"
            disabled={isSubmitting}
            id="password"
            maxLength={1024}
            name="password"
            required
            type={isPasswordVisible ? 'text' : 'password'}
          />
          <button
            aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={isPasswordVisible}
            className="password-visibility-toggle"
            disabled={isSubmitting}
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            title={isPasswordVisible ? 'Hide password' : 'Show password'}
            type="button"
          >
            {isPasswordVisible
              ? <EyeOff aria-hidden="true" size={18} strokeWidth={1.8} />
              : <Eye aria-hidden="true" size={18} strokeWidth={1.8} />}
          </button>
        </div>
      </div>
      <Link className="auth-back-link" href="/forgot-password">Forgot password?</Link>
      <div className="login-remember">
        <label><input type="checkbox" name="rememberMe" checked={rememberMe}
          onChange={event => setRememberMe(event.target.checked)} disabled={isSubmitting}
          aria-describedby="remember-me-help" /><span>Remember me</span></label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Signing in…' : 'Sign in to operations'}
      </button>
    </form>
  );
}
