const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { join, resolve, dirname } = require('node:path');
const { readFileSync } = require('node:fs');
require('tsx/cjs');
const { REMEMBER_COOKIE, REMEMBER_SECONDS, rememberCookieOptions, sessionCookieOptions } = require('../../apps/web/src/lib/supabase/session-persistence.ts');

async function run() {
  const web = resolve(__dirname, '../../apps/web');
  const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('tsx/cli'))] }));
  const { createServerClient, parseCookieHeader, serializeCookieHeader } = require(require.resolve('@supabase/ssr', { paths: [web] }));
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const bundle = await esbuild.build({
    absWorkingDir: web, nodePaths: [join(web, 'node_modules')], bundle: true, write: false,
    format: 'iife', jsx: 'automatic', tsconfig: join(web, 'tsconfig.json'),
    stdin: { resolveDir: web, loader: 'tsx', contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import {LoginForm} from './src/features/auth/login-form';
      import {createClient} from './src/lib/supabase/client';
      createRoot(document.getElementById('root')).render(location.pathname==='/account'
        ? <button onClick={async()=>{await createClient().auth.signOut({scope:'local'});location.assign('/login')}}>Sign out</button>
        : <main className="login-page"><section className="login-panel"><div className="login-card"><h1>Welcome back</h1><LoginForm nextPath="/account" /></div></section></main>);` },
    plugins: [{ name: 'isolated-config-and-router', setup(build) {
      build.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path.endsWith('link') ? 'link' : 'router', namespace: 'fixture' }));
      build.onResolve({ filter: /^\.\/config$/ }, args => args.importer.endsWith('/supabase/client.ts') || args.importer.endsWith('\\supabase\\client.ts') ? ({ path: 'config', namespace: 'fixture' }) : undefined);
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: web, contents: args.path === 'link' ? `export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}` : args.path === 'router'
        ? `const router={replace:path=>location.assign(path),refresh:()=>{}};export const useRouter=()=>router;`
        : `export const getSupabaseConfig=()=>({url:location.origin,publishableKey:'isolated-test-key'});` }));
    } }],
  });
  const css = readFileSync(join(web, 'src/app/globals.css'), 'utf8');
  let origin;
  let failLogin = false;
  let throttleLogin = false;
  let sessionVersion = 0;
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'staff@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
  function session() {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    sessionVersion += 1;
    return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: now + 3600, iat: now, jti: String(sessionVersion) })}.fixture-signature`, refresh_token: `isolated-refresh-${sessionVersion}`, token_type: 'bearer', expires_in: 3600, user };
  }
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const path = new URL(request.url, 'http://fixture.test').pathname;
    if (path === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text); return; }
    if (path.startsWith('/auth/v1/')) {
      response.setHeader('Content-Type', 'application/json');
      if (path.endsWith('/logout')) { response.end('{}'); return; }
      if (path.endsWith('/user')) { response.end(JSON.stringify(user)); return; }
      response.statusCode = throttleLogin ? 429 : failLogin ? 400 : 200;
      response.end(JSON.stringify(throttleLogin ? { code: 'over_request_rate_limit', message: 'Too many requests' } : failLogin ? { code: 'invalid_credentials', message: 'Invalid credentials' } : session())); return;
    }
    if (path === '/server-refresh') {
      const incoming = parseCookieHeader(request.headers.cookie || '');
      const remembered = incoming.find(cookie => cookie.name === REMEMBER_COOKIE)?.value === 'yes';
      const headers = [];
      const client = createServerClient(origin, 'isolated-test-key', { cookies: {
        getAll: () => incoming,
        setAll: (cookies, cacheHeaders) => {
          for (const [name, value] of Object.entries(cacheHeaders)) response.setHeader(name, value);
          cookies.forEach(({ name, value, options }) => headers.push(serializeCookieHeader(name, value, sessionCookieOptions(options, remembered))));
          headers.push(serializeCookieHeader(REMEMBER_COOKIE, remembered ? 'yes' : 'no', rememberCookieOptions(remembered)));
        },
      } });
      const { error } = await client.auth.refreshSession();
      response.statusCode = error ? 500 : 200;
      response.setHeader('Set-Cookie', headers); response.end(error ? 'Refresh failed' : 'OK'); return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const remembered of [false, true]) {
      await page.goto(`${origin}/login`);
      assert.equal(await page.getByRole('checkbox', { name: 'Remember me' }).isChecked(), false);
      await page.getByRole('textbox', { name: 'Email address' }).fill('staff@example.test');
      await page.getByLabel('Password', { exact: true }).fill('isolated-password');
      if (remembered) await page.getByRole('checkbox', { name: 'Remember me' }).check();
      await page.getByRole('button', { name: 'Sign in to operations' }).click();
      await page.waitForURL(`${origin}/account`);
      const verify = async () => {
        const authCookies = (await context.cookies()).filter(cookie => cookie.name.startsWith('sb-'));
        assert.ok(authCookies.length > 0);
        for (const cookie of authCookies) {
          if (!remembered) assert.equal(cookie.expires, -1);
          else assert.ok(Math.abs(cookie.expires - Date.now() / 1000 - REMEMBER_SECONDS) < 90);
        }
        const marker = (await context.cookies()).find(cookie => cookie.name === REMEMBER_COOKIE);
        assert.equal(marker.value, remembered ? 'yes' : 'no');
        assert.equal(marker.expires === -1, !remembered);
      };
      await verify();
      const refresh = await page.request.post(`${origin}/server-refresh`);
      assert.equal(refresh.status(), 200);
      assert.match(refresh.headers()['cache-control'], /private.*no-store/);
      await verify();
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.waitForURL(`${origin}/login`);
      assert.equal((await context.cookies()).filter(cookie => cookie.name.startsWith('sb-')).length, 0);
    }
    failLogin = true;
    await page.getByRole('textbox', { name: 'Email address' }).fill('staff@example.test');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in to operations' }).click();
    await page.getByRole('alert').filter({ hasText: 'could not sign you in' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Sign in to operations' }).isEnabled(), true);
    assert.equal((await context.cookies()).filter(cookie => cookie.name.startsWith('sb-')).length, 0);
    throttleLogin = true;
    await page.getByRole('button', { name: 'Sign in to operations' }).click();
    await page.getByRole('alert').filter({ hasText: 'Too many sign-in attempts' }).waitFor();
    assert.equal((await context.cookies()).filter(cookie => cookie.name.startsWith('sb-')).length, 0);
    throttleLogin = false;
    await page.goto(`${origin}/login`);
    await page.getByRole('textbox', { name: 'Email address' }).fill('staff@example.test');
    await page.getByLabel('Password', { exact: true }).fill('isolated-password');
    await page.evaluate(() => Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() { throw new DOMException('Cookie access blocked', 'SecurityError'); },
      set() { throw new DOMException('Cookie access blocked', 'SecurityError'); },
    }));
    await page.getByRole('button', { name: 'Sign in to operations' }).click();
    await page.getByRole('alert').filter({ hasText: 'could not complete sign-in' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Sign in to operations' }).isEnabled(), true);
    await page.goto(`${origin}/login`);
    await page.screenshot({ path: join(__dirname, 'artifacts/login-remember-me-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: real SDK login cookies, remembered/session modes, server refresh persistence/cache headers, sign-out, failed login and blocked-cookie recovery (isolated Auth server).');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
