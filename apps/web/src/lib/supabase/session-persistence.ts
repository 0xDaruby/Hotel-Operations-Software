import type { CookieOptions } from '@supabase/ssr';

export const REMEMBER_COOKIE = 'hotel-remember-me';
export const REMEMBER_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieOptions(options: CookieOptions, remembered: boolean): CookieOptions {
  // Supabase uses zero maxAge to remove obsolete chunks and signed-out tokens.
  if (options.maxAge !== undefined && options.maxAge <= 0) return options;
  const sessionOptions = { ...options };
  delete sessionOptions.maxAge;
  delete sessionOptions.expires;
  return remembered ? { ...sessionOptions, maxAge: REMEMBER_SECONDS } : sessionOptions;
}

export function rememberCookieOptions(remembered: boolean): CookieOptions {
  return {
    path: '/', sameSite: 'lax',
    ...(remembered ? { maxAge: REMEMBER_SECONDS } : {}),
  };
}
