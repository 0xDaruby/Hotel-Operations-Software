import test from 'node:test';
import assert from 'node:assert/strict';

import { getLagosOperatingDayBounds, summarizeOwnerMovement } from './owner-overview-movement';

test('uses Lagos midnight boundaries for the operating day', () => {
  assert.deepEqual(getLagosOperatingDayBounds('2026-10-02'), {
    start: '2026-10-01T23:00:00.000Z',
    end: '2026-10-02T23:00:00.000Z',
  });
  assert.throws(() => getLagosOperatingDayBounds('2026-02-30'), RangeError);
});

test('summarizes recorded movement, payments, and upcoming departures', () => {
  const summary = summarizeOwnerMovement({
    events: [
      { action: 'stay.arrived' },
      { action: 'stay.arrived' },
      { action: 'stay.extended' },
      { action: 'stay.departed' },
      { action: 'inspection.approved' },
    ],
    activeStays: [
      { departure_due_at: '2026-10-02T15:00:00.000Z' },
      { departure_due_at: '2026-10-02T18:00:01.000Z' },
      { departure_due_at: '2026-10-02T13:59:59.000Z' },
      { departure_due_at: 'invalid' },
    ],
    payments: [
      { amount: 940000, received_on: '2026-10-02', kind: 'initial', stays: { status: 'active' } },
      { amount: '320000', received_on: '2026-10-02', kind: 'extension', stays: { status: 'departed' } },
      { amount: 40000, received_on: '2026-10-02', kind: 'initial', stays: { status: 'void' } },
      { amount: 50000, received_on: '2026-10-01', kind: 'initial', stays: { status: 'active' } },
    ],
    now: '2026-10-02T14:00:00.000Z',
    today: '2026-10-02',
  });

  assert.deepEqual(summary, {
    arrivals: 2,
    departures: 1,
    extensions: 1,
    departuresDueSoon: 1,
    initialPayments: 940000,
    extensionPayments: 320000,
  });
});