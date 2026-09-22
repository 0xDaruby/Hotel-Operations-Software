import test from 'node:test';
import assert from 'node:assert/strict';

import { isDailyInspectionDueAt } from '../inspections/inspections';
import { getBlockedRoomIds, parseStay } from './stays';

test('parseStay maps active room records to the live stay model', () => {
  const row = {
    id: 'stay-1',
    room_id: 'room-1',
    guest_name: 'Ada Okafor',
    guest_phone: '0803 000 0000',
    category_id: 'cat-1',
    original_daily_rate: 40000,
    arrival_at: '2026-09-21T15:00:00.000Z',
    departure_due_at: '2026-09-22T15:00:00.000Z',
    paid_days: 1,
    status: 'active',
    version: 1,
    created_by: 'staff-1',
    staff_profiles: { display_name: 'Ruth' },
  };

  const stay = parseStay(row, new Map([['room-1', '101']]), new Map([['cat-1', 'Standard']]));

  assert.ok(stay);
  assert.equal(stay?.roomNumber, '101');
  assert.equal(stay?.categoryName, 'Standard');
  assert.equal(stay?.createdByName, 'Ruth');
  assert.equal(stay?.status, 'active');
});

test('unresolved inspections and open maintenance both block room readiness, while approved inspections do not', () => {
  const blocked = getBlockedRoomIds(
    [
      { room_id: 'room-1', status: 'approved' },
      { room_id: 'room-2', status: 'pending' },
      { room_id: 'room-2', status: 'attention' },
      { room_id: 'room-3', status: 'access_blocked' },
      { room_id: 'room-4', status: 'approved' },
    ],
    ['room-5', 'room-2'],
  );

  assert.deepEqual([...blocked].sort(), ['room-2', 'room-3', 'room-5']);
});

test('occupied rooms become due for daily inspection at the 08:00 Africa/Lagos cutoff', () => {
  const cutoffTime = new Date('2026-09-22T07:00:00.000Z');
  const beforeCutoff = new Date('2026-09-22T06:59:00.000Z');

  assert.equal(isDailyInspectionDueAt(cutoffTime, true, false), true);
  assert.equal(isDailyInspectionDueAt(beforeCutoff, true, false), false);
  assert.equal(isDailyInspectionDueAt(cutoffTime, false, false), false);
  assert.equal(isDailyInspectionDueAt(cutoffTime, true, true), false);
});
