export const activityFilters = ['all', 'stays', 'inspections', 'maintenance', 'other'] as const;
export type HistoryFilters = { category: typeof activityFilters[number]; from: string; to: string };
export type ActivityCursor = { createdAt: string; id: string };
export const ACTIVITY_PAGE_SIZE = 20;

export function parseHistoryFilters(input: Record<string, unknown>): HistoryFilters {
  const category = input.category ?? 'all';
  if (!activityFilters.includes(category as HistoryFilters['category'])) throw new Error('Choose a valid activity type.');
  const dates = [input.from ?? '', input.to ?? ''];
  for (const date of dates) {
    if (typeof date !== 'string' || (date !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date))) {
      throw new Error('Choose a valid date range.');
    }
  }
  const [from, to] = dates as string[];
  if (from && to && from > to) throw new Error('The end date must be on or after the start date.');
  return { category: category as HistoryFilters['category'], from, to };
}

export function activityCursorFilter(cursor: ActivityCursor): string {
  if (!cursor || typeof cursor.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id) || typeof cursor.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(cursor.createdAt) || !Number.isFinite(Date.parse(cursor.createdAt))) {
    throw new Error('Invalid activity cursor.');
  }
  // Preserve the database timestamp precision when several events share a second.
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

export function historyDateBounds(filters: HistoryFilters) {
  return {
    from: filters.from ? `${filters.from}T00:00:00+01:00` : null,
    to: filters.to ? new Date(Date.parse(`${filters.to}T00:00:00+01:00`) + 86400000).toISOString() : null,
  };
}
