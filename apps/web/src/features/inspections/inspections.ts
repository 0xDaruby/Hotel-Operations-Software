import { createClient } from '@/lib/supabase/server';

export type InspectionTrigger = 'departure' | 'daily';
export type InspectionStatus = 'pending' | 'attention' | 'access_blocked';

export type InspectionRequirement = {
  id: string;
  roomId: string;
  roomNumber: string;
  trigger: InspectionTrigger;
  status: InspectionStatus;
  dueAt: string;
  inspectionDay: string | null;
  findings: string | null;
  version: number;
};

export const DAILY_INSPECTION_CUTOFF_HOUR_LOCAL = 8;

export function isDailyInspectionDueAt(
  now: Date,
  isOccupied: boolean,
  hasUnresolvedDailyInspectionForToday: boolean,
): boolean {
  if (!isOccupied || hasUnresolvedDailyInspectionForToday) return false;

  const lagosNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  return lagosNow.getHours() >= DAILY_INSPECTION_CUTOFF_HOUR_LOCAL;
}

export async function getInspectionQueue(): Promise<InspectionRequirement[]> {
  const supabase = await createClient();
  const [{ data: requirementRows, error: requirementError }, { data: roomRows, error: roomError }] = await Promise.all([
    supabase
      .from('inspection_requirements')
      .select('id, room_id, trigger, status, due_at, inspection_day, findings, version')
      .neq('status', 'approved')
      .order('due_at', { ascending: true }),
    supabase.from('rooms').select('id, room_number'),
  ]);

  if (requirementError) throw new Error(`Unable to load inspection requirements: ${requirementError.message}`);
  if (roomError) throw new Error(`Unable to load rooms: ${roomError.message}`);

  const roomNumberById = new Map((roomRows ?? []).map((room: { id: string; room_number: string }) => [room.id, room.room_number]));

  return ((requirementRows ?? []) as Record<string, unknown>[])
    .map((row) => ({
      id: row.id as string,
      roomId: row.room_id as string,
      roomNumber: roomNumberById.get(row.room_id as string) ?? '—',
      trigger: row.trigger as InspectionTrigger,
      status: row.status as InspectionStatus,
      dueAt: row.due_at as string,
      inspectionDay: (row.inspection_day as string | null) ?? null,
      findings: (row.findings as string | null) ?? null,
      version: Number(row.version ?? 1),
    }))
    .filter((requirement) => requirement.id && requirement.roomId);
}
