import test from 'node:test';
import assert from 'node:assert/strict';
import { authRateLimited, normalizeAuthEmail, validLoginPassword } from './auth-input';
import { completePasswordRecovery, requestPasswordRecovery, RECOVERY_CONFIRMATION } from './password-recovery';

test('recovery rejects malformed and oversized input before calling Auth', async () => {
  let called = false;
  for (const value of [null, {}, ['a@b.co'], 'invalid', 'a'.repeat(255), 'a@b.co\nother@example.com']) {
    assert.equal((await requestPasswordRecovery(value, async () => { called = true; return { error: null }; })).ok, false);
  }
  assert.equal(called, false);
  assert.equal(normalizeAuthEmail(' ADA@example.com '), 'ada@example.com');
  // An apostrophe is data, not a reason to concatenate SQL or reject a name.
  assert.equal(normalizeAuthEmail("o'connor@example.com"), "o'connor@example.com");
});

test('existing, unknown, blocked and throttled email requests share a neutral result', async () => {
  for (const error of [null, { status: 400 }, { status: 404 }, { status: 422 }, { status: 429 }]) {
    assert.deepEqual(await requestPasswordRecovery('staff@example.com', async () => ({ error })), {
      ok: true, message: RECOVERY_CONFIRMATION,
    });
  }
  assert.equal((await requestPasswordRecovery('staff@example.com', async () => ({ error: { status: 503 } }))).ok, false);
});

test('sign-in validates sizes without retroactively rejecting older short passwords', () => {
  assert.equal(validLoginPassword('old-pass'), true);
  assert.equal(validLoginPassword('x'.repeat(1025)), false);
  assert.equal(validLoginPassword({}), false);
  assert.equal(authRateLimited({ status: 429 }), true);
  assert.equal(authRateLimited({ code: 'over_request_rate_limit' }), true);
});

test('unverified, expired or reused recovery sessions never change the password', async () => {
  const calls: string[] = [];
  const result = await completePasswordRecovery({
    claim: async () => { throw Error('Denied'); },
    update: async () => { calls.push('password'); return true; },
    finish: async () => { calls.push('finish'); },
  });
  assert.equal(result.ok, false); assert.deepEqual(calls, []);
});

test('reset fences old access before password change and requires cleanup for success', async () => {
  const calls: string[] = [];
  const result = await completePasswordRecovery({
    claim: async () => { calls.push('fence'); return 'session'; },
    update: async () => { calls.push('password'); return true; },
    finish: async (id, saved) => { assert.equal(id, 'session'); assert.equal(saved, true); calls.push('cleanup'); },
  });
  assert.deepEqual(calls, ['fence', 'password', 'cleanup']); assert.equal(result.ok, true);
});

test('provider errors still revoke the claimed session and never report success', async () => {
  for (const throws of [false, true]) {
    let cleaned = false;
    const result = await completePasswordRecovery({
      claim: async () => 'session',
      update: async () => { if (throws) throw Error('Network failure'); return false; },
      finish: async (_id, saved) => { assert.equal(saved, false); cleaned = true; },
    });
    assert.equal(cleaned, true); assert.equal(result.ok, false);
  }
});

test('a saved password plus failed finalization is explicitly partial', async () => {
  const result = await completePasswordRecovery({ claim: async () => 'session', update: async () => true,
    finish: async () => { throw Error('Database unavailable'); } });
  assert.equal(result.ok, false); assert.match(result.error ?? '', /password was saved.*cleanup could not be confirmed/);
});
