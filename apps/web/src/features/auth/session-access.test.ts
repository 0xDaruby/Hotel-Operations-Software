import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceStaffSession, isTransientAuthError } from './session-access';

test('revoked staff sessions clear this device before returning to login', async () => {
  const calls: string[] = [];
  const allowed = await enforceStaffSession({
    check: async () => 'revoked',
    clearLocalSession: async () => { calls.push('clear'); },
    leave: reason => { calls.push(reason); },
  });
  assert.equal(allowed, false);
  assert.deepEqual(calls, ['clear', 'revoked']);
});

test('active accounts refresh normally and transient failures do not log staff out', async () => {
  for (const state of ['ready', 'offline']) {
    const allowed = await enforceStaffSession({
      check: async () => { if (state === 'offline') throw Error('network'); return 'ready'; },
      clearLocalSession: async () => { assert.fail('must not sign out'); },
      leave: () => { assert.fail('must not navigate'); },
    });
    assert.equal(allowed, state === 'ready');
  }
});

test('denied accounts leave the workspace even if clearing a revoked local token fails', async () => {
  const reasons: string[] = [];
  await enforceStaffSession({ check: async () => 'inactive', clearLocalSession: async () => { throw Error('session revoked'); }, leave: reason => reasons.push(reason) });
  assert.deepEqual(reasons, ['inactive']);
});

test('rate limits and retryable Auth errors preserve staff work rather than clearing sessions', () => {
  for (const status of [0, 408, 429, 500, 503]) assert.equal(isTransientAuthError({ status }), true);
  for (const status of [400, 401, 403, 404]) assert.equal(isTransientAuthError({ status }), false);
});

test('a hung Auth logout cannot keep a denied staff member on the protected screen', async () => {
  const reasons: string[] = [];
  await enforceStaffSession({
    check: async () => 'revoked', clearLocalSession: () => new Promise(() => {}),
    clearTimeoutMs: 1, leave: reason => reasons.push(reason),
  });
  assert.deepEqual(reasons, ['revoked']);
});
