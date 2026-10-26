import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteStaffAccount, validateDeletionInput } from './account-lifecycle';

const input = { userId: '00000000-0000-0000-0000-000000000002', reason: 'Left employment', confirmation: 'DELETE' };

test('permanent deletion requires exact confirmation, reason, and UUID before any backend call', () => {
  for (const value of [null, {}, { ...input, confirmation: 'delete' }, { ...input, reason: ' ' }, { ...input, userId: 'x' }, { ...input, reason: 'x'.repeat(501) }]) {
    assert.throws(() => validateDeletionInput(value));
  }
  assert.deepEqual(validateDeletionInput({ ...input, reason: '  Left employment  ' }), input);
});

test('deletion stages with owner authorization before removing Auth login and confirming history', async () => {
  const calls: string[] = [];
  const result = await deleteStaffAccount(input, {
    prepare: async () => { calls.push('authorize'); return 'operation'; },
    authUserExists: async () => { calls.push('lookup'); return true; },
    deleteAuthUser: async () => { calls.push('delete'); },
    complete: async id => { assert.equal(id, 'operation'); calls.push('confirm'); },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['authorize', 'lookup', 'delete', 'confirm']);
});

test('unauthorized or active targets cannot reach the privileged Auth deletion', async () => {
  const result = await deleteStaffAccount(input, {
    prepare: async () => { throw Error('Active account'); },
    authUserExists: async () => { assert.fail('lookup must not run'); },
    deleteAuthUser: async () => { assert.fail('delete must not run'); },
    complete: async () => { assert.fail('complete must not run'); },
  });
  assert.equal(result.ok, false);
});

test('retry finalizes an already removed Auth login without deleting again', async () => {
  const result = await deleteStaffAccount(input, {
    prepare: async () => 'same-operation',
    authUserExists: async () => false,
    deleteAuthUser: async () => { assert.fail('already absent'); },
    complete: async id => { assert.equal(id, 'same-operation'); },
  });
  assert.equal(result.ok, true);
});

test('lost Auth deletion response is reconciled before reporting success', async () => {
  let lookups = 0;
  let completed = false;
  const result = await deleteStaffAccount(input, {
    prepare: async () => 'operation',
    authUserExists: async () => ++lookups === 1,
    deleteAuthUser: async () => { throw Error('response lost after commit'); },
    complete: async () => { completed = true; },
  });
  assert.equal(result.ok, true);
  assert.equal(completed, true);
});

test('Auth failure retains the inactive deletion request and never claims success', async () => {
  const result = await deleteStaffAccount(input, {
    prepare: async () => 'operation',
    authUserExists: async () => true,
    deleteAuthUser: async () => { throw Error('Storage ownership or transport failure'); },
    complete: async () => { assert.fail('Auth is still present'); },
  });
  assert.equal(result.ok, false);
  assert.match(result.error!, /inactive.*retry/i);
});

test('uncertain lookup and failed finalization remain retryable without false success', async () => {
  for (const lookupFails of [true, false]) {
    const result = await deleteStaffAccount(input, {
      prepare: async () => 'operation',
      authUserExists: async () => { if (lookupFails) throw Error('offline'); return false; },
      deleteAuthUser: async () => { assert.fail('must not delete'); },
      complete: async () => { throw Error('database unavailable'); },
    });
    assert.equal(result.ok, false);
    assert.match(result.error!, /retry/i);
  }
});
