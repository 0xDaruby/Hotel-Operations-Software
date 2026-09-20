import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getInventory } from '@/features/inventory/inventory';
import { RoomBoard } from '@/features/inventory/room-board';

export default async function RoomsPage() {
  await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  const inventory = await getInventory();
  return <RoomBoard {...inventory} />;
}
