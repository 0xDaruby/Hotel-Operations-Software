import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readAllRows } from './read-all-rows';

type Row = Record<string, unknown>;
const features = fileURLToPath(new URL('../features/', import.meta.url));

// Execute the actual reader modules with a Supabase-shaped transport, without
// requiring a live authentication cookie or changing their production contracts.
function loadReader(file: string, failedTable?: string, payments?: Row[]) {
  const seed: Record<string, Row[]> = {
    rooms: [{ id: 'room-1', room_id: 'room-1', room_number: '101', active: true }],
    room_categories: [{ id: 'category-1', name: 'Standard' }],
    stays: [{ id: 'stay-1', room_id: 'room-1', guest_name: 'Ada', status: 'active' }],
    inspection_requirements: [{ id: 'inspection-1', room_id: 'room-1', status: 'pending' }],
    maintenance_issues: [{ id: 'maintenance-1', room_id: 'room-1', status: 'open' }],
    payment_records: payments ?? [
      {
        id: 'payment-1',
        stay_id: 'stay-1',
        amount: 50,
        stays: { status: 'active' },
      },
    ],
    activity_events: [{ id: 'event-1', room_id: 'room-1', stay_id: 'stay-1' }],
  };
  const client = {
    from(table: string) {
      let head = false;
      let cursor: string | undefined;
      let start = 0;
      let end = 499;
      const result = (from = 0, to = 499) => ({
        data: failedTable === table || head ? null : (seed[table] ?? []).filter(row => cursor === undefined || String(row.id) > cursor).sort((a,b) => String(a.id).localeCompare(String(b.id))).slice(from, Math.min(to + 1, from + 100)),
        count: failedTable === table ? null : (seed[table] ?? []).filter(row => cursor === undefined || String(row.id) > cursor).length,
        error: failedTable === table ? { message: 'transport failed' } : null,
      });
      const query = {
        select(_columns: string, options?: { head?: boolean }) {
          head = options?.head ?? false;
          return query;
        },
        eq() {
          return query;
        },
        neq() {
          return query;
        },
        in() {
          return query;
        },
        order() {
          return query;
        },
        range(from: number, to: number) {
          start = from;
          end = to;
          return query;
        },
        gt(_column: string, value: string) { cursor = value; return query; },
        then(onFulfilled: (value: ReturnType<typeof result>) => unknown) {
          return Promise.resolve(result(start, end)).then(onFulfilled);
        },
      };
      return query;
    },
  };
  const source = ts.transpileModule(readFileSync(resolve(features, file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports: Record<string, (...args: never[]) => Promise<unknown>> = {};
  runInNewContext(source, {
    exports,
    require(name: string) {
      if (name === '@/lib/supabase/server') return { createClient: async () => client };
      if (name === '@/features/auth/staff-profile')
        return {
          getStaffProfile: async () => ({
            status: 'ready',
            profile: { hotelId: 'hotel-1' },
          }),
        };
      if (name === '@/lib/read-all-rows') return { readAllRows };
      if (name === './format') return { toLagosDate: () => '2026-10-16' };
      if (name === './inventory-summary') return {};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return exports;
}

const failures: [string, string, string[], unknown[]][] = [
  ['stays/stays.ts', 'getOperationalContext', ['rooms', 'inspection_requirements', 'maintenance_issues', 'stays'], []],
  ['stays/stays.ts', 'getActiveStays', ['stays', 'rooms', 'room_categories'], []],
  ['stays/stays.ts', 'getStayPayments', ['payment_records'], [['stay-1']]],
  ['stays/stays.ts', 'getPaymentsForDate', ['payment_records', 'stays', 'rooms'], ['2026-10-16']],
  ['inventory/inventory.ts', 'getInventory', ['rooms', 'room_categories'], []],
  ['inspections/inspections.ts', 'getInspectionQueue', ['inspection_requirements', 'rooms'], []],
  ['maintenance/maintenance.ts', 'getMaintenanceIssues', ['maintenance_issues', 'rooms'], []],
  ['maintenance/maintenance.ts', 'getMaintenanceReportableRooms', ['rooms'], []],
  ['activity/activity.ts', 'getActivityFeed', ['activity_events', 'rooms', 'stays'], []],
  ['inspections/inspections.ts', 'getOpenInspectionCount', ['inspection_requirements'], []],
  ['maintenance/maintenance.ts', 'getOpenMaintenanceCount', ['maintenance_issues'], []],
];

for (const [file, operation, tables, args] of failures) {
  for (const table of tables) {
    test(`${operation} rejects a failed ${table} read`, async () => {
      const reader = loadReader(file, table)[operation];
      await assert.rejects(reader(...(args as never[])), /transport failed/);
    });
  }
}

test('payment display remains chronological while paging by immutable id', async () => {
  const payments = [
    { id: 'a', stay_id: 'stay-1', amount: 50, created_at: '2026-10-16T13:00:00.000Z' },
    { id: 'b', stay_id: 'stay-1', amount: 50, created_at: '2026-10-16T12:00:00.000Z' },
  ];
  const result = await loadReader('stays/stays.ts', undefined, payments).getStayPayments(['stay-1'] as never) as { id: string }[];
  assert.deepEqual(Array.from(result, row => row.id), ['b', 'a']);
});

test('daily payment totals include every record beyond the response cap', async () => {
  const payments = Array.from({ length: 1201 }, (_, id) => ({
    id: String(id).padStart(6, '0'),
    created_at: '2026-10-16T12:00:00.000Z',
    stay_id: 'stay-1',
    amount: 50,
    stays: { status: 'active' },
  }));
  const result = (await loadReader('stays/stays.ts', undefined, payments).getPaymentsForDate(
    '2026-10-16' as never,
  )) as {
    payments: unknown[];
    total: number;
  };
  assert.equal(result.payments.length, 1201);
  assert.equal(result.total, 60050);
});
