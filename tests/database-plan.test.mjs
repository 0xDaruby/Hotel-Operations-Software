import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildPlan, verifyPlan, writeBootstrap } from '../scripts/database-plan.mjs';

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'hotel-plan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, 'supabase/bootstrap'), { recursive: true });
  await mkdir(resolve(root, 'supabase/migrations'));
  for (const [file, sql] of Object.entries({
    'bootstrap/foundation.sql': 'CREATE TABLE example (id integer);',
    'bootstrap/repair-scheduler.sql': 'SELECT 4;',
    'migrations/0001_start.sql': 'SELECT 1;',
    'migrations/0004_broken.sql': 'BROKEN;',
    'migrations/0005_next.sql': 'SELECT 5;',
  })) await writeFile(resolve(root, 'supabase', file), sql);
  return root;
}

test('clean replay substitutes scheduler repair and preserves immutable source hash', async t => {
  const root = await fixture(t);
  const plan = await buildPlan(root);
  assert.deepEqual(plan.steps.map(step => step.id), ['foundation', '0001', '0004', '0005']);
  assert.equal(plan.steps[2].file, 'supabase/bootstrap/repair-scheduler.sql');
  assert.equal(plan.steps[2].historicalFile, 'supabase/migrations/0004_broken.sql');
  const output = resolve(root, 'clean.sql');
  await writeBootstrap(root, plan, output);
  const sql = await readFile(output, 'utf8');
  assert.ok(sql.indexOf('SELECT 1;') < sql.indexOf('SELECT 4;'));
  assert.ok(sql.indexOf('SELECT 4;') < sql.indexOf('SELECT 5;'));
  assert.doesNotMatch(sql, /BROKEN/);
  await assert.rejects(writeBootstrap(root, plan, output), /EEXIST/);
});

test('checks detect changed executed SQL, changed historical SQL, and added migration', async t => {
  const root = await fixture(t);
  const saved = await buildPlan(root);
  assert.equal(verifyPlan(saved, await buildPlan(root)), true);
  await writeFile(resolve(root, 'supabase/bootstrap/repair-scheduler.sql'), 'SELECT 44;');
  let current = await buildPlan(root);
  assert.throws(() => verifyPlan(saved, current), /changed/);
  await writeFile(resolve(root, 'supabase/bootstrap/repair-scheduler.sql'), 'SELECT 4;');
  await writeFile(resolve(root, 'supabase/migrations/0004_broken.sql'), 'OTHER BROKEN;');
  current = await buildPlan(root);
  assert.throws(() => verifyPlan(saved, current), /changed/);
  await writeFile(resolve(root, 'supabase/migrations/0004_broken.sql'), 'BROKEN;');
  await writeFile(resolve(root, 'supabase/migrations/0006_added.sql'), 'SELECT 6;');
  current = await buildPlan(root);
  assert.throws(() => verifyPlan(saved, current), /changed/);
});

test('rejects duplicate migration versions instead of silently ordering ambiguous SQL', async t => {
  const root = await fixture(t);
  await writeFile(resolve(root, 'supabase/migrations/0005_duplicate.sql'), 'SELECT 55;');
  await assert.rejects(buildPlan(root), /Duplicate migration/);
});

test('manifest is stable across Git CRLF and LF checkouts', async t => {
  const root = await fixture(t);
  const file = resolve(root, 'supabase/migrations/0001_start.sql');
  await writeFile(file, 'SELECT 1;\nSELECT 2;\n');
  const lf = await buildPlan(root);
  await writeFile(file, 'SELECT 1;\r\nSELECT 2;\r\n');
  assert.equal(verifyPlan(lf, await buildPlan(root)), true);
});
