const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { startUiFixture } = require('./ui-validation-server.cjs');
const { renderedContrastAudit } = require('./contrast.cjs');

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const artifacts = resolve(__dirname, 'artifacts/ui-validation');
  await mkdir(artifacts, {recursive:true});
  const fixture = await startUiFixture();
  let browser, context;
  const results=[], audits=[], errors=[], external=[];
  const record=(name,details)=>{results.push({name,status:'passed',details});console.log(`PASS ${name}`);};
  // The room number is text on the paragraph itself, not a child element.
  const roomCard=(page,type,room)=>page.locator(type).filter({has:page.locator('.stay-room').filter({hasText:new RegExp(`^${room}$`)})});
  async function open(page,path,role='supervisor') {
    await page.goto(`${fixture.url}${path}?role=${role}`);
    await page.getByText('Isolated validation · synthetic hotel · no live data',{exact:true}).waitFor({timeout:30000});
  }
  async function inspectedDialog(page,room) {
    await roomCard(page,'.inspection-card',room).getByRole('button',{name:'Inspect room',exact:true}).click();
    return page.getByRole('dialog',{name:`Inspect room ${room}`,exact:true});
  }
  async function closeDirty(page,dialog) {
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    const discard=page.getByRole('alertdialog');
    await discard.getByRole('button',{name:'Discard changes',exact:true}).click();
    await dialog.waitFor({state:'detached'});
  }
  try {
    browser = await chromium.launch({channel:'msedge',headless:true});
    context=await browser.newContext({viewport:{width:390,height:650},reducedMotion:'reduce'});
    context.setDefaultTimeout(12000);
    await context.route('**/*',route=>{
      if (new URL(route.request().url()).origin===fixture.url) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
    const page=await context.newPage();
    const original=await fixture.snapshot();
    assert.equal(original.inspections.length,10);assert.equal(original.issues.length,7);
    await open(page,'/inspections');
    assert.equal(await page.locator('.inspection-card').count(),10);
    let dialog=await inspectedDialog(page,'101');
    assert.equal(await dialog.evaluate(el=>el.matches(':modal')&&el.contains(document.activeElement)),true);
    for(let i=0;i<12;i++) {
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)||document.activeElement===document.body),true,'Tab must not focus underlying page controls; native browser chrome is allowed');
    }
    assert.equal(await page.locator('.topbar .profile-trigger').evaluate(el=>{el.focus();return document.activeElement===el;}),false,'native modality makes background controls inert');
    await dialog.getByRole('combobox',{name:'Outcome',exact:true}).selectOption('attention');
    await dialog.getByRole('checkbox').check();
    assert.equal(await dialog.getByRole('button',{name:'Save outcome',exact:true}).isDisabled(),true);
    await dialog.getByRole('textbox',{name:/^Reason/}).fill('Keep this inspection draft through a failed request.');
    await page.keyboard.press('Escape');
    await page.getByRole('alertdialog').getByRole('button',{name:'Keep editing',exact:true}).click();
    assert.equal(await dialog.getByRole('textbox',{name:/^Reason/}).inputValue(),'Keep this inspection draft through a failed request.');
    record('inspection validation, keyboard containment and dirty-dismiss recovery');

    const revision=await page.evaluate(()=>window.fixtureRevision);
    await context.setOffline(true);
    await dialog.getByRole('button',{name:'Save outcome',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:'could not confirm'}).waitFor();
    audits.push({path:'inspection offline error dialog',...await page.evaluate(renderedContrastAudit)});
    assert.equal(await page.getByRole('group',{name:'Confirmation',exact:true}).count(),0);
    assert.deepEqual((await fixture.snapshot()).counts,original.counts);
    await context.setOffline(false);
    await page.waitForFunction(previous=>window.fixtureRevision>previous,revision);
    assert.equal(await dialog.getByRole('textbox',{name:/^Reason/}).inputValue(),'Keep this inspection draft through a failed request.');
    await closeDirty(page,dialog);
    record('offline save preserves draft, creates no false success and refreshes on reconnect');

    dialog=await inspectedDialog(page,'101');
    await dialog.getByRole('checkbox').check();
    const beforeCalls=fixture.calls.length;
    const release=fixture.pauseNextRpc('submit_inspection');
    try {
      await dialog.getByRole('button',{name:'Save outcome',exact:true}).click();
      await dialog.locator('form[aria-busy=true]').waitFor();
      assert.equal(await dialog.getByRole('combobox',{name:'Outcome',exact:true}).isDisabled(),true);
      await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);
      await dialog.locator('form').evaluate(el=>el.requestSubmit());
    } finally {release();}
    await dialog.waitFor({state:'detached'});
    assert.equal(fixture.calls.length-beforeCalls,1);
    await page.getByRole('heading',{name:'9 open inspections',exact:true}).waitFor();
    assert.equal((await fixture.snapshot()).issues.length,7,'inspection approval must not resolve maintenance');
    record('pending inspection blocks duplicate submit and dismissal; approval preserves maintenance blocks');

    const second=await context.newPage();
    await open(page,'/inspections');await open(second,'/inspections','secondSupervisor');
    const a=await inspectedDialog(page,'102'), b=await inspectedDialog(second,'102');
    await a.getByRole('combobox',{name:'Outcome',exact:true}).selectOption('access_blocked');
    await a.getByRole('textbox',{name:/^Reason/}).fill('Guest requested the next inspection round.');await a.getByRole('checkbox').check();
    await b.getByRole('button',{name:/Add findings/}).click();
    await b.getByRole('textbox',{name:/^Findings/}).fill('Second supervisor draft.');await b.getByRole('checkbox').check();
    await a.getByRole('button',{name:'Save outcome',exact:true}).click();await a.waitFor({state:'detached'});
    const afterFirst=(await fixture.snapshot()).counts;
    await b.getByRole('button',{name:'Save outcome',exact:true}).click();
    await b.getByRole('alert').filter({hasText:/updated|changed/}).waitFor();
    assert.equal(await b.getByRole('textbox',{name:/^Findings/}).inputValue(),'Second supervisor draft.');
    assert.deepEqual((await fixture.snapshot()).counts,afterFirst);
    await closeDirty(second,b);
    const fresh=await inspectedDialog(second,'102');
    await fresh.getByRole('checkbox').check();await fresh.getByRole('button',{name:'Save outcome',exact:true}).click();await fresh.waitFor({state:'detached'});
    record('two supervisor sessions reject stale inspection, preserve draft and reopen current version');

    await open(page,'/maintenance','owner');await open(second,'/maintenance','supervisor');
    const issue=roomCard(page,'.maintenance-card','102').filter({hasText:'Furniture'});
    await issue.getByRole('button',{name:'Record resolution',exact:true}).click();
    await roomCard(second,'.maintenance-card','102').filter({hasText:'Furniture'}).getByRole('button',{name:'Record resolution',exact:true}).click();
    const resolveA=page.getByRole('dialog'),resolveB=second.getByRole('dialog');
    await resolveA.getByRole('textbox',{name:'Resolution detail',exact:true}).fill('Replaced the damaged chair.');
    await resolveB.getByRole('textbox',{name:'Resolution detail',exact:true}).fill('Second staff resolution draft.');
    await resolveA.getByRole('button',{name:'Save resolution',exact:true}).click();await resolveA.waitFor({state:'detached'});
    const afterResolve=(await fixture.snapshot()).counts;
    await resolveB.getByRole('button',{name:'Save resolution',exact:true}).click();
    await resolveB.getByRole('status').filter({hasText:'Resolved by'}).waitFor();
    audits.push({path:'maintenance already-resolved dialog',...await second.evaluate(renderedContrastAudit)});
    assert.equal(await resolveB.getByRole('button',{name:'Save resolution',exact:true}).count(),0);
    assert.deepEqual((await fixture.snapshot()).counts,afterResolve);
    assert.equal((await fixture.snapshot()).issues.filter(i=>i.room_number==='102').length,1);
    await second.screenshot({path:join(artifacts,'already-resolved-mobile.png')});
    await resolveB.getByRole('button',{name:'Close',exact:true}).last().click();
    record('maintenance resolution is independent and a second session sees recorded resolution without duplicate audit');

    await open(page,'/maintenance','supervisor');
    const form=page.locator('form.arrival-form');
    const detail=form.getByRole('textbox',{name:'Detail (optional)',exact:true});
    const quick=form.getByRole('group',{name:'Quick comments for Air conditioning',exact:true});
    const callsBeforeSuggestions=fixture.calls.length;
    await quick.getByRole('button',{name:'AC is not cooling.',exact:true}).focus();
    await page.keyboard.press('Enter');
    assert.equal(await detail.inputValue(),'AC is not cooling.');
    assert.equal(await detail.evaluate(el=>el===document.activeElement),true,'focus follows insertion to the editable comment');
    await form.getByRole('combobox',{name:'Issue type',exact:true}).selectOption('plumbing');
    assert.equal(await detail.inputValue(),'','an untouched AC suggestion must not carry into Plumbing');
    assert.equal(await form.getByRole('button',{name:/AC/}).count(),0);
    await form.getByRole('button',{name:'Tap is leaking.',exact:true}).click();
    await detail.fill('Tap is leaking beside the basin.');
    assert.equal(await form.getByRole('group',{name:/Quick comments/}).count(),0,'suggestions cannot overwrite an existing note');
    await form.getByRole('combobox',{name:'Issue type',exact:true}).selectOption('electrical');
    assert.equal(await detail.inputValue(),'Tap is leaking beside the basin.');
    await form.getByRole('status').filter({hasText:'Your comment was kept.'}).waitFor();
    await detail.fill('');
    assert.equal(await form.getByRole('button',{name:'Light is not working.',exact:true}).isVisible(),true);
    assert.equal(await form.getByRole('button',{name:'Tap is leaking.',exact:true}).count(),0);
    await form.getByRole('combobox',{name:'Issue type',exact:true}).selectOption('furniture');
    assert.equal(await form.getByRole('button',{name:'Bed frame is loose.',exact:true}).isVisible(),true);
    const plumbingIssue=roomCard(page,'.maintenance-card','101').filter({hasText:'Plumbing'});
    await plumbingIssue.getByRole('button',{name:'Record resolution',exact:true}).click();
    const quickResolution=page.getByRole('dialog',{name:'Resolve room 101 issue',exact:true});
    assert.equal(await quickResolution.getByRole('button',{name:/AC/}).count(),0);
    await quickResolution.getByRole('button',{name:'Leaking tap repaired.',exact:true}).click();
    assert.equal(await quickResolution.getByRole('textbox',{name:'Resolution detail',exact:true}).inputValue(),'Leaking tap repaired.');
    assert.equal(fixture.calls.length,callsBeforeSuggestions,'choosing comments must never save or resolve an issue');
    await page.screenshot({path:join(artifacts,'quick-resolution-mobile.png')});
    await closeDirty(page,quickResolution);
    record('maintenance quick comments follow type, preserve edits and require explicit save');
    await form.getByRole('combobox',{name:'Room',exact:true}).selectOption({label:'118'});
    await form.getByRole('combobox',{name:'Issue type',exact:true}).selectOption('other');
    assert.equal(await form.getByRole('group',{name:/Quick comments/}).count(),0,'Other needs a specific free-text explanation');
    assert.equal(await form.getByRole('button',{name:'Report issue',exact:true}).isDisabled(),true);
    await form.getByRole('textbox',{name:'Detail',exact:true}).fill('A detailed fixture report that must survive a failed save.');
    await context.setOffline(true);await form.getByRole('button',{name:'Report issue',exact:true}).click();
    await form.getByRole('alert').waitFor();assert.equal(await form.getByRole('textbox',{name:'Detail',exact:true}).inputValue(),'A detailed fixture report that must survive a failed save.');
    await context.setOffline(false);
    const releaseReport=fixture.pauseNextRpc('report_maintenance_issue');
    try {
      await form.getByRole('button',{name:'Report issue',exact:true}).click();
      await form.getByRole('button',{name:'Reporting…',exact:true}).waitFor();
      assert.equal(await form.getByRole('textbox',{name:'Detail',exact:true}).isDisabled(),true,'pending report must protect the submitted draft');
    } finally {releaseReport();}
    await form.getByRole('button',{name:'Report issue',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('form.arrival-form textarea')?.value==='');
    record('maintenance required detail, offline recovery and protected pending form');

    await open(page,'/stays','receptionist');
    const arrival=page.locator('#arrival-form');
    await arrival.getByRole('combobox',{name:'Ready room',exact:true}).selectOption('30000000-0000-0000-0000-000000000017');
    await arrival.getByRole('textbox',{name:'Guest name',exact:true}).fill('A very long synthetic guest name for arrival recovery validation');
    await arrival.getByRole('checkbox').check();
    const releaseArrival=fixture.pauseNextRpc('record_arrival');
    try {
      await arrival.getByRole('button',{name:'Record arrival',exact:true}).click();
      await arrival.getByRole('button',{name:'Recording…',exact:true}).waitFor();
      assert.equal(await arrival.getByRole('textbox',{name:'Guest name',exact:true}).isDisabled(),true,'pending arrival must freeze submitted input');
    } finally {releaseArrival();}
    await page.waitForFunction(()=>document.querySelector('#arrival-form input[required]')?.value==='');
    assert.equal((await fixture.snapshot()).counts.payments,1);
    record('arrival pending state freezes submitted input and records one payment');

    await open(page,'/stays','receptionist');
    await arrival.getByRole('combobox',{name:'Ready room',exact:true}).selectOption('30000000-0000-0000-0000-000000000016');await arrival.getByRole('textbox',{name:'Guest name',exact:true}).fill('Response loss test guest');await arrival.getByRole('checkbox').check();
    fixture.dropNextResponse('record_arrival');
    await arrival.getByRole('button',{name:'Record arrival',exact:true}).click();await arrival.getByRole('alert').waitFor();
    assert.equal(await arrival.getByRole('textbox',{name:'Guest name',exact:true}).inputValue(),'Response loss test guest');
    const committed=(await fixture.snapshot()).counts;
    assert.equal(committed.payments,2);
    await arrival.getByRole('button',{name:'Record arrival',exact:true}).click();
    await arrival.getByRole('alert').filter({hasText:/not ready|occupied/}).waitFor();
    assert.deepEqual((await fixture.snapshot()).counts,committed,'retry after response loss must not duplicate payment or activity');
    record('lost response after database commit preserves draft; retry cannot duplicate stay/payment');

    for(const path of ['/overview','/rooms','/inspections','/maintenance','/payments','/stays']) {
      await open(page,path,path==='/overview'||path==='/payments'?'owner':'supervisor');
      for(const width of [390,768,1440]) {
        await page.setViewportSize({width,height:width===390?650:900});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${path} overflow at ${width}`);
      }
      audits.push({path,...await page.evaluate(renderedContrastAudit)});
    }
    await open(page,'/overview','owner');await page.setViewportSize({width:390,height:650});
    const expected=(await fixture.snapshot()).inspections.length+(await fixture.snapshot()).issues.length;
    assert.equal(await page.locator('.owner-attention-row:visible').count(),expected);
    await page.getByRole('button',{name:/Executive garden annex/}).click();
    assert.equal(await page.locator('.owner-room-tile:visible').count(),18);
    await page.screenshot({path:join(artifacts,'mixed-attention-mobile.png'),fullPage:true});
    record('all mixed attention items and expanded room facts remain visible on mobile');

    for(const path of ['/overview','/rooms','/inspections','/maintenance','/payments']) {
      await open(page,path,path==='/overview'||path==='/payments'?'owner':'supervisor');
      await page.setViewportSize({width:1280,height:900});
      await page.addStyleTag({content:'html { zoom: 2; }'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${path} 200% content-scale overflow`);
      if(path==='/maintenance') {
        await page.locator('.maintenance-card').first().getByRole('button',{name:'Record resolution',exact:true}).click();
        const sheet=page.getByRole('dialog');await sheet.getByRole('textbox',{name:'Resolution detail',exact:true}).fill('Zoomed resolution draft');
        const rect=await sheet.getByRole('button',{name:'Save resolution',exact:true}).boundingBox();
        assert.ok(rect&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=1280&&rect.y+rect.height<=900,'zoomed save action must remain within viewport');
        await page.screenshot({path:join(artifacts,'resolution-content-scale-200.png')});
      }
    }
    record('200% CSS content scaling: populated pages reflow and resolution action remains reachable');
    const textFailures=audits.flatMap(a=>a.text.filter(x=>!x.pass).map(x=>({path:a.path,...x})));
    const controlFailures=audits.flatMap(a=>a.controls.filter(x=>!x.pass).map(x=>({path:a.path,...x})));
    await writeFile(join(artifacts,'contrast.json'),JSON.stringify({audits,textFailures,controlFailures},null,2));
    assert.deepEqual(textFailures,[],'rendered text contrast failures');
    assert.deepEqual(controlFailures,[],'input boundary contrast failures');
    record('rendered solid-colour text and input-boundary contrast');
    assert.deepEqual(external,[],'fixture must never call an external service');assert.deepEqual(errors,[],'browser runtime errors');
    await context.close();
  } catch(error) {
    results.push({name:'validation failure',status:'failed',details:error.stack});
    for(const [index,p] of (context?.pages()||[]).entries()) {
      await p.screenshot({path:join(artifacts,`failure-${index}.png`)}).catch(()=>{});
      await writeFile(join(artifacts,`failure-${index}.txt`),await p.locator('body').ariaSnapshot().catch(()=> 'Snapshot unavailable'));
    }
    console.error(error);process.exitCode=1;
  } finally {
    await writeFile(join(artifacts,'results.json'),JSON.stringify({results,errors,external,limits:['Disposable PostgreSQL engine; Supabase and Next transport boundaries replaced by loopback adapters.','CSS content scaling is not browser-chrome zoom or physical-phone/software-keyboard testing.','Contrast checks cover rendered solid text and input borders, not all graphics or assistive technology.']},null,2));
    await browser?.close();await fixture.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
