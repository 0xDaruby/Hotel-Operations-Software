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
        auth:{signOut:async(options)=>{localStorage.setItem('fixture-sign-out',JSON.stringify(options));return window.fixtureSignOut ? window.fixtureSignOut(options) : ({error:null});}}
      });`;
    // Only the server-action boundary is simulated. The rendered workspace and
    // session refresh components are production imports, with no live Auth API.
    const staffBridge = `async function action(name,input){const response=await fetch('/staff-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,input})});if(!response.ok)throw Error('Fixture transport unavailable');const result=await response.json();if(result.ok)await window.fixtureRefresh?.();return result;}
      export const deleteStaffAccountAction=input=>action('delete',input);
      export const setStaffActiveAction=input=>action('set-active',input);
      export const cancelStaffSetupAction=input=>action('cancel-setup',input);
      export const createStaffAction=input=>action('create',input);
      export const retryStaffSetupAction=input=>action('retry-setup',input);`;
    const bundle = await esbuild.build({
      absWorkingDir: web, entryPoints: [join(__dirname, 'fixtures/ui-validation.jsx')],
      nodePaths: [join(web, 'node_modules')],
      bundle: true, write: false, format: 'iife', jsx: 'automatic', tsconfig: join(web, 'tsconfig.json'),
      plugins: [{ name: 'isolated-ui-boundaries', setup(build) {
        build.onResolve({ filter: /^(\.\/actions|@\/features\/staff\/actions)$/ }, args => args.importer.includes('staff-workspace') ? ({ path: 'staff-bridge', namespace: 'fixture' }) : undefined);
        build.onResolve({ filter: /^next\/(navigation|link|cache)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        build.onResolve({ filter: /^@\/lib\/supabase\/(server|client)$/ }, () => ({ path: 'bridge', namespace: 'fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: web, contents:
          args.path === 'staff-bridge' ? staffBridge : args.path === 'bridge' ? bridge :
          args.path === 'next/cache' ? `export const revalidatePath=()=>window.dispatchEvent(new Event('fixture-refresh'));` :
          args.path === 'next/link' ? `import React from 'react';export default function Link({href,children,...props}){const url=new URL(href,location.origin);url.searchParams.set('role',window.fixtureRole);return <a href={url.pathname+url.search} {...props}>{children}</a>}` :
          `const router={refresh:()=>window.fixtureRefresh?.(),replace:path=>location.assign(path),push:path=>location.assign(path)};export const useRouter=()=>router;export const usePathname=()=>location.pathname;`
        }));
      } }],
    });
    const css = readFileSync(join(web, 'src/app/globals.css'), 'utf8');
    const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated UI validation</title><style>${css}\n.fixture-notice{margin:0 0 16px;font-size:12px;color:var(--muted)}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
    const calls = [];
    const staff = [
      ['owner', 'Hotel Owner', 'owner', true, false, false, false],
      ['active', 'Active Receptionist', 'receptionist', true, false, false, false],
      ['inactive', 'Inactive Supervisor', 'supervisor', false, false, false, false],
      ['pending', 'Pending Setup', 'receptionist', false, true, false, false],
      ['cancelled', 'Cancelled Setup', 'receptionist', false, false, true, false],
      ['deleting', 'Deletion Pending', 'supervisor', false, false, false, true],
    ].map(([userId,displayName,role,active,setupPending,setupCancelled,deletionPending])=>({userId,displayName,role,active,setupPending,setupCancelled,deletionPending,email:`${userId}@example.test`,hotelId:'isolated',mustChangePassword:setupPending}));
    let staffFault = null;
    let access = { status: 'ready', httpStatus: 200 };
    let fault = null;
    server = createServer(async (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'");
      const url = new URL(request.url, 'http://127.0.0.1');
      try {
        if (request.method === 'POST' && url.pathname === '/staff-action') {
          if (request.headers.origin !== `http://${request.headers.host}`) { response.writeHead(403).end(); return; }
          let body=''; for await(const chunk of request){body+=chunk;if(body.length>16384){response.writeHead(413).end();return;}}
          const {name,input}=JSON.parse(body);
          calls.push({name:`staff:${name}`,input});
          const currentFault=staffFault; staffFault=null;
          if(currentFault?.gate) await currentFault.gate;
          response.setHeader('Content-Type','application/json');
          if(currentFault?.error){response.end(JSON.stringify({ok:false,error:currentFault.error}));return;}
          const member=staff.find(row=>row.userId===input.userId);
          if(name==='delete' && member && !member.active && !member.setupPending && member.role!=='owner' && String(input.reason).trim() && input.confirmation==='DELETE') {
            staff.splice(staff.indexOf(member),1);
            response.end(JSON.stringify({ok:true,message:'Staff account deleted. Past payments, inspections, and activity history keep their staff attribution.'}));return;
          }
          response.end(JSON.stringify({ok:false,error:'Invalid isolated lifecycle request.'}));
        } else if (request.method === 'POST' && url.pathname === '/rpc') {
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
        } else if (request.method === 'GET' && url.pathname === '/auth/staff-access') {
          calls.push({name:'staff-access',status:access.status});
          response.setHeader('Content-Type', 'application/json'); response.writeHead(access.httpStatus).end(JSON.stringify({ status: access.status }));
        } else if (request.method === 'GET' && url.pathname === '/snapshot') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({...await database.snapshot(),staff}));
        } else if (request.method === 'GET' && url.pathname === '/fixture.js') {
          response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text);
        } else if (request.method === 'GET' && url.pathname === '/login') {
          response.setHeader('Content-Type','text/html'); response.end('<!doctype html><title>Sign in</title><h1>Sign in</h1>');
        } else if (request.method === 'GET' && ['/overview','/rooms','/inspections','/maintenance','/stays','/payments','/staff'].includes(url.pathname)) {
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
      setStaffAccess(status, httpStatus = 200) { access = {status,httpStatus}; },
      failNextStaffAction(error) { staffFault = {error}; },
      pauseNextStaffAction() { let release; const gate=new Promise(done=>{release=done;}); staffFault={gate};return release; },
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
