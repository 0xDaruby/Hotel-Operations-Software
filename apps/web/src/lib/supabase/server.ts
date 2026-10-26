import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from './config';
import { REMEMBER_COOKIE, rememberCookieOptions, sessionCookieOptions } from './session-persistence';

export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          const remembered = cookieStore.get(REMEMBER_COOKIE)?.value === 'yes';
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, sessionCookieOptions(options, remembered)),
          );
          cookieStore.set(REMEMBER_COOKIE, remembered ? 'yes' : 'no', rememberCookieOptions(remembered));
        } catch {
          // Server Components cannot write cookies. proxy.ts performs refreshes.
        }
      },
    },
  });
}
