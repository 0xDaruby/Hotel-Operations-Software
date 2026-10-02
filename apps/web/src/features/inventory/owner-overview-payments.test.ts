import test from 'node:test';
import assert from 'node:assert/strict';

import { getPreviousOperatingDate, summarizePaymentTotals } from './owner-overview-payments';

test('finds the previous operating date across month and leap-year boundaries', () => {
  assert.equal(getPreviousOperatingDate('2026-10-02'), '2026-10-01');
  assert.equal(getPreviousOperatingDate('2024-03-01'), '2024-02-29');
});

test('totals actual received amounts for today and yesterday, excluding voided stays', () => {
  const totals = summarizePaymentTotals([
    { amount: 940000, received_on: '2026-10-02', stays: { status: 'active' } },
    { amount: '320000', received_on: '2026-10-02', stays: [{ status: 'departed' }] },
    { amount: 1080000, received_on: '2026-10-01', stays: { status: 'departed' } },
    { amount: 40000, received_on: '2026-10-02', stays: { status: 'void' } },
    { amount: 50000, received_on: '2026-09-30', stays: { status: 'active' } },
  ], '2026-10-02', '2026-10-01');

  assert.deepEqual(totals, { today: 1260000, yesterday: 1080000 });
});