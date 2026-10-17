import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as queryHelpers from './activity-query';
import { groupActivityEventsByDate } from './activity-view';

const { parseHistoryFilters, activityCursorFilter, historyDateBounds } = queryHelpers;

test('history filters reject malformed inputs and reversed or nonexistent dates', () => {
  for (const input of [{ category: 'unknown' }, { from: '2026-02-30' }, { from: ['2026-01-01'] }, { from: '2026-10-17', to: '2026-10-16' }]) assert.throws(() => parseHistoryFilters(input));
  assert.deepEqual(historyDateBounds(parseHistoryFilters({ from: '2026-10-17', to: '2026-10-17' })), { from: '2026-10-17T00:00:00+01:00', to: '2026-10-17T23:00:00.000Z' });
});

test('cursor retains microseconds and rejects query syntax in IDs and timestamps', () => {
  const cursor = { id: '00000000-0000-0000-0000-000000000001', createdAt: '2026-10-17T12:00:00.123456+00:00' };
  assert.ok(activityCursorFilter(cursor).includes(cursor.createdAt));
  assert.throws(() => activityCursorFilter({ ...cursor, id: 'x),id.gt.0' }));
  assert.throws(() => activityCursorFilter({ ...cursor, createdAt: '2026-10-17T12:00:00Z,id.gt.0' }));
});

test('grouping uses the hotel date even when UTC is still yesterday', () => {
  const event = { id: '1', action: 'stay.arrived', actorName: 'Ada', roomNumber: null, guestName: null, reason: null, details: null, createdAt: '2026-10-16T23:30:00Z' };
  assert.equal(groupActivityEventsByDate([event], new Date('2026-10-17T00:15:00Z'))[0].label, 'Today');
});

type Row = { id: string; action: string; created_at: string };
function reader(rows: Row[], fail = false) {
  const client = { from() {
    let selected = rows;
    let from = 0;
    let to = 20;
    const query = {
      select() { return query; },
      like(_column: string, pattern: string) { selected = selected.filter(row => row.action.startsWith(pattern.slice(0, -1))); return query; },
      not(_column: string, _operator: string, pattern: string) { selected = selected.filter(row => !row.action.startsWith(pattern.slice(0, -1))); return query; },
      gte(_column: string, date: string) { selected = selected.filter(row => Date.parse(row.created_at) >= Date.parse(date)); return query; },
      lt(_column: string, date: string) { selected = selected.filter(row => Date.parse(row.created_at) < Date.parse(date)); return query; },
      or(filter: string) { const match = /created_at.lt.([^,]+),and\(created_at.eq.([^,]+),id.lt.([^\)]+)\)/.exec(filter)!; selected = selected.filter(row => row.created_at < match[1] || (row.created_at === match[2] && row.id < match[3])); return query; },
      order() { selected = [...selected].sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)); return query; },
      range(start: number, end: number) { from = start; to = end; return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: fail ? null : selected.slice(from, to + 1), count: selected.length, error: fail ? { message: 'offline' } : null }).then(resolve); },
    };
    return query;
  } };
  const source = ts.transpileModule(readFileSync(new URL('./activity.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<{ events: { id: string }[]; nextCursor: unknown }>> = {};
  runInNewContext(source, { exports, require(name: string) { if (name === './activity-query') return queryHelpers; if (name === '@/lib/supabase/server') return { createClient: async () => client }; if (name === '@/lib/read-all-rows') return {}; throw new Error(name); } });
  return exports.getActivityHistoryPage;
}
const rows = Array.from({ length: 65 }, (_, i) => ({ id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, action: i < 5 ? 'maintenance.reported' : 'stay.arrived', created_at: '2026-10-17T12:00:00.123456+00:00' }));

test('history pages reach every record beyond fifty without duplicating timestamp ties', async () => {
  const load = reader(rows);
  let cursor: unknown;
  const ids: string[] = [];
  do {
    const page = await load(parseHistoryFilters({}), cursor);
    assert.ok(page.events.length <= 20);
    ids.push(...Array.from(page.events, event => event.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 65);
  assert.equal(new Set(ids).size, 65);
});

test('category filters search records beyond the initial page and date boundaries exclude next day', async () => {
  const load = reader([...rows, { id: '00000000-0000-0000-0000-999999999999', action: 'maintenance.reported', created_at: '2026-10-17T23:00:00.000000+00:00' }]);
  const page = await load(parseHistoryFilters({ category: 'maintenance', from: '2026-10-17', to: '2026-10-17' }));
  assert.equal(page.events.length, 5);
  assert.equal(page.nextCursor, null);
  await assert.rejects(reader(rows, true)(parseHistoryFilters({})), /offline/);
});
