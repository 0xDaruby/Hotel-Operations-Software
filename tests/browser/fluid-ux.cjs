const assert = require('node:assert/strict');
const { startUiFixture } = require('./ui-validation-server.cjs');

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const fixture = await startUiFixture();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(`${fixture.url}/overview?role=owner`);
    await page.getByRole('button', { name: 'Open menu', exact: true }).waitFor();
    assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el).animationName), 'none');
    // Deterministic touch sequences exercise the production gesture handlers.
    // Physical Safari scrolling and operating-system edge gestures remain a device check.
    await page.evaluate(() => {
      window.sendDrawerTouch = (type, x, y) => {
        if (type === 'touchstart') window.drawerTouchTarget = document.elementFromPoint(x, y);
        const target = window.drawerTouchTarget;
        const touch = new Touch({ identifier: 1, target, clientX: x, clientY: y });
        const touches = ['touchend', 'touchcancel'].includes(type) ? [] : [touch];
        target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches, changedTouches: [touch] }));
      };
    });
    const touch = (type, x, y) => page.evaluate(([t, a, b]) => window.sendDrawerTouch(t, a, b), [type, x, y]);
    const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const left = () => page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().left);
    await touch('touchstart', 10, 300);
    await touch('touchmove', 90, 300);
    await frame();
    const first = await left();
    await touch('touchmove', 140, 300);
    await frame();
    assert.ok(Math.abs((await left()) - first - 50) < 2, 'drawer tracks finger distance one-to-one');
    await touch('touchend', 140, 300);
    await page.waitForFunction(() => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().left) < 1);

    // Release followed by a new drag before the release rAF must keep tracking.
    await page.evaluate(() => {
      window.sendDrawerTouch('touchstart', 200, 300);
      window.sendDrawerTouch('touchmove', 180, 300);
      window.sendDrawerTouch('touchend', 180, 300);
      window.sendDrawerTouch('touchstart', 180, 300);
      window.sendDrawerTouch('touchmove', 120, 300);
    });
    await frame();
    assert.ok((await left()) < -50, 'rapidly resumed drag paints after cancelled release frame');
    await touch('touchcancel', 120, 300);
    await page.waitForFunction(() => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().left) < 1);
    // Interrupt a closing transition and reverse from the position on screen.
    await page.locator('.sidebar').getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForFunction(() => {
      const x = document.querySelector('.sidebar').getBoundingClientRect().left;
      return x < -10 && x > -290;
    });
    const discontinuity = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar');
      const before = sidebar.getBoundingClientRect().left;
      window.sendDrawerTouch('touchstart', 10, 300);
      return Math.abs(sidebar.getBoundingClientRect().left - before);
    });
    assert.ok(discontinuity < 2, 'interrupting a transition does not jump');
    await touch('touchmove', 160, 300);
    await touch('touchend', 160, 300);
    await page.waitForFunction(() => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().left) < 1);

    // An intentional new click is usable immediately after the closing swipe.
    await touch('touchstart', 270, 300);
    await touch('touchmove', 15, 300);
    await touch('touchend', 15, 300);
    await page.getByRole('button', { name: /^Staff account:/ }).click();
    await page.getByRole('dialog', { name: 'Staff account', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().left < -300);
    // Vertical scrolling intent leaves the navigation closed.
    await touch('touchstart', 10, 300);
    await touch('touchmove', 12, 340);
    await touch('touchend', 12, 340);
    await frame();
    assert.ok((await left()) < -300);
    console.log('PASS direct tracking, rapid re-grab, transition reversal, cancel, vertical intent, immediate next action');

    await page.goto(`${fixture.url}/rooms?role=receptionist`);
    await page.locator('.room-state-chip').first().waitFor();
    for (const chip of await page.locator('.room-state-chip').all()) assert.ok((await chip.boundingBox()).height >= 44);
    for (const field of await page.locator('input:not([type=checkbox]), select, textarea').all()) {
      assert.ok(await field.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16), 'phone edit fields avoid undersized text');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const trigger = page.getByRole('button', { name: /^Staff account:/ });
    const box = await trigger.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    assert.equal(await trigger.evaluate(el => getComputedStyle(el).scale), 'none', 'reduced motion suppresses press scaling');
    await page.mouse.up();
    console.log('PASS phone touch targets, readable fields, reduced-motion feedback');
  } finally {
    await browser?.close();
    await fixture.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
