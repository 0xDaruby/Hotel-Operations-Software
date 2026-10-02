import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getOwnerOverviewData } from '@/features/inventory/owner-overview-data';
import { InventoryOverview } from '@/features/inventory/inventory-overview';

export default async function OverviewPage() {
  await requireStaffProfile(['owner']);
  const overview = await getOwnerOverviewData();
  return <InventoryOverview {...overview} />;
}
