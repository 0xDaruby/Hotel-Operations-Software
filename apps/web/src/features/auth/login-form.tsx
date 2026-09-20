'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const reasonMessages: Record<string, string> = {
  inactive: 'This staff account is inactive. Ask the Owner / Manager for access.',
  missing: 'Your sign-in is valid, but no staff profile is linked to it yet.',
  'invalid-role': 'This account does not have a supported hotel role.',
};

type LoginFormProps = {
  nextPath: string;
  reason?: string;
};

export function LoginForm({ nextPath, reason }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState(reason ? reasonMessages[reason] : '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!reason) return;
    void createClient().auth.signOut();
  }, [reason]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

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
      <label className="field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Signing in…' : 'Sign in to operations'}
      </button>
    </form>
  );
}
