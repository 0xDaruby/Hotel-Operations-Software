import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDepartureAttentionCount } from './departure-attention-count';

const now = new Date('2026-10-17T12:00:00.000Z');
const rows = [
  { status: 'active', departure_due_at: '2026-10-16T12:00:00.000Z' },
  { status: 'active', departure_due_at: '2026-10-17T12:00:00.000Z' },
  { status: 'active', departure_due_at: '2026-10-18T12:00:00.000Z' },
  { status: 'active', departure_due_at: '2026-10-18T12:00:00.001Z' },
  { status: 'departed', departure_due_at: '2026-10-16T12:00:00.000Z' },
  { status: 'void', departure_due_at: '2026-10-16T12:00:00.000Z' },
];

function client(source = rows, failure: 'error' | 'missing-count' | null = null) {
  let filtered = source;
  return {
    from(table: string) {
      assert.equal(table, 'stays');
      const query = {
        select(column: string, options: unknown) {
          assert.equal(column, 'id');
          assert.deepEqual(options, { count: 'exact', head: true });
          return query;
        },
        eq(key: 'status', value: string) { filtered = filtered.filter((row) => row[key] === value); return query; },
        lte(key: 'departure_due_at', value: string) { filtered = filtered.filter((row) => row[key] <= value); return query; },
        then(resolve: (result: unknown) => unknown) {
          return Promise.resolve({ count: failure === 'missing-count' ? null : filtered.length,
            error: failure === 'error' ? { message: 'Database unavailable' } : null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as Pick<SupabaseClient, 'from'>;
}

test('departure badge counts overdue and next-24-hour active stays, including boundary', async () => {
  assert.equal(await getDepartureAttentionCount(client(), now), 3);
  assert.equal(await getDepartureAttentionCount(client(), new Date(now.getTime() + 1)), 4);
});

test('departure badge counts exactly without a row-response cap and returns zero for empty queue', async () => {
  assert.equal(await getDepartureAttentionCount(client(Array.from({ length: 1501 }, () => rows[0])), now), 1501);
  assert.equal(await getDepartureAttentionCount(client([]), now), 0);
});

test('departure count errors cannot masquerade as a clear queue', async () => {
  await assert.rejects(getDepartureAttentionCount(client(rows, 'error'), now), /Database unavailable/);
  await assert.rejects(getDepartureAttentionCount(client(rows, 'missing-count'), now), /count was not returned/);
});
