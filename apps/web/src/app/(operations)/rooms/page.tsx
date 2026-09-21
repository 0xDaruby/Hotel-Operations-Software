import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getInventory } from '@/features/inventory/inventory';
import { RoomBoard } from '@/features/inventory/room-board';
import { createClient } from '@/lib/supabase/server';

export default async function RoomsPage() {
  await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  const inventory = await getInventory();
  const supabase = await createClient();
  const [{ data: activeStayRows }, { data: inspectionRows }] = await Promise.all([
    supabase.from('stays').select('room_id').eq('status', 'active'),
    supabase.from('inspection_requirements').select('room_id').neq('status', 'approved'),
  ]);
  return (
    <RoomBoard
      {...inventory}
      occupiedRoomIds={(activeStayRows ?? []).map((row: { room_id: string }) => row.room_id)}
      blockedRoomIds={(inspectionRows ?? []).map((row: { room_id: string }) => row.room_id)}
    />
  );
}
