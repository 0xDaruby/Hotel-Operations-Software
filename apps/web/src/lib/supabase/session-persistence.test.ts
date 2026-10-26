import test from 'node:test';
import assert from 'node:assert/strict';
import { REMEMBER_SECONDS, rememberCookieOptions, sessionCookieOptions } from './session-persistence';

test('unchecked sign-ins remain session cookies after any SDK refresh', () => {
  const sdkOptions = { path: '/', sameSite: 'lax' as const, secure: true, maxAge: 34560000, expires: new Date('2030-01-01') };
  const options = sessionCookieOptions(sdkOptions, false);
  assert.deepEqual(options, { path: '/', sameSite: 'lax', secure: true });
  assert.equal(sdkOptions.maxAge, 34560000);
  assert.equal(rememberCookieOptions(false).maxAge, undefined);
});

test('remembered sign-ins and their preference renew together for 30 days', () => {
  assert.equal(sessionCookieOptions({ path: '/', maxAge: 34560000 }, true).maxAge, REMEMBER_SECONDS);
  assert.equal(rememberCookieOptions(true).maxAge, REMEMBER_SECONDS);
});

test('sign-out and obsolete chunk deletion stay deletions for either preference', () => {
  for (const remembered of [false, true]) {
    for (const maxAge of [0, -1]) {
      assert.deepEqual(sessionCookieOptions({ path: '/', maxAge }, remembered), { path: '/', maxAge });
    }
  }
});
