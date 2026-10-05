import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const code = request.nextUrl.searchParams.get('code');
  // Staff email setup uses recovery tokens and one fixed destination. Never
  // allow an email query parameter to redirect to another site.
  if (tokenHash && type === 'recovery') {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (!error) return NextResponse.redirect(new URL('/set-password', request.url));
  }
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/set-password', request.url));
  }
  // Supabase's default recovery email redirects with a URL fragment. Fragments
  // never reach the server; the browser carries it through this redirect and
  // the dedicated client page consumes and immediately removes it.
  if (!tokenHash && !code) return NextResponse.redirect(new URL('/auth/complete', request.url));
  return NextResponse.redirect(new URL('/login?reason=setup-link', request.url));
}
