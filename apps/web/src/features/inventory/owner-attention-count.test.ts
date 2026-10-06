import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOwnerAttentionCount } from './owner-attention-count';
import { buildOwnerAttentionItems } from './owner-overview-model';

const now = new Date('2026-10-06T12:00:00.000Z');
const stays = [
  { id: 'overdue', room_id: 'r1', status: 'active', departure_due_at: '2026-10-06T11:59:59.000Z' },
  { id: 'due-now', room_id: 'r1', status: 'active', departure_due_at: now.toISOString() },
  { id: 'ended', room_id: 'r1', status: 'departed', departure_due_at: '2026-10-05T12:00:00.000Z' },
];
const inspections = [
  { id: 'threshold', room_id: 'r1', status: 'access_blocked', due_at: '2026-10-06T08:00:00.000Z' },
  { id: 'recent', room_id: 'r1', status: 'pending', due_at: '2026-10-06T08:00:01.000Z' },
  { id: 'done', room_id: 'r1', status: 'approved', due_at: '2026-10-05T08:00:00.000Z' },
];
const issues = [
  { id: 'threshold', room_id: 'r1', status: 'open', reported_at: '2026-10-05T12:00:00.000Z' },
  { id: 'recent', room_id: 'r1', status: 'open', reported_at: '2026-10-05T12:00:01.000Z' },
  { id: 'done', room_id: 'r1', status: 'resolved', reported_at: '2026-10-04T12:00:00.000Z' },
];

function client(failure = false, empty = false) {
  const tables: Record<string, Record<string, string>[]> = {
    stays, inspection_requirements: inspections, maintenance_issues: issues,
  };
  const queried: string[] = [];
  const supabase = {
    from(table: string) {
      queried.push(table);
      let rows = empty ? [] : tables[table];
      assert.ok(rows, `Unexpected table: ${table}`);
      const query = {
        select(column: string, options: unknown) {
          assert.equal(column, 'id');
          assert.deepEqual(options, { count: 'exact', head: true });
          return query;
        },
        eq(key: string, value: string) { rows = rows.filter((row) => row[key] === value); return query; },
        neq(key: string, value: string) { rows = rows.filter((row) => row[key] !== value); return query; },
        lt(key: string, value: string) { rows = rows.filter((row) => row[key] < value); return query; },
        lte(key: string, value: string) { rows = rows.filter((row) => row[key] <= value); return query; },
        then(resolve: (result: unknown) => unknown) {
          return Promise.resolve({ count: rows.length, error: failure ? { message: 'Database unavailable' } : null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as Pick<SupabaseClient, 'from'>;
  return { supabase, queried };
}

test('badge count matches overview thresholds and counts overlapping room issues independently', async () => {
  const { supabase, queried } = client();
  const expected = buildOwnerAttentionItems({
    now: now.toISOString(), stays, inspections,
    maintenanceIssues: issues.filter((issue) => issue.status === 'open'),
    roomNumberById: new Map([['r1', '101']]),
  }).length;
  assert.equal(expected, 3);
  assert.equal(await getOwnerAttentionCount(supabase, now), expected);
  assert.deepEqual(queried, ['stays', 'inspection_requirements', 'maintenance_issues']);
});

test('empty attention queues return zero', async () => {
  assert.equal(await getOwnerAttentionCount(client(false, true).supabase, now), 0);
});

test('database failures are surfaced instead of showing an all-clear badge', async () => {
  await assert.rejects(getOwnerAttentionCount(client(true).supabase, now), /Database unavailable/);
});
