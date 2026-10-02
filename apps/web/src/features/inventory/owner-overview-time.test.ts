import test from 'node:test';
import assert from 'node:assert/strict';

import { formatElapsedTime, formatLagosDateTime } from './owner-overview-time';

test('formats elapsed time from its timestamp and supplied clock', () => {
  const now = Date.parse('2026-10-02T14:00:00.000Z');
  assert.equal(formatElapsedTime('2026-10-02T13:58:00.000Z', now), '2m');
  assert.equal(formatElapsedTime('2026-10-02T11:55:00.000Z', now), '2h 5m');
  assert.equal(formatElapsedTime('2026-10-01T12:00:00.000Z', now), '1d 2h');
});

test('formats absolute labels in the hotel timezone', () => {
  assert.match(formatLagosDateTime('2026-10-02T14:00:00.000Z'), /15:00 WAT$/);
});