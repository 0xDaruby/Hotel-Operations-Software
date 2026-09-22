import test from 'node:test';
import assert from 'node:assert/strict';

import { formatActivityAction, getActivityContextLabel } from './activity';

test('formatActivityAction humanizes the stored action names', () => {
  assert.equal(formatActivityAction('stay.arrived'), 'Arrival recorded');
  assert.equal(formatActivityAction('inspection.approved'), 'Inspection approved');
  assert.equal(formatActivityAction('maintenance.reported'), 'Maintenance reported');
});

test('getActivityContextLabel distinguishes room and stay references', () => {
  assert.equal(getActivityContextLabel({ roomNumber: '104', guestName: 'Ada' }), 'Room 104 · Ada');
  assert.equal(getActivityContextLabel({ roomNumber: '204' }), 'Room 204');
  assert.equal(getActivityContextLabel({ guestName: 'Ada' }), 'Ada');
});
