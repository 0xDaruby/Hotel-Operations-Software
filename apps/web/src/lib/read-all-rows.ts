type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
};
type PageQuery<T> = PromiseLike<PageResult<T>> & { gt: (column: string, value: string) => PromiseLike<PageResult<T>> };

/** Select id, count exactly and order only by id ASC. Separate requests are not a shared snapshot. */
export async function readAllRows<T>(
  page: (from: number, to: number) => PageQuery<T>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  let total: number | undefined;
  let cursor: string | undefined;
  do {
    const query = page(0, pageSize - 1);
    const result = await (cursor === undefined ? query : query.gt('id', cursor));
    if (result.error) throw new Error(`Unable to load ${label}: ${result.error.message}`);
    if (result.count == null || result.data == null) {
      throw new Error(`Unable to load complete ${label}.`);
    }
    if (total !== undefined && total - rows.length !== result.count) {
      throw new Error(`Unable to load complete ${label}: records changed while loading. Please retry.`);
    }
    total ??= result.count;
    if (result.data.length === 0 && rows.length < total) {
      throw new Error(`Unable to load ${label}: incomplete response.`);
    }
    for (const row of result.data) {
      const id = (row as { id?: unknown }).id;
      if (typeof id !== 'string' || (cursor !== undefined && id <= cursor)) {
        throw new Error(`Unable to load complete ${label}: invalid record order.`);
      }
      cursor = id;
      rows.push(row);
    }
  } while (rows.length < total);
  return rows;
}
