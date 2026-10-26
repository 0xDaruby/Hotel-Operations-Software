import test from 'node:test';
import assert from 'node:assert/strict';
import { isStaffSetupType, staffSetupFragment, hasStaffSetupResponse } from './setup-link';

test('accepts real invitations and existing setup-recovery links', () => {
  for (const type of ['invite', 'recovery']) {
    assert.equal(isStaffSetupType(type), true);
    assert.deepEqual(staffSetupFragment(`#type=${type}&access_token=access&refresh_token=refresh`), {
      access_token: 'access', refresh_token: 'refresh',
    });
  }
});

test('does not consume incomplete, expired or unrelated authentication links', () => {
  for (const hash of ['', '#error=access_denied&error_code=otp_expired', '#type=invite&access_token=access',
    '#type=invite&refresh_token=refresh', '#type=signup&access_token=a&refresh_token=r',
    '#type=magiclink&access_token=a&refresh_token=r']) assert.equal(staffSetupFragment(hash), null);
  assert.equal(isStaffSetupType(null), false);
  assert.equal(hasStaffSetupResponse('#error_code=otp_expired'), true);
  assert.equal(hasStaffSetupResponse('#section=payments'), false);
});
