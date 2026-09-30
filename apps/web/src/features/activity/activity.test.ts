import test from 'node:test';
import assert from 'node:assert/strict';

import type { ActivityEvent } from './activity';
import {
  formatActivityAction,
  getActivityCategory,
  getActivityContextLabel,
  groupActivityEventsByDate,
} from './activity-view';

function event(id: string, action: string, createdAt: Date): ActivityEvent {
  return {
    id,
    action,
    actorName: 'Alex',
    roomNumber: null,
    guestName: null,
    reason: null,
    createdAt: createdAt.toISOString(),
    details: null,
  };
}

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

test('getActivityCategory groups events by their action domain', () => {
  assert.equal(getActivityCategory('stay.arrived'), 'stays');
  assert.equal(getActivityCategory('inspection.approved'), 'inspections');
  assert.equal(getActivityCategory('maintenance.reported'), 'maintenance');
  assert.equal(getActivityCategory('staff.created'), 'other');
});

test('groupActivityEventsByDate labels today, yesterday, and earlier activity', () => {
  const today = new Date(2026, 8, 30, 12);
  const events = [
    event('today', 'stay.arrived', new Date(2026, 8, 30, 10)),
    event('yesterday', 'inspection.approved', new Date(2026, 8, 29, 10)),
    event('older', 'maintenance.reported', new Date(2026, 8, 27, 10)),
  ];

  const groups = groupActivityEventsByDate(events, today);

  assert.deepEqual(groups.map((group) => group.label), [
    'Today',
    'Yesterday',
    new Intl.DateTimeFormat('en-GB', { dateStyle: 'full' }).format(new Date(2026, 8, 27)),
  ]);
  assert.deepEqual(groups.map((group) => group.events.map(({ id }) => id)), [
    ['today'],
    ['yesterday'],
    ['older'],
  ]);
});
