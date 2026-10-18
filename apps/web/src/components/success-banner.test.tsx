import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SuccessBanner, SuccessBannerProvider } from './success-banner';
import { createBannerTimer, SUCCESS_BANNER_DURATION } from './success-banner-timer';

function clock() {
  let now = 0;
  let id = 0;
  const jobs = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    schedule(callback: () => void, delay: number) { const key = ++id; jobs.set(key, { at: now + delay, callback }); return key; },
    cancel(handle: unknown) { jobs.delete(handle as number); },
    advance(ms: number) {
      const end = now + ms;
      while (true) {
        const job = [...jobs].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!job) break;
        now = job[1].at;
        jobs.delete(job[0]);
        job[1].callback();
      }
      now = end;
    },
  };
}

test('routine confirmations use a consistent six-second duration', () => {
  assert.equal(SUCCESS_BANNER_DURATION, 6000);
  const time = clock();
  let expired = 0;
  createBannerTimer(6000, () => expired++, time);
  time.advance(5999);
  assert.equal(expired, 0);
  time.advance(1);
  assert.equal(expired, 1);
  time.advance(10000);
  assert.equal(expired, 1);
});

test('hover, focus and a hidden tab overlap without prematurely dismissing feedback', () => {
  const time = clock();
  let expired = false;
  const timer = createBannerTimer(6000, () => { expired = true; }, time);
  time.advance(2000);
  timer.pause('hover');
  timer.pause('focus');
  time.advance(20000);
  timer.resume('hover');
  time.advance(20000);
  assert.equal(expired, false);
  timer.pause('hidden');
  timer.resume('focus');
  time.advance(20000);
  assert.equal(expired, false);
  timer.resume('hidden');
  time.advance(3999);
  assert.equal(expired, false);
  time.advance(1);
  assert.equal(expired, true);
});

test('unmounting or dismissing cancels the outstanding timer', () => {
  const time = clock();
  let expired = false;
  const timer = createBannerTimer(6000, () => { expired = true; }, time);
  timer.dispose();
  timer.resume('focus');
  time.advance(10000);
  assert.equal(expired, false);
});

test('long names remain complete text with an accessible dismissal control', () => {
  const message = 'Arrival recorded · Room 405';
  const detail = `${'Alexandria '.repeat(25)}<guest>`;
  const html = renderToStaticMarkup(<SuccessBanner confirmation={{ id: 1, message, detail }} onDismiss={() => {}} />);
  assert.match(html, /aria-label="Dismiss confirmation"/);
  assert.ok(html.includes(message));
  assert.ok(html.includes(detail.replace('<guest>', '&lt;guest&gt;')));
  assert.match(html, /success-banner-detail/);
  assert.doesNotMatch(html, /<dialog|role="alert"|autoFocus|<guest>/);
  const provider = renderToStaticMarkup(<SuccessBannerProvider><span>Workspace</span></SuccessBannerProvider>);
  assert.match(provider, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(provider, /Arrival recorded/);
});
