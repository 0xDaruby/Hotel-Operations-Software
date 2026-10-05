// Browser integration with mocked server actions; never sends email or writes
// live data. An optional BASE_URL also checks the actual production login.
const { readFileSync } = require('node:fs');
const { resolve, dirname, join } = require('node:path');
const { createServer } = require('node:http');
const assert = require('node:assert/strict');

async function main() {
  const root = resolve(__dirname, '../..');
  const web = join(root, 'apps/web');
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('tsx/cli'))] }));
  const result = await esbuild.build({
    absWorkingDir: web,
    stdin: { contents: `
      import * as React from 'react';
      import {createRoot} from 'react-dom/client';
      import {StaffWorkspace} from './src/features/staff/staff-workspace';
      import {OperationsRefresh} from './src/components/operations-refresh';
      const initial = [
        {userId:'owner',displayName:'Test Owner',role:'owner',active:true,setupPending:false,mustChangePassword:false,email:'owner@example.invalid',hotelId:'test'},
        {userId:'staff',displayName:'Test Reception',role:'receptionist',active:true,setupPending:false,mustChangePassword:true,email:'staff@example.invalid',hotelId:'test'},
        {userId:'pending',displayName:'Test Pending',role:'supervisor',active:false,setupPending:true,mustChangePassword:true,email:'pending@example.invalid',hotelId:'test'}
      ];
      const router={refresh:()=>window.__refresh()};
      window.__router=router;window.__refreshCount=0;window.__actions=[];
      function App(){
        const [revision,setRevision]=React.useState(0);const [staff,setStaff]=React.useState(initial);const [available,setAvailable]=React.useState(true);
        window.__setManagement=setAvailable;
        window.__refresh=()=>{window.__refreshCount++;setRevision(value=>value+1);};
        window.__setActive=(input)=>{window.__actions.push(input);setStaff(rows=>rows.map(row=>row.userId===input.userId?{...row,active:input.active}:row));return Promise.resolve({ok:true,message:'Access updated.'});};
        window.__cancel=(input)=>{setStaff(rows=>rows.map(row=>row.userId===input.userId?{...row,setupPending:false,setupCancelled:true}:row));return Promise.resolve({ok:true,message:'Setup cancelled.'});};
        return <main style={{padding:20,maxWidth:960,margin:'auto'}}><OperationsRefresh/><section className="staff-page"><h1>Staff browser fixture</h1><p data-testid="revision">Revision {revision}</p><StaffWorkspace staff={staff} managementAvailable={available}/></section></main>;
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `, resolveDir: web, sourcefile: 'browser-fixture.tsx', loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', tsconfig: join(web, 'tsconfig.json'),
    plugins: [{ name: 'isolated-fixture', setup(build) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
      build.onResolve({ filter: /^\.\/actions$/ }, (args) => args.importer.replaceAll('\\', '/').includes('features/staff') ? ({ path: 'actions', namespace: 'fixture' }) : undefined);
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: args.path === 'navigation'
        ? 'export const useRouter=()=>window.__router;'
        : `export const createStaffAction=async()=>({ok:false,error:'Fixture: no account created or email sent.'});export const retryStaffSetupAction=async()=>({ok:true,message:'Fixture retry'});export const setStaffActiveAction=(input)=>window.__setActive(input);export const cancelStaffSetupAction=(input)=>window.__cancel(input);` }));
    } }],
  });
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(join(web,'src/app/globals.css'),'utf8')}</style></head><body><div id="root"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
  const server = createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.end(html);});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors=[];page.on('pageerror', error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByLabel('Full name').fill('Unsaved staff name');
    await page.waitForFunction(()=>window.__refreshCount>=2,{},{timeout:15000});
    assert.equal(await page.getByLabel('Full name').inputValue(),'Unsaved staff name','polling must preserve unsaved input');
    await page.getByRole('button',{name:'Deactivate access'}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    assert.equal(await dialog.evaluate(element=>element.contains(document.activeElement)),true,'confirmation receives focus');
    await dialog.getByLabel('Reason').fill('Browser fixture offboarding');
    await dialog.getByRole('button',{name:'Confirm deactivation'}).click();
    await page.getByRole('button',{name:'Activate access'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__actions[0].reason),'Browser fixture offboarding');
    await page.getByRole('button',{name:'Cancel setup',exact:true}).click();
    await page.getByRole('dialog').getByLabel('Reason').fill('Browser fixture cancellation');
    await page.getByRole('dialog').getByRole('button',{name:'Confirm setup cancellation'}).click();
    await page.getByText('Setup cancelled',{exact:true}).first().waitFor();
    await page.evaluate(()=>window.__setManagement(false));
    await page.getByText(/Staff account management is not available yet/).waitFor();
    assert.equal(await page.getByLabel('Full name').isDisabled(),true,'pre-migration controls are disabled');
    assert.equal(await page.getByRole('button',{name:'Activate access'}).count(),0,'no activation controls before migration');
    for(const width of [390,768,1440]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`no overflow at ${width}`);
    }
    assert.deepEqual(errors,[],'no component browser exceptions');
    console.log('PASS browser components: repeated refresh, unsaved input, focused staff confirmation, activation, pending cancellation, 390/768/1440 layouts');
    await context.close();
    if(process.env.BASE_URL) {
      const actual = await browser.newContext({viewport:{width:390,height:844}});
      const login=await actual.newPage();
      await login.goto(`${process.env.BASE_URL}/staff`);
      await login.waitForURL('**/login?next=*');
      await login.getByLabel('Email address').waitFor();
      assert.equal(await login.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'production login mobile overflow');
      await login.goto(`${process.env.BASE_URL}/auth/confirm`);
      const invalidLink = login.getByText(/This setup link is invalid or expired/);
      await invalidLink.waitFor();
      assert.match(await invalidLink.innerText(),/invalid|expired/i);
      console.log('PASS actual production server: signed-out staff redirect, mobile login, invalid setup callback');
      await actual.close();
    }
    console.log('LIMIT: component actions are mocks; production authenticated flows and real email delivery require live migration approval and server configuration.');
  } finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
