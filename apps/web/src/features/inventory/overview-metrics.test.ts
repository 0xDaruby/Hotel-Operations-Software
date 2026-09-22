import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeInventoryMetrics } from './inventory-summary';

test('summarizeInventoryMetrics counts occupied, ready, and blocked rooms', () => {
  const rooms = [
    { id: 'r1', number: '101', floor: 'Floor 1', categoryId: 'c1', categoryName: 'Standard', dailyRate: 40000, active: true },
    { id: 'r2', number: '102', floor: 'Floor 1', categoryId: 'c1', categoryName: 'Standard', dailyRate: 40000, active: true },
    { id: 'r3', number: '103', floor: 'Floor 1', categoryId: 'c1', categoryName: 'Standard', dailyRate: 40000, active: true },
    { id: 'r4', number: '104', floor: 'Floor 1', categoryId: 'c1', categoryName: 'Standard', dailyRate: 40000, active: false },
  ];

  const summary = summarizeInventoryMetrics({
    rooms,
    occupiedRoomIds: ['r1', 'r2'],
    inspectionDueRoomIds: ['r2'],
    maintenanceIssueCountByRoomId: { r3: 1 },
  });

  assert.equal(summary.activeRooms, 3);
  assert.equal(summary.occupiedRooms, 2);
  assert.equal(summary.readyRooms, 0);
  assert.equal(summary.inspectionDueRooms, 1);
  assert.equal(summary.maintenanceBlockedRooms, 1);
  assert.equal(summary.availableRooms, 0);
});
