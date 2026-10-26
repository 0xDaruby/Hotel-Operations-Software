// Production UI integration against controlled, isolated server-action responses.
// Database invariants and Auth admin choreography are covered by separate suites.
const assert = require('node:assert/strict');
const { startUiFixture } = require('./ui-validation-server.cjs');

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const fixture = await startUiFixture();
  let browser;
  const errors = [], external = [];
  const record = name => console.log(`PASS ${name}`);
  try {
    browser = await chromium.launch({channel:'msedge',headless:true});
    const context = await browser.newContext({viewport:{width:390,height:650},reducedMotion:'reduce'});
    context.setDefaultTimeout(12000);
    await context.route('**/*', route => {
      if(new URL(route.request().url()).origin===fixture.url)return route.continue();
      external.push(route.request().url());return route.abort();
    });
    context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
    const page = await context.newPage();
    const open = async () => {
      await page.goto(`${fixture.url}/staff?role=owner`);
      await page.getByRole('heading',{name:'Add staff account',exact:true}).waitFor();
    };
    const card = name => page.getByRole('article').filter({has:page.getByRole('heading',{name,exact:true})});
    const deleteCalls = () => fixture.calls.filter(call=>call.name==='staff:delete');
    await open();
    assert.equal(await card('Hotel Owner').getByRole('button').count(),0);
    assert.equal(await card('Active Receptionist').getByRole('button',{name:'Deactivate access',exact:true}).count(),1);
    assert.equal(await card('Active Receptionist').getByRole('button',{name:/Delete account/}).count(),0);
    for(const name of ['Inactive Supervisor','Cancelled Setup'])assert.equal(await card(name).getByRole('button',{name:'Delete account',exact:true}).count(),1);
    assert.equal(await card('Pending Setup').getByRole('button',{name:'Cancel setup',exact:true}).count(),1);
    assert.equal(await card('Pending Setup').getByRole('button',{name:'Delete account',exact:true}).count(),0);
    assert.equal(await card('Deletion Pending').getByRole('button',{name:'Activate access',exact:true}).count(),0);
    assert.equal(await card('Deletion Pending').getByRole('button',{name:'Retry delete account',exact:true}).count(),1);
    record('owner, active, pending setup, cancelled and deletion-pending action visibility');

    await card('Inactive Supervisor').getByRole('button',{name:'Delete account',exact:true}).click();
    let dialog = page.getByRole('dialog',{name:"Delete Inactive Supervisor's account?",exact:true});
    await dialog.getByText(/cannot be reactivated/).waitFor();
    await dialog.getByText(/Past payments, inspections, and activity history keep their staff attribution/).waitFor();
    const submit = () => dialog.getByRole('button',{name:'Delete account permanently',exact:true});
    await submit().click();
    assert.equal(deleteCalls().length,0,'empty reason and confirmation cannot submit');
    await dialog.getByRole('textbox',{name:'Reason',exact:true}).fill('Offboarding approved after final shift.');
    await dialog.getByRole('textbox',{name:'Type DELETE to confirm',exact:true}).fill('delete');
    await submit().click();
    assert.equal(deleteCalls().length,0,'confirmation must be exact uppercase DELETE');
    await dialog.getByRole('textbox',{name:'Type DELETE to confirm',exact:true}).fill('DELETE');
    fixture.failNextStaffAction('Auth removal unavailable. Access remains inactive; retry deletion.');
    await submit().click();
    await dialog.getByRole('alert').filter({hasText:'Auth removal unavailable'}).waitFor();
    assert.equal(await dialog.getByRole('textbox',{name:'Reason',exact:true}).inputValue(),'Offboarding approved after final shift.');
    assert.equal(await dialog.getByRole('textbox',{name:'Type DELETE to confirm',exact:true}).inputValue(),'DELETE');
    assert.equal(await page.getByRole('group',{name:'Confirmation',exact:true}).count(),0);
    assert.equal(await card('Inactive Supervisor').count(),1);
    record('irreversible/history warning, exact confirmation validation and retryable failure preserve form without false success');

    const release = fixture.pauseNextStaffAction();
    try {
      await submit().click();
      await dialog.getByRole('button',{name:'Deleting…',exact:true}).waitFor();
      for(const control of await dialog.locator('button,input,textarea').all()) assert.equal(await control.isDisabled(),true);
      await page.keyboard.press('Escape');
      assert.equal(await dialog.isVisible(),true,'Escape must not close a pending delete');
      const count = deleteCalls().length;
      // Adversarial submit event confirms the synchronous duplicate-submit guard,
      // beyond the disabled button seen by ordinary users.
      await dialog.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
      assert.equal(deleteCalls().length,count);
    } finally { release(); }
    await dialog.waitFor({state:'detached'});
    await card('Inactive Supervisor').waitFor({state:'detached'});
    await page.getByRole('group',{name:'Confirmation',exact:true}).getByText(/Past payments, inspections, and activity history keep their staff attribution/).waitFor();
    assert.equal(deleteCalls().length,2,'one failed attempt and one successful retry');
    record('pending controls and Escape locked, duplicate submit suppressed, successful retry removes entry with history confirmation');

    await page.setViewportSize({width:320,height:568});
    await card('Cancelled Setup').getByRole('button',{name:'Delete account',exact:true}).click();
    dialog=page.getByRole('dialog',{name:"Delete Cancelled Setup's account?",exact:true});
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'dialog must not overflow horizontally at 320px');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'page must not overflow horizontally');
    for(const name of ['Cancel','Delete account permanently']) {
      const button=dialog.getByRole('button',{name,exact:true});
      await button.scrollIntoViewIfNeeded();
      const box=await button.boundingBox();
      assert.ok(box && box.x>=0 && box.x+box.width<=320 && box.y>=0 && box.y+box.height<=568,`${name} reachable in narrow viewport`);
    }
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    record('320px browser viewport has no horizontal overflow and both deletion actions remain reachable');

    await page.setViewportSize({width:1280,height:900});
    await card('Active Receptionist').getByRole('button',{name:'Deactivate access',exact:true}).click();
    dialog=page.getByRole('dialog',{name:'Deactivate Active Receptionist?',exact:true});
    await dialog.waitFor();
    const desktopBox=await dialog.boundingBox();
    assert.ok(Math.abs(desktopBox.x+desktopBox.width/2-640)<2,'desktop confirmation is centered');
    await dialog.getByRole('textbox',{name:'Reason',exact:true}).fill('Access review after final shift.');
    fixture.failNextStaffAction('Access update failed. Please retry.');
    await dialog.getByRole('button',{name:'Deactivate access',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:'Access update failed'}).waitFor();
    assert.equal(await dialog.getByRole('textbox',{name:'Reason',exact:true}).inputValue(),'Access review after final shift.');
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'detached'});
    record('shared desktop confirmation stays centered and failed access change keeps its error and reason inside');

    fixture.setStaffAccess('ready',503);
    const accessBefore=fixture.calls.filter(call=>call.name==='staff-access').length;
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(()=>window.fixtureRevision>0);
    await assertEventually(()=>fixture.calls.filter(call=>call.name==='staff-access').length>accessBefore);
    assert.equal(new URL(page.url()).pathname,'/staff');
    assert.equal(await page.evaluate(()=>localStorage.getItem('fixture-sign-out')),null);
    const revision=await page.evaluate(()=>window.fixtureRevision);
    fixture.setStaffAccess('ready');
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(previous=>window.fixtureRevision>previous,revision);
    record('transient access-check 503 preserves workspace/session and ready focus check recovers');
    for(const state of ['inactive','revoked']) {
      if(state==='revoked') {fixture.setStaffAccess('ready');await open();await page.evaluate(()=>localStorage.removeItem('fixture-sign-out'));}
      fixture.setStaffAccess(state);
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await page.waitForURL(`**/login?reason=${state}`);
      assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-sign-out'))),{scope:'local'});
      await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();
    }
    record('inactive and revoked focus checks clear local session and redirect to sign in');
    assert.deepEqual(errors,[],'no browser exceptions');
    assert.deepEqual(external,[],'no external or live service requests');
    console.log('Staff lifecycle browser integration passed (controlled action boundary; browser viewport emulation only).');
  } finally { await browser?.close(); await fixture.close(); }
}
async function assertEventually(predicate) {
  for(let attempt=0;attempt<100;attempt++) {if(predicate())return;await new Promise(done=>setTimeout(done,20));}
  assert.fail('Expected fixture request was not observed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
