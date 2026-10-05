import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshController } from './refresh-controller';

function harness() {
  let active = true;
  let calls = 0;
  let scheduled: (() => void) | undefined;
  const controller = createRefreshController({
    isActive: () => active,
    refresh: () => { calls += 1; },
    schedule: (callback, delay) => { assert.equal(delay, 4000); scheduled = callback; return 1; },
    cancel: () => { scheduled = undefined; },
  });
  return { controller, setActive: (value: boolean) => { active = value; }, calls: () => calls,
    tick: () => { const callback = scheduled; scheduled = undefined; callback?.(); }, scheduled: () => !!scheduled };
}

test('polls active views and waits for completion before scheduling another refresh', () => {
  const h = harness();
  h.controller.start();
  assert.equal(h.calls(), 0);
  h.tick();
  assert.equal(h.calls(), 1);
  h.controller.recover();
  h.tick();
  assert.equal(h.calls(), 1);
  assert.equal(h.scheduled(), false);
  h.controller.complete();
  assert.equal(h.scheduled(), true);
  h.tick();
  assert.equal(h.calls(), 2);
});

test('pauses hidden or offline views and refreshes immediately on recovery', () => {
  const h = harness();
  h.controller.start();
  h.setActive(false);
  h.controller.recover();
  assert.equal(h.scheduled(), false);
  h.tick();
  assert.equal(h.calls(), 0);
  h.setActive(true);
  h.controller.recover();
  assert.equal(h.calls(), 1);
  h.setActive(false);
  h.controller.complete();
  assert.equal(h.scheduled(), false);
});

test('disposal clears timers and ignores late completion and recovery', () => {
  const h = harness();
  h.controller.start();
  h.controller.dispose();
  h.tick();
  h.controller.recover();
  h.controller.complete();
  assert.equal(h.calls(), 0);
  assert.equal(h.scheduled(), false);
});

test('scheduled polling rechecks current availability before requesting data', () => {
  const h = harness();
  h.controller.start();
  h.setActive(false);
  h.tick();
  assert.equal(h.calls(), 0);
  assert.equal(h.scheduled(), false);
});

test('a synchronous refresh failure is surfaced and releases the controller for retry', () => {
  let scheduled = false;
  const failure = new Error('Refresh failed');
  const controller = createRefreshController({
    isActive: () => true,
    refresh: () => { throw failure; },
    schedule: () => { scheduled = true; return 1; },
    cancel: () => { scheduled = false; },
  });
  assert.throws(() => controller.recover(), failure);
  assert.equal(scheduled, true);
  assert.throws(() => controller.recover(), failure);
  controller.dispose();
  assert.equal(scheduled, false);
});
