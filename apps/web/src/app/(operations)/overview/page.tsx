import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getInventory } from '@/features/inventory/inventory';
import { summarizeInventoryMetrics } from '@/features/inventory/inventory-summary';
import { InventoryOverview } from '@/features/inventory/inventory-overview';
import { createClient } from '@/lib/supabase/server';

export default async function OverviewPage() {
  await requireStaffProfile(['owner']);
  const inventory = await getInventory();
  const supabase = await createClient();

  const [staysResult, inspectionsResult, maintenanceResult] = await Promise.all([
    supabase.from('stays').select('room_id').eq('status', 'active'),
    supabase.from('inspection_requirements').select('room_id').neq('status', 'approved'),
    supabase.from('maintenance_issues').select('room_id').eq('status', 'open'),
  ]);

  if (staysResult.error) throw new Error(`Unable to load active stays: ${staysResult.error.message}`);
  if (inspectionsResult.error) throw new Error(`Unable to load inspection status: ${inspectionsResult.error.message}`);
  if (maintenanceResult.error) throw new Error(`Unable to load maintenance status: ${maintenanceResult.error.message}`);

  const occupiedRoomIds = (staysResult.data ?? []).map((row) => String((row as { room_id: string }).room_id));
  const inspectionDueRoomIds = (inspectionsResult.data ?? []).map((row) => String((row as { room_id: string }).room_id));
  const maintenanceIssueCountByRoomId: Record<string, number> = {};
  for (const row of maintenanceResult.data ?? []) {
    const roomId = String((row as { room_id: string }).room_id);
    maintenanceIssueCountByRoomId[roomId] = (maintenanceIssueCountByRoomId[roomId] ?? 0) + 1;
  }

  const summary = summarizeInventoryMetrics({
    rooms: inventory.rooms,
    occupiedRoomIds,
    inspectionDueRoomIds,
    maintenanceIssueCountByRoomId,
  });

  return <InventoryOverview inventory={inventory} summary={summary} />;
}
