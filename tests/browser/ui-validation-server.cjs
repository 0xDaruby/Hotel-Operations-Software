const { readFileSync } = require('node:fs');
const { resolve, join, dirname } = require('node:path');
const { createServer } = require('node:http');

async function startUiFixture() {
  const root = resolve(__dirname, '../..');
  const web = join(root, 'apps/web');
  const { createUiDatabase } = await import('../database/ui-fixture.mjs');
  const database = await createUiDatabase();
  let server;
  try {
    const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('tsx/cli'))] }));
    const bridge = `
      async function request(body) {
        const response = await fetch('/rpc', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,role:window.fixtureRole})});
        if(!response.ok) throw new Error('Fixture transport unavailable');
        return response.json();
      }
      export const createClient=()=>({
        rpc:(name,params)=>request({kind:'rpc',name,params}),
        from:(table)=>{let value;const chain={select:()=>chain,eq:(_,next)=>{value=next;return chain},maybeSingle:()=>request({kind:'lookup',table,value})};return chain;},
        auth:{signOut:async()=>({error:null})}
      });`;
    const bundle = await esbuild.build({
      absWorkingDir: web, entryPoints: [join(__dirname, 'fixtures/ui-validation.jsx')],
      nodePaths: [join(web, 'node_modules')],
      bundle: true, write: false, format: 'iife', jsx: 'automatic', tsconfig: join(web, 'tsconfig.json'),
      plugins: [{ name: 'isolated-ui-boundaries', setup(build) {
        build.onResolve({ filter: /^next\/(navigation|link|cache)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        build.onResolve({ filter: /^@\/lib\/supabase\/(server|client)$/ }, () => ({ path: 'bridge', namespace: 'fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: web, contents:
          args.path === 'bridge' ? bridge :
          args.path === 'next/cache' ? `export const revalidatePath=()=>window.dispatchEvent(new Event('fixture-refresh'));` :
          args.path === 'next/link' ? `import React from 'react';export default function Link({href,children,...props}){const url=new URL(href,location.origin);url.searchParams.set('role',window.fixtureRole);return <a href={url.pathname+url.search} {...props}>{children}</a>}` :
          `const router={refresh:()=>window.fixtureRefresh?.(),replace:path=>location.assign(path),push:path=>location.assign(path)};export const useRouter=()=>router;export const usePathname=()=>location.pathname;`
        }));
      } }],
    });
    const css = readFileSync(join(web, 'src/app/globals.css'), 'utf8');
    const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated UI validation</title><style>${css}\n.fixture-notice{margin:0 0 16px;font-size:12px;color:var(--muted)}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
    const calls = [];
    let fault = null;
    server = createServer(async (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'");
      const url = new URL(request.url, 'http://127.0.0.1');
      try {
        if (request.method === 'POST' && url.pathname === '/rpc') {
          if (request.headers.origin !== `http://${request.headers.host}`) { response.writeHead(403).end(); return; }
          let body = '';
          for await (const chunk of request) { body += chunk; if (body.length > 16384) { response.writeHead(413).end(); return; } }
          const input = JSON.parse(body);
          response.setHeader('Content-Type', 'application/json');
          if (input.kind === 'lookup') { response.end(JSON.stringify(await database.query(input.role, input.table, input.value))); return; }
          calls.push({ name: input.name, role: input.role });
          const currentFault = fault?.name === input.name ? fault : null;
          if (currentFault) fault = null;
          if (currentFault?.gate) await currentFault.gate;
          const result = await database.rpc(input.role, input.name, input.params);
          if (currentFault?.dropAfterCommit) { response.destroy(); return; }
          response.end(JSON.stringify(result));
        } else if (request.method === 'GET' && url.pathname === '/snapshot') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(await database.snapshot()));
        } else if (request.method === 'GET' && url.pathname === '/fixture.js') {
          response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text);
        } else if (request.method === 'GET' && ['/overview','/rooms','/inspections','/maintenance','/stays','/payments'].includes(url.pathname)) {
          response.setHeader('Content-Type', 'text/html'); response.end(html);
        } else { response.writeHead(404).end('Not found'); }
      } catch {
        if (!response.destroyed) response.writeHead(500).end('Isolated fixture request failed');
      }
    });
    await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveReady); });
    return {
      url: `http://127.0.0.1:${server.address().port}`,
      calls,
      snapshot: database.snapshot,
      pauseNextRpc(name) { let release; const gate = new Promise(resolveGate => { release = resolveGate; }); fault = { name, gate }; return release; },
      dropNextResponse(name) { fault = { name, dropAfterCommit: true }; },
      async close() { server.closeAllConnections(); await new Promise(done => server.close(done)); await database.close(); },
    };
  } catch (error) { server?.close(); await database.close(); throw error; }
}
module.exports = { startUiFixture };
if (require.main === module) startUiFixture().then(fixture => {
  console.log(`ISOLATED_UI_URL=${fixture.url}/overview?role=owner`);
  const close = () => { void fixture.close().then(() => process.exit(0)); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}).catch(error => { console.error(error); process.exitCode = 1; });
