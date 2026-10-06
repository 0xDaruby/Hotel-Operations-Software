const {readFileSync}=require('node:fs');
const {resolve,join,dirname}=require('node:path');
const {createServer}=require('node:http');
const assert=require('node:assert/strict');
async function main(){
 const web=resolve(__dirname,'../../apps/web');
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
 const esbuild=require(require.resolve('esbuild',{paths:[dirname(require.resolve('tsx/cli'))]}));
 const result=await esbuild.build({absWorkingDir:web,stdin:{contents:`
 import * as React from 'react';import {createRoot} from 'react-dom/client';
 import {OperationsShell} from './src/components/operations-shell';
 function App(){const [role,setRole]=React.useState('owner');const [path,setPath]=React.useState('/overview');
 window.setRole=setRole;window.path=path;window.navigate=setPath;
 return <OperationsShell profile={{role,displayName:'Demo',userId:'test',hotelId:'test',active:true}} attentionCount={0} inspectionCount={0} maintenanceCount={0}><input aria-label="Keep input"/><div style={{height:1400}}>Demo content</div></OperationsShell>}
 createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:web,sourcefile:'motion-fixture.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',tsconfig:join(web,'tsconfig.json'),plugins:[{name:'fixture',setup(build){
 build.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'fixture'}));
 build.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'supabase',namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:web,loader:'jsx',contents:args.path==='next/link'?`import React from 'react';export default function Link({href,onClick,children,...props}){return <a href={href} {...props} onClick={e=>{e.preventDefault();onClick?.(e);window.navigate(href)}}>{children}</a>}`:args.path==='next/navigation'?`export const usePathname=()=>window.path;export const useRouter=()=>({replace:()=>{},refresh:()=>{}});`:`export const createClient=()=>({auth:{signOut:async()=>{}}});`}));
 }}]});
 const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(join(web,'src/app/globals.css'),'utf8')}</style></head><body><div id="root"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
 const server=createServer((req,res)=>res.end(html));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByLabel('Keep input').fill('preserved');
 async function gesture(x,y,endX,endY,cancel=false){await page.evaluate(({x,y,endX,endY,cancel})=>{
 const target=document.elementFromPoint(x,y)||document.body;
 const emit=(type,cx,cy)=>{const touch=new Touch({identifier:1,target,clientX:cx,clientY:cy});target.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchstart'||type==='touchmove'?[touch]:[],changedTouches:[touch]}));};
 emit('touchstart',x,y);emit('touchmove',endX,endY);}, {x,y,endX,endY,cancel});
 await page.waitForTimeout(30);
 const during=await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).transform);
 await page.evaluate(cancel=>document.dispatchEvent(new TouchEvent(cancel?'touchcancel':'touchend',{bubbles:true})),cancel);
 await page.waitForTimeout(360);return during;}
 assert.equal(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).visibility),'hidden');
 await gesture(15,350,18,500);assert.equal(await page.locator('.sidebar-open').count(),0,'vertical gesture does not open');
 await gesture(100,350,270,350);assert.equal(await page.locator('.sidebar-open').count(),0,'middle swipe does not open');
 const during=await gesture(15,350,190,350);assert.notEqual(during,'none','drawer tracks thumb');assert.equal(await page.locator('.sidebar-open').count(),1,'owner edge swipe opens');
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
 await gesture(220,350,20,350);assert.equal(await page.locator('.sidebar-open').count(),0,'left swipe closes');
 await gesture(15,350,190,350,true);assert.equal(await page.locator('.sidebar-open').count(),0,'cancel restores state');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.keyboard.press('Escape');await page.waitForTimeout(360);assert.equal(await page.locator('.sidebar-open').count(),0,'Escape closes');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.setViewportSize({width:1000,height:844});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.body.style.overflow),'','resize unlocks scrolling');
 await gesture(15,350,190,350);assert.equal(await page.locator('.sidebar-open').count(),0,'desktop swipe disabled');
 await page.setViewportSize({width:390,height:844});
 for(const role of ['receptionist','supervisor']){await page.evaluate(role=>window.setRole(role),role);await page.waitForTimeout(50);await gesture(15,350,190,350);assert.equal(await page.locator('.sidebar-open').count(),0,`${role} swipe disabled`);}
 await page.evaluate(()=>window.setRole('owner'));await page.waitForTimeout(50);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.page-motion').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion honored');
 assert.equal(await page.getByLabel('Keep input').inputValue(),'preserved','gesture preserves form');assert.deepEqual(errors,[]);
 console.log('PASS Owner mobile drag/open/close/cancel, vertical and middle swipe exclusions, other roles and desktop excluded, Escape, resize scroll recovery, reduced motion, preserved input. Synthetic touch events in Edge; physical phone gesture remains unverified.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
