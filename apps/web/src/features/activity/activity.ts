import { readAllRows } from '@/lib/read-all-rows';
import { createClient } from '@/lib/supabase/server';
import { ACTIVITY_PAGE_SIZE, activityCursorFilter, historyDateBounds, parseHistoryFilters } from './activity-query';
import type { ActivityCursor, HistoryFilters } from './activity-query';

export type ActivityEvent = {
  id: string;
  action: string;
  actorName: string;
  roomNumber: string | null;
  guestName: string | null;
  reason: string | null;
  createdAt: string;
  details: Record<string, unknown> | null;
};

export async function getActivityFeed(limit = 50, filters?: HistoryFilters, cursor?: ActivityCursor): Promise<ActivityEvent[]> {
  const supabase = await createClient();
  const requestedLimit = Math.max(0, Math.floor(limit));
  if (!Number.isFinite(requestedLimit)) throw new Error('Invalid activity limit.');
  if (requestedLimit === 0) return [];
  let query = supabase
    .from('activity_events')
    .select('id, action, actor_name, room_id, stay_id, reason, created_at, before_facts, after_facts', {
      count: 'exact',
    });
  if (filters) {
    const valid = parseHistoryFilters(filters);
    const domain = { stays: 'stay.%', inspections: 'inspection.%', maintenance: 'maintenance.%' };
    if (valid.category === 'other') query = query.not('action', 'like', 'stay.%').not('action', 'like', 'inspection.%').not('action', 'like', 'maintenance.%');
    else if (valid.category !== 'all') query = query.like('action', domain[valid.category]);
    const bounds = historyDateBounds(valid);
    if (bounds.from) query = query.gte('created_at', bounds.from);
    if (bounds.to) query = query.lt('created_at', bounds.to);
  }
  if (cursor) query = query.or(activityCursorFilter(cursor));
  const result = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, requestedLimit - 1);
  if (result.error) throw new Error(`Unable to load activity history: ${result.error.message}`);
  if (result.data == null || result.count == null || result.data.length !== Math.min(result.count, requestedLimit)) {
    throw new Error('Unable to load complete activity history.');
  }
  const data = result.data;

  const roomIds = [...new Set((data ?? []).map((row) => row.room_id).filter(Boolean))] as string[];
  const roomMap = new Map<string, string>();

  if (roomIds.length) {
    const roomRows = await readAllRows(
      (from, to) =>
        supabase
          .from('rooms')
          .select('id, room_number', { count: 'exact' })
          .in('id', roomIds)
          .order('id', { ascending: true })
          .range(from, to),
      'activity rooms',
    );
    for (const row of roomRows) roomMap.set(row.id, row.room_number);
  }

  const stayIds = [...new Set((data ?? []).map((row) => row.stay_id).filter(Boolean))] as string[];
  const stayNameMap = new Map<string, string>();

  if (stayIds.length) {
    const stayRows = await readAllRows(
      (from, to) =>
        supabase
          .from('stays')
          .select('id, guest_name', { count: 'exact' })
          .in('id', stayIds)
          .order('id', { ascending: true })
          .range(from, to),
      'activity stays',
    );
    for (const row of stayRows) stayNameMap.set(row.id, row.guest_name);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const roomId = typeof row.room_id === 'string' ? row.room_id : null;
    const stayId = typeof row.stay_id === 'string' ? row.stay_id : null;
    const roomNumber = roomId ? (roomMap.get(roomId) ?? null) : null;
    const guestName = stayId ? (stayNameMap.get(stayId) ?? null) : null;
    const details = {
      before: row.before_facts ?? null,
      after: row.after_facts ?? null,
    };

    return {
      id: String(row.id ?? ''),
      action: String(row.action ?? 'unknown.action'),
      actorName: String(row.actor_name ?? 'Staff member'),
      roomNumber,
      guestName,
      reason: typeof row.reason === 'string' ? row.reason : null,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      details,
    };
  });
}

export async function getActivityHistoryPage(filters: HistoryFilters, cursor?: ActivityCursor) {
  const rows = await getActivityFeed(ACTIVITY_PAGE_SIZE + 1, filters, cursor);
  const events = rows.slice(0, ACTIVITY_PAGE_SIZE);
  const last = events.at(-1);
  return { events, nextCursor: rows.length > ACTIVITY_PAGE_SIZE && last ? { id: last.id, createdAt: last.createdAt } : null };
}
