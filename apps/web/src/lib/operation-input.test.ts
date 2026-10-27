import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as inputs from './operation-input';

const id = '11111111-1111-4111-8111-111111111111';
const arrival = { roomId: id, guestName: 'Ada', guestPhone: '', paidDays: 1, expectedAmount: 40000 };

test('operational input rejects malformed records, oversized text and unsafe numeric values', () => {
  for (const value of [null, [], {}, { ...arrival, guestName: null }, { ...arrival, roomId: "' OR true--" },
    { ...arrival, paidDays: '1' }, { ...arrival, paidDays: 1.5 }, { ...arrival, paidDays: 31 },
    { ...arrival, expectedAmount: Infinity }, { ...arrival, expectedAmount: NaN },
    { ...arrival, guestName: 'a'.repeat(201) }, { ...arrival, guestPhone: '1'.repeat(51) }]) {
    assert.equal(inputs.arrivalInput.safeParse(value).success, false);
  }
  assert.equal(inputs.extensionInput.safeParse({ stayId: id, addedDays: 1, expectedAmount: 1, expectedVersion: 0 }).success, false);
  assert.equal(inputs.voidInput.safeParse({ stayId: id, expectedVersion: 1, reason: 'a'.repeat(1001) }).success, false);
});

test('names and SQL-like text remain ordinary parameter data', () => {
  const guestName = "O'Connor'; DROP TABLE stays; --";
  const parsed = inputs.arrivalInput.parse({ ...arrival, guestName: ` ${guestName} `, guestPhone: ' +234 123 ' });
  assert.equal(parsed.guestName, guestName);
  assert.equal(parsed.guestPhone, '+234 123');
  assert.equal(inputs.arrivalInput.safeParse({ ...arrival, guestName: '王伟' }).success, true);
  assert.equal(inputs.arrivalInput.safeParse({ ...arrival, roomId: '30000000-0000-0000-0000-000000000001' }).success, true);
});

test('inspection and maintenance schemas preserve required evidence and 250-character bounds', () => {
  const inspection = { requirementId: id, outcome: 'approved', findings: '', personallyVerified: true, expectedVersion: 1 };
  assert.equal(inputs.inspectionInput.safeParse(inspection).success, true);
  for (const patch of [{ personallyVerified: false }, { personallyVerified: 'true' }, { outcome: 'attention' }, { outcome: 'invented' }, { findings: 'a'.repeat(251) }]) {
    assert.equal(inputs.inspectionInput.safeParse({ ...inspection, ...patch }).success, false);
  }
  assert.equal(inputs.inspectionInput.safeParse({ ...inspection, outcome: 'attention', findings: 'Needs cleaning' }).success, true);
  assert.equal(inputs.maintenanceReportInput.safeParse({ roomId: id, issueType: 'plumbing', detail: '' }).success, true);
  assert.equal(inputs.maintenanceReportInput.safeParse({ roomId: id, issueType: 'other', detail: ' ' }).success, false);
  assert.equal(inputs.maintenanceResolutionInput.safeParse({ issueId: id, resolutionDetail: '', expectedVersion: 1 }).success, false);
});

function actions(file: string) {
  let connections = 0;
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const exports: Record<string, (input: unknown) => Promise<{ ok: boolean }>> = {};
  const source = ts.transpileModule(readFileSync(new URL(`../features/${file}/actions.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, require(name: string) {
    if (name === 'next/cache') return { revalidatePath: () => {} };
    if (name === '@/lib/operation-input') return inputs;
    if (name === '@/lib/supabase/server') return { createClient: async () => {
      connections += 1;
      return { rpc: async (name: string, params: Record<string, unknown>) => { calls.push({ name, params }); return { error: { message: 'Denied by fixture' } }; } };
    } };
    throw Error(`Unexpected boundary ${name}`);
  } });
  return { exports, calls, connections: () => connections };
}

test('malformed server action input returns before creating a database client', async () => {
  for (const feature of ['stays', 'inspections', 'maintenance']) {
    const boundary = actions(feature);
    for (const action of Object.values(boundary.exports)) {
      for (const value of [null, {}, { guestName: 123, findings: null, detail: [] }]) assert.equal((await action(value)).ok, false);
    }
    assert.equal(boundary.connections(), 0);
    assert.equal(boundary.calls.length, 0);
  }
});

test('validated action forwards trimmed values to the fixed RPC without rewriting text', async () => {
  const boundary = actions('stays');
  await boundary.exports.recordArrivalAction({ ...arrival, guestName: " O'Connor ", guestPhone: ' ' });
  assert.equal(boundary.calls.length, 1);
  assert.equal(boundary.calls[0].name, 'record_arrival');
  assert.equal(boundary.calls[0].params.p_guest_name, "O'Connor");
  assert.equal(boundary.calls[0].params.p_guest_phone, null);
});
