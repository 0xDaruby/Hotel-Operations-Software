import test from 'node:test';
import assert from 'node:assert/strict';
import { completePasswordSetup, validateSetupPassword } from './password-setup';

test('password setup rejects short, mismatched, and oversized passwords', () => {
  assert.ok(validateSetupPassword(null, null));
  assert.ok(validateSetupPassword(123, 'a-long-password'));
  assert.ok(validateSetupPassword('short', 'short'));
  assert.ok(validateSetupPassword('a-long-password', 'different-password'));
  assert.ok(validateSetupPassword('a'.repeat(73), 'a'.repeat(73)));
  assert.equal(validateSetupPassword('a-long-password', 'a-long-password'), null);
});

test('failed password update never enables operational access', async () => {
  let enabled = false;
  const result = await completePasswordSetup({
    updatePassword: async () => ({ error: 'Password could not be updated.' }),
    enableProfile: async () => { enabled = true; return { error: null }; },
  });
  assert.equal(result.ok, false);
  assert.equal(enabled, false);
});

test('profile completion failure is explicit and can be retried', async () => {
  const result = await completePasswordSetup({
    updatePassword: async () => ({ error: null }),
    enableProfile: async () => ({ error: 'unavailable' }),
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /access could not be enabled/);
});

test('access is enabled only after a successful password change', async () => {
  const calls: string[] = [];
  const result = await completePasswordSetup({
    updatePassword: async () => { calls.push('password'); return { error: null }; },
    enableProfile: async () => { calls.push('profile'); return { error: null }; },
  });
  assert.deepEqual(calls, ['password', 'profile']);
  assert.equal(result.ok, true);
});
