import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getInventory } from '@/features/inventory/inventory';
import { InventoryOverview } from '@/features/inventory/inventory-overview';

export default async function OverviewPage() {
  await requireStaffProfile(['owner']);
  const inventory = await getInventory();
  return <InventoryOverview inventory={inventory} />;
}
