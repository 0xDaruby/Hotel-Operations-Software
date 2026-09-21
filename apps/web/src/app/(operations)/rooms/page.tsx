import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getInventory } from '@/features/inventory/inventory';
import { RoomBoard } from '@/features/inventory/room-board';
import { createClient } from '@/lib/supabase/server';

type RoomRow = { room_id: string };

export default async function RoomsPage() {
  await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  const inventory = await getInventory();
  const supabase = await createClient();
  const [stays, inspections, maintenance] = await Promise.all([
    supabase.from('stays').select('room_id').eq('status', 'active'),
    supabase.from('inspection_requirements').select('room_id').neq('status', 'approved'),
    supabase.from('maintenance_issues').select('room_id').eq('status', 'open'),
  ]);

  // A failed lookup must never make a room look Ready: show the error state instead.
  const failure = stays.error ?? inspections.error ?? maintenance.error;
  if (failure) throw new Error(`Unable to load room status: ${failure.message}`);

  const maintenanceIssueCountByRoomId: Record<string, number> = {};
  for (const row of (maintenance.data ?? []) as RoomRow[]) {
    maintenanceIssueCountByRoomId[row.room_id] = (maintenanceIssueCountByRoomId[row.room_id] ?? 0) + 1;
  }

  return (
    <RoomBoard
      {...inventory}
      occupiedRoomIds={((stays.data ?? []) as RoomRow[]).map((row) => row.room_id)}
      inspectionDueRoomIds={[...new Set(((inspections.data ?? []) as RoomRow[]).map((row) => row.room_id))]}
      maintenanceIssueCountByRoomId={maintenanceIssueCountByRoomId}
    />
  );
}