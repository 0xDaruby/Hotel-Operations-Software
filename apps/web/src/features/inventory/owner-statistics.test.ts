import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOwnerStatistics } from './owner-statistics';

const expected = {
  paymentTotals: { today: 48000000, yesterday: 100000 },
  movement: { arrivals: 1201, departures: 2, extensions: 3, departuresDueSoon: 4, initialPayments: 47000000, extensionPayments: 1000000 },
};

test('owner statistics uses one database aggregate without downloading payment/event rows', async () => {
  let calls = 0;
  const client = { rpc: async (name: string, params: unknown) => {
    calls++;
    assert.equal(name, 'get_owner_statistics');
    assert.deepEqual(params, { p_today: '2026-10-16', p_now: '2026-10-16T12:00:00.000Z' });
    return { data: expected, error: null };
  } } as unknown as SupabaseClient;
  assert.deepEqual(await getOwnerStatistics(client, '2026-10-16', '2026-10-16T12:00:00.000Z'), expected);
  assert.equal(calls, 1);
});

test('statistics failures are never reported as zero revenue or movement', async () => {
  const client = { rpc: async () => ({ data: null, error: { message: 'Database unavailable', code: 'XX000' } }) } as unknown as SupabaseClient;
  await assert.rejects(getOwnerStatistics(client, '2026-10-16', '2026-10-16T12:00:00.000Z'), /Database unavailable/);
});

test('missing aggregate RPC keeps the existing setup usable with checked RLS reads', async () => {
  const tables: string[] = [];
  let fail = false;
  const client = {
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Missing function' } }),
    from(table: string) {
      tables.push(table);
      const query = {
        select() { return query; }, in() { return query; }, order() { return query; },
        gte() { return query; }, lt() { return query; }, eq() { return query; },
        range() { return Promise.resolve({ data: fail ? null : [], count: fail ? null : 0, error: fail ? { message: 'Fallback unavailable' } : null }); },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  assert.deepEqual(await getOwnerStatistics(client, '2026-10-16', '2026-10-16T12:00:00.000Z'), {
    paymentTotals: { today: 0, yesterday: 0 },
    movement: { arrivals: 0, departures: 0, extensions: 0, departuresDueSoon: 0, initialPayments: 0, extensionPayments: 0 },
  });
  assert.deepEqual(tables, ['payment_records', 'activity_events', 'stays']);
  fail = true;
  await assert.rejects(getOwnerStatistics(client, '2026-10-16', '2026-10-16T12:00:00.000Z'), /Fallback unavailable/);
});

test('invalid or incomplete statistics fail explicitly', async () => {
  for (const data of [null, {}, { ...expected, paymentTotals: { today: null, yesterday: 0 } }, { ...expected, movement: { ...expected.movement, arrivals: -1 } }]) {
    const client = { rpc: async () => ({ data, error: null }) } as unknown as SupabaseClient;
    await assert.rejects(getOwnerStatistics(client, '2026-10-16', '2026-10-16T12:00:00.000Z'), /invalid|incomplete/i);
  }
});
