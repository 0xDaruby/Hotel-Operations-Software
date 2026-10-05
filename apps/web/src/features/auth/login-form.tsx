'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const reasonMessages: Record<string, string> = {
  inactive: 'This staff account is inactive. Ask the Owner / Manager for access.',
  missing: 'Your sign-in is valid, but no staff profile is linked to it yet.',
  'invalid-role': 'This account does not have a supported hotel role.',
  'setup-link': 'This setup link is invalid or expired. Ask the Owner / Manager to send a new setup email.',
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

  useEffect(() => {
    if (!reason) return;
    void createClient().auth.signOut();
  }, [reason]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    setIsPasswordVisible(false);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError('We could not sign you in. Check your email and password.');
      setIsSubmitting(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Email address</span>
        <input
          autoComplete="username"
          inputMode="email"
          name="email"
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
            id="password"
            minLength={8}
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
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Signing in…' : 'Sign in to operations'}
      </button>
    </form>
  );
}
