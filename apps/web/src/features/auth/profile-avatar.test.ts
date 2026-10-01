import test from 'node:test';
import assert from 'node:assert/strict';

import { getProfileAvatarInitial } from '@/features/auth/profile-avatar';

test('profile avatar initial is fixed by staff role', () => {
  assert.equal(getProfileAvatarInitial('owner'), 'M');
  assert.equal(getProfileAvatarInitial('supervisor'), 'S');
  assert.equal(getProfileAvatarInitial('receptionist'), 'R');
});