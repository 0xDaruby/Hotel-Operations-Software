const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { join, resolve, dirname } = require('node:path');
const { readFileSync } = require('node:fs');

async function run() {
  const root = resolve(__dirname, '../..');
  const web = join(root, 'apps/web');
  const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('tsx/cli'))] }));
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const bundle = await esbuild.build({
    absWorkingDir: web, nodePaths: [join(web, 'node_modules')], bundle: true,
    write: false, format: 'iife', jsx: 'automatic', tsconfig: join(web, 'tsconfig.json'),
    stdin: { resolveDir: web, loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {SetupLinkRedirect} from './src/features/auth/setup-link-redirect';
      import Complete from './src/app/auth/complete/page';
      import {PasswordSetupForm} from './src/features/auth/password-setup-form';
      const path=location.pathname;
      createRoot(document.getElementById('root')).render(<><SetupLinkRedirect />{
        path==='/auth/complete'?<Complete />:path==='/set-password'?<main className="login-page"><section className="login-panel"><div className="login-card"><h1>Set your password</h1><PasswordSetupForm /></div></section></main>:<h1>Existing account workspace</h1>
      }</>);` },
    plugins: [{ name: 'isolated-auth', setup(build) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
      build.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'session', namespace: 'fixture' }));
      build.onResolve({ filter: /^\.\/password-setup-actions$/ }, () => ({ path: 'password', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents:
        args.path === 'navigation' ? `const router={replace:path=>location.assign(path),refresh:()=>{}};export const useRouter=()=>router;` :
        args.path === 'session' ? `export const createClient=()=>({auth:{setSession:async session=>{const r=await fetch('/test-session',{method:'POST',body:JSON.stringify({hasAccess:!!session.access_token,hasRefresh:!!session.refresh_token,hashCleared:!location.hash})});return {error:r.ok?null:new Error('expired')};}}});` :
        `export const finishPasswordSetupAction=async(password,confirmation)=>{const r=await fetch('/test-password',{method:'POST',body:JSON.stringify({matches:password===confirmation,length:password.length})});return r.json()};`
      }));
    } }],
  });
  const css = readFileSync(join(web, 'src/app/globals.css'), 'utf8');
  const calls = [];
  let failSession = false;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text); return; }
    if (request.method === 'POST') {
      let body = ''; for await (const chunk of request) body += chunk;
      const input = JSON.parse(body); calls.push({ path: request.url, ...input });
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/test-session') { response.statusCode = failSession ? 401 : 200; response.end('{}'); return; }
      response.end(JSON.stringify(input.matches ? { ok: true } : { ok: false, error: 'The passwords do not match.' })); return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const failures = []; page.on('pageerror', error => failures.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const [path, type] of [['/auth/complete', 'invite'], ['/login', 'recovery'], ['/overview', 'invite']]) {
      await page.goto(`${origin}${path}#type=${type}&access_token=fixture-access&refresh_token=fixture-refresh`);
      await page.getByRole('heading', { name: 'Set your password' }).waitFor();
      assert.equal(new URL(page.url()).hash, '');
      const session = calls.at(-1); assert.equal(session.path, '/test-session'); assert.equal(session.hashCleared, true);
    }
    await page.getByLabel('New password', { exact: true }).fill('a-long-password');
    await page.getByLabel('Confirm password', { exact: true }).fill('different-password');
    await page.getByRole('button', { name: 'Set password and continue' }).click();
    await page.getByRole('alert').filter({ hasText: 'The passwords do not match.' }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/set-password');
    await page.getByLabel('Confirm password', { exact: true }).fill('a-long-password');
    await page.getByRole('button', { name: 'Set password and continue' }).click();
    await page.waitForURL(`${origin}/`);
    failSession = true;
    await page.goto(`${origin}/auth/complete#type=invite&access_token=expired&refresh_token=expired`);
    await page.getByRole('alert').filter({ hasText: 'could not sign you in' }).waitFor();
    assert.equal(new URL(page.url()).hash, '');
    await page.goto(`${origin}/login#error_code=otp_expired`);
    await page.getByRole('alert').filter({ hasText: 'invalid or expired' }).waitFor();
    assert.deepEqual(failures, []);
    console.log('PASS: invitation/recovery links, signed-in fallback, token removal, password form and expired-link errors (isolated Auth boundary).');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
