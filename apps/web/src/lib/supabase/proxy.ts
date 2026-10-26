import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';
import { REMEMBER_COOKIE, rememberCookieOptions, sessionCookieOptions } from './session-persistence';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const authHeaders = new Headers();
  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        const remembered = request.cookies.get(REMEMBER_COOKIE)?.value === 'yes';
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const earlierCookies = response.cookies.getAll();
        Object.entries(headers).forEach(([name, value]) => authHeaders.set(name, value));
        response = NextResponse.next({ request });
        authHeaders.forEach((value, name) => response.headers.set(name, value));
        earlierCookies.forEach(cookie => response.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, sessionCookieOptions(options, remembered)),
        );
        response.cookies.set(REMEMBER_COOKIE, remembered ? 'yes' : 'no', rememberCookieOptions(remembered));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);
  const isProtectedRoute = !['/login', '/auth/confirm', '/auth/complete', '/auth/staff-access'].includes(request.nextUrl.pathname);

  if (!isSignedIn && isProtectedRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set(
      'next',
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    const redirectResponse = NextResponse.redirect(loginUrl);
    ['Cache-Control', 'Expires', 'Pragma'].forEach(name => {
      const value = response.headers.get(name);
      if (value) redirectResponse.headers.set(name, value);
    });
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}
