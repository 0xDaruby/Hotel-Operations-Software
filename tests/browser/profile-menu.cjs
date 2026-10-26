const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const { resolve } = require('node:path');
const { startUiFixture } = require('./ui-validation-server.cjs');

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const fixture = await startUiFixture();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const [role, initial] of [['owner', 'M'], ['receptionist', 'R'], ['supervisor', 'S']]) {
      await page.goto(`${fixture.url}/overview?role=${role}`);
      const trigger = page.getByRole('button', { name: /^Staff account:/ });
      await trigger.waitFor();
      assert.equal((await trigger.innerText()).trim(), initial);
      assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).isVisible(), false);
      await trigger.focus();
      await page.keyboard.press('Enter');
      const panel = page.getByRole('dialog', { name: 'Staff account', exact: true });
      await panel.waitFor();
      await page.waitForFunction(() => document.activeElement?.classList.contains('profile-popover'));
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      const box = await panel.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, 'panel fits phone viewport');
      await page.keyboard.press('Tab');
      assert.equal(await page.getByRole('button', { name: 'Close staff account' }).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden' });
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Escape returns focus');
      await trigger.tap();
      await panel.waitFor();
      await page.locator('.page-heading h1').tap();
      await panel.waitFor({ state: 'hidden' });
      await trigger.tap();
      await panel.getByRole('button', { name: 'Close staff account' }).click();
      await panel.waitFor({ state: 'hidden' });
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'close returns focus');
      if (role === 'owner') {
        await trigger.tap();
        await page.getByRole('button', { name: 'Open menu', exact: true }).tap();
        await panel.waitFor({ state: 'hidden' });
        assert.equal(await page.locator('.sidebar').evaluate(el => el.classList.contains('sidebar-open')), true);
        await page.locator('.sidebar').getByRole('button', { name: 'Close', exact: true }).tap();
      }
      console.log(`PASS ${role}: initial, phone bounds, keyboard, Escape, outside tap`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const trigger = page.getByRole('button', { name: /^Staff account:/ });
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Staff account', exact: true });
    await panel.waitFor();
    const box = await panel.boundingBox();
    const anchor = await trigger.boundingBox();
    assert.ok(Math.abs(box.x + box.width - anchor.x - anchor.width) <= 1, 'desktop right edge anchored');
    await page.setViewportSize({ width: 1400, height: 900 });
    await panel.waitFor({ state: 'hidden' });
    await trigger.click();
    await panel.waitFor();
    await page.evaluate(() => {
      document.querySelector('.profile-name').textContent = 'A very long staff name '.repeat(12);
      window.fixtureSignOutCalls = 0;
      window.fixtureSignOut = async () => {
        window.fixtureSignOutCalls++;
        await new Promise(resolve => { window.releaseFixtureSignOut = resolve; });
        return { error: { message: 'Synthetic sign-out failure' } };
      };
    });
    const signOut = panel.getByRole('button', { name: 'Sign out', exact: true });
    await signOut.click();
    assert.equal(await panel.getByRole('button', { name: 'Signing out…' }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.fixtureSignOutCalls), 1);
    await page.evaluate(() => window.releaseFixtureSignOut());
    await panel.getByRole('alert').waitFor();
    assert.equal(await signOut.isEnabled(), true);
    assert.ok(page.url().includes('/overview'), 'failure keeps staff in workspace');
    await mkdir(resolve('tests/browser/artifacts/profile-menu'), { recursive: true });
    await page.screenshot({ path: resolve('tests/browser/artifacts/profile-menu/desktop.png') });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 320, height: 640 });
    await trigger.click();
    await panel.waitFor();
    assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'long name does not overflow');
    await page.screenshot({ path: resolve('tests/browser/artifacts/profile-menu/mobile.png') });
    await page.evaluate(() => { window.fixtureSignOut = async () => ({ error: null }); });
    await signOut.click();
    await page.waitForURL('**/login');
    console.log('PASS desktop alignment, long name, pending, failure/retry, successful login redirect');
  } finally {
    await browser?.close();
    await fixture.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
