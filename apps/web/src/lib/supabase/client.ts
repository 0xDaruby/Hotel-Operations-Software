'use client';

import { createBrowserClient, serializeCookieHeader } from '@supabase/ssr';
import { getSupabaseConfig } from './config';
import { readBrowserCookies, rememberBrowserSession, setRememberBrowserSession } from './browser-persistence';
import { sessionCookieOptions } from './session-persistence';

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();

  browserClient ??= createBrowserClient(url, publishableKey, {
    cookies: {
      getAll: readBrowserCookies,
      setAll(cookiesToSet) {
        const remembered = rememberBrowserSession();
        cookiesToSet.forEach(({ name, value, options }) => {
          document.cookie = serializeCookieHeader(name, value, sessionCookieOptions(options, remembered));
        });
        // Renew the preference alongside the Auth cookies so a token refresh
        // cannot outlive the choice that controls its persistence.
        setRememberBrowserSession(remembered);
      },
    },
  });
  return browserClient;
}
