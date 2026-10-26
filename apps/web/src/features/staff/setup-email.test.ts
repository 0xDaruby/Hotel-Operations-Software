import test from 'node:test';
import assert from 'node:assert/strict';
import { sendStaffSetupEmail } from './setup-email';

test('new unconfirmed accounts get an invitation instead of a password reset', async () => {
  const calls: string[] = [];
  await sendStaffSetupEmail('staff', 'ada@example.com', {
    getUser: async () => ({ id: 'staff', email: 'ada@example.com' }),
    invite: async email => { calls.push(`invite:${email}`); return { id: 'staff' }; },
    recoverLegacy: async () => { calls.push('recovery'); },
  });
  assert.deepEqual(calls, ['invite:ada@example.com']);
});

test('opened unfinished invitations and older confirmed accounts can retry setup', async () => {
  const calls: string[] = [];
  await sendStaffSetupEmail('staff', 'ada@example.com', {
    getUser: async () => ({ id: 'staff', email: 'ADA@example.com', email_confirmed_at: '2026-10-01' }),
    invite: async () => { throw Error('Must not reinvite a confirmed identity'); },
    recoverLegacy: async () => { calls.push('legacy setup'); },
  });
  assert.deepEqual(calls, ['legacy setup']);
});

test('identity mismatches and failed invitations never report successful delivery', async () => {
  let sent = false;
  await assert.rejects(sendStaffSetupEmail('staff', 'ada@example.com', {
    getUser: async () => ({ id: 'other', email: 'ada@example.com' }),
    invite: async () => { sent = true; return { id: 'other' }; },
    recoverLegacy: async () => { sent = true; },
  }));
  assert.equal(sent, false);
  await assert.rejects(sendStaffSetupEmail('staff', 'ada@example.com', {
    getUser: async () => ({ id: 'staff', email: 'ada@example.com' }),
    invite: async () => { throw Error('Mail unavailable'); },
    recoverLegacy: async () => {},
  }));
});
