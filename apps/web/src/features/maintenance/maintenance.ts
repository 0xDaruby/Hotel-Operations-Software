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

export async function getMaintenanceIssues(): Promise<MaintenanceIssue[]> {
  const supabase = await createClient();
  const [{ data: issueRows, error: issueError }, { data: roomRows, error: roomError }] = await Promise.all([
    supabase
      .from('maintenance_issues')
      .select('id, room_id, issue_type, detail, reported_at, version')
      .eq('status', 'open')
      .order('reported_at', { ascending: true }),
    supabase.from('rooms').select('id, room_number'),
  ]);

  if (issueError) throw new Error(`Unable to load maintenance issues: ${issueError.message}`);
  if (roomError) throw new Error(`Unable to load rooms: ${roomError.message}`);

  const roomNumberById = new Map((roomRows ?? []).map((room: { id: string; room_number: string }) => [room.id, room.room_number]));

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
    .filter((issue) => issue.id && issue.roomId);
}

export async function getMaintenanceReportableRooms(): Promise<MaintenanceRoom[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rooms')
    .select('id, room_number')
    .eq('active', true)
    .order('room_number', { ascending: true });

  if (error) throw new Error(`Unable to load rooms: ${error.message}`);

  return (data ?? []).map((room: { id: string; room_number: string }) => ({
    id: room.id,
    roomNumber: room.room_number,
  }));
}
