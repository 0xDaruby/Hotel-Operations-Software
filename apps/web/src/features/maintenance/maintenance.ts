import { readAllRows } from '@/lib/read-all-rows';
import { createClient } from '@/lib/supabase/server';

export type MaintenanceIssueType = 'air_conditioning' | 'furniture' | 'plumbing' | 'electrical' | 'other';

export type MaintenanceIssue = {
  id: string;
  roomId: string;
  roomNumber: string;
  issueType: MaintenanceIssueType;
  detail: string | null;
  reportedAt: string;
  version: number;
};

export type MaintenanceRoom = {
  id: string;
  roomNumber: string;
};

export async function getOpenMaintenanceCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('maintenance_issues')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  if (error) throw new Error(`Unable to load open maintenance count: ${error.message}`);
  if (count == null) throw new Error('Unable to load complete operational count.');
  return count;
}

export async function getMaintenanceIssues(): Promise<MaintenanceIssue[]> {
  const supabase = await createClient();
  const [issueRows, roomRows] = await Promise.all([
    readAllRows(
      (from, to) =>
        supabase
          .from('maintenance_issues')
          .select('id, room_id, issue_type, detail, reported_at, version', {
            count: 'exact',
          })
          .eq('status', 'open')

          .order('id', { ascending: true })
          .range(from, to),
      'maintenance issues',
    ),
    readAllRows(
      (from, to) =>
        supabase
          .from('rooms')
          .select('id, room_number', { count: 'exact' })
          .order('id', { ascending: true })
          .range(from, to),
      'rooms',
    ),
  ]);

  const roomNumberById = new Map(
    (roomRows ?? []).map((room: { id: string; room_number: string }) => [room.id, room.room_number]),
  );

  return ((issueRows ?? []) as Record<string, unknown>[])
    .map((row) => ({
      id: row.id as string,
      roomId: row.room_id as string,
      roomNumber: roomNumberById.get(row.room_id as string) ?? '—',
      issueType: row.issue_type as MaintenanceIssueType,
      detail: (row.detail as string | null) ?? null,
      reportedAt: row.reported_at as string,
      version: Number(row.version ?? 1),
    }))
    .filter((issue) => issue.id && issue.roomId)
    .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt) || a.id.localeCompare(b.id));
}

export async function getMaintenanceReportableRooms(): Promise<MaintenanceRoom[]> {
  const supabase = await createClient();
  const data = await readAllRows(
    (from, to) =>
      supabase
        .from('rooms')
        .select('id, room_number', { count: 'exact' })
        .eq('active', true)

        .order('id', { ascending: true })
        .range(from, to),
    'rooms',
  );

  return (data ?? []).map((room: { id: string; room_number: string }) => ({
    id: room.id,
    roomNumber: room.room_number,
  })).sort((a, b) => a.roomNumber.localeCompare(b.roomNumber) || a.id.localeCompare(b.id));
}
