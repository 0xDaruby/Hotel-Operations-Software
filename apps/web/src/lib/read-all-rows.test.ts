import test from 'node:test';
import assert from 'node:assert/strict';
import { readAllRows } from './read-all-rows';
type Row = { id: string };
function pages(source: () => Row[], cap = 500, failureAt = -1, mutate?: () => void) {
  let calls = 0;
  return () => {
    let cursor: string | undefined;
    const query = {
      gt(_column: string, value: string) { cursor = value; return query; },
      then(resolve: (result: { data: Row[] | null; count: number | null; error: { message: string } | null }) => unknown) {
        const failed = calls === failureAt;
        const rows = source().filter(row => cursor === undefined || row.id > cursor);
        const result = { data: failed ? null : rows.slice(0, cap), count: failed ? null : rows.length, error: failed ? { message: 'offline' } : null };
        calls++;
        if (calls === 1) mutate?.();
        return Promise.resolve(result).then(resolve);
      },
    };
    return query as unknown as ReturnType<Parameters<typeof readAllRows<Row>>[0]>;
  };
}
const ids = (count: number) => Array.from({ length: count }, (_, id) => ({ id: String(id).padStart(6, '0') }));
test('reads beyond 1000 records with a lower server cap', async () => {
  const rows = ids(1203);
  assert.deepEqual(await readAllRows(pages(() => rows, 100), 'rooms'), rows);
});
test('reads exact boundaries and empty datasets', async () => {
  const rows = ids(1000);
  assert.deepEqual(await readAllRows(pages(() => rows), 'payments'), rows);
  assert.deepEqual(await readAllRows(pages(() => []), 'rooms'), []);
});
test('rejects initial and later transport errors', async () => {
  await assert.rejects(readAllRows(pages(() => ids(3), 1, 0), 'payments'), /offline/);
  await assert.rejects(readAllRows(pages(() => ids(3), 1, 1), 'payments'), /offline/);
});
test('count-neutral deletion and replacement cannot silently skip a record', async () => {
  let rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
  await assert.rejects(readAllRows(pages(() => rows, 1, -1, () => {
    rows = [{ id: '2' }, { id: '3' }, { id: '4' }];
  }), 'inspections'), /records changed/);
});
test('fails closed on missing counts, stalled responses, and invalid ordering', async () => {
  for (const result of [
    { data: [], count: null, error: null },
    { data: [], count: 1, error: null },
    { data: [{ id: '2' }, { id: '1' }], count: 2, error: null },
  ]) {
    const query = { gt: () => query, then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    await assert.rejects(readAllRows(() => query as unknown as ReturnType<Parameters<typeof readAllRows<Row>>[0]>, 'rooms'), /complete|incomplete|order/);
  }
});
