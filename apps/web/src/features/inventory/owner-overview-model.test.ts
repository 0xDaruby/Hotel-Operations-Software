import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOwnerAttentionItems, getOwnerRoomState } from './owner-overview-model';

const now = '2026-10-02T14:00:00.000Z';

test('includes overdue stays, inspections waiting two hours, and open maintenance, oldest first', () => {
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
    'maintenance-too-new',
    'inspection-at-threshold',
    'inspection-too-new',
    'stay-overdue',
  ]);
  assert.deepEqual(items.map((item) => item.roomNumber), ['101', '102', '101', '102', '101']);
  assert.deepEqual(items.map((item) => item.kind), ['maintenance', 'maintenance', 'inspection', 'inspection', 'departure']);
});

test('pending inspections enter attention at two hours, with newer work excluded', () => {
  const items = buildOwnerAttentionItems({
    now,
    stays: [],
    inspections: [
      ...['r1', 'r2', 'r3'].map((room_id) => ({ id: room_id, room_id, due_at: '2026-10-02T12:00:00.000Z', status: 'pending' })),
      { id: 'newer', room_id: 'r6', due_at: '2026-10-02T12:00:00.001Z', status: 'pending' },
      { id: 'approved', room_id: 'r4', due_at: now, status: 'approved' },
      { id: 'future', room_id: 'r5', due_at: '2026-10-02T15:00:00.000Z', status: 'pending' },
    ],
    maintenanceIssues: [{ id: 'new-block', room_id: 'r1', reported_at: now }],
    roomNumberById: new Map(),
  });
  assert.equal(items.filter((item) => item.kind === 'inspection').length, 3);
  assert.equal(items.filter((item) => item.kind === 'maintenance').length, 1);
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
