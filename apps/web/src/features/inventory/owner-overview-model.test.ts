import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOwnerAttentionItems, getOwnerRoomState } from './owner-overview-model';

const now = '2026-10-02T14:00:00.000Z';

test('includes each overdue stay and each issue past its waiting threshold, oldest first', () => {
  const items = buildOwnerAttentionItems({
    now,
    stays: [
      { id: 'stay-current', room_id: 'r1', departure_due_at: '2026-10-02T14:01:00.000Z', status: 'active' },
      { id: 'stay-overdue', room_id: 'r1', departure_due_at: '2026-10-02T12:00:00.000Z', status: 'active' },
      { id: 'stay-departed', room_id: 'r2', departure_due_at: '2026-10-02T10:00:00.000Z', status: 'departed' },
    ],
    inspections: [
      { id: 'inspection-at-threshold', room_id: 'r1', due_at: '2026-10-02T10:00:00.000Z', status: 'pending' },
      { id: 'inspection-too-new', room_id: 'r2', due_at: '2026-10-02T10:01:00.000Z', status: 'pending' },
      { id: 'inspection-approved', room_id: 'r3', due_at: '2026-10-02T09:00:00.000Z', status: 'approved' },
    ],
    maintenanceIssues: [
      { id: 'maintenance-at-threshold', room_id: 'r1', reported_at: '2026-10-01T14:00:00.000Z' },
      { id: 'maintenance-too-new', room_id: 'r2', reported_at: '2026-10-01T14:01:00.000Z' },
    ],
    roomNumberById: new Map([['r1', '101'], ['r2', '102'], ['r3', '103']]),
  });

  assert.deepEqual(items.map((item) => item.id), [
    'maintenance-at-threshold',
    'inspection-at-threshold',
    'stay-overdue',
  ]);
  assert.deepEqual(items.map((item) => item.roomNumber), ['101', '101', '101']);
  assert.deepEqual(items.map((item) => item.kind), ['maintenance', 'inspection', 'departure']);
});

test('counts multiple attention items for one room independently', () => {
  const items = buildOwnerAttentionItems({
    now,
    stays: [{ id: 'stay', room_id: 'r1', departure_due_at: '2026-10-02T12:00:00.000Z', status: 'active' }],
    inspections: [{ id: 'inspection', room_id: 'r1', due_at: '2026-10-02T09:00:00.000Z', status: 'attention' }],
    maintenanceIssues: [{ id: 'issue', room_id: 'r1', reported_at: '2026-10-01T10:00:00.000Z' }],
    roomNumberById: new Map([['r1', '101']]),
  });

  assert.equal(items.length, 3);
});

test('elapsed time does not alter readiness and overlapping room facts remain independent', () => {
  assert.deepEqual(getOwnerRoomState(true, true, true, true), {
    occupied: true,
    inspection: true,
    blocked: true,
    ready: false,
  });
  assert.equal(getOwnerRoomState(true, false, false, false).ready, true);
  assert.equal(getOwnerRoomState(false, false, false, false).ready, false);
});