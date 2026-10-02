import { OperationsShell } from '@/components/operations-shell';
import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getOwnerOverviewData } from '@/features/inventory/owner-overview-data';
import { getOpenInspectionCount } from '@/features/inspections/inspections';
import { getOpenMaintenanceCount } from '@/features/maintenance/maintenance';

export default async function OperationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireStaffProfile();
  const [overview, inspectionCount, maintenanceCount] = await Promise.all([
    profile.role === 'owner' ? getOwnerOverviewData() : Promise.resolve(null),
    profile.role === 'supervisor' ? getOpenInspectionCount() : Promise.resolve(null),
    profile.role === 'supervisor' ? getOpenMaintenanceCount() : Promise.resolve(null),
  ]);
  return (
    <OperationsShell
      profile={profile}
      attentionCount={overview?.attentionItems.length ?? 0}
      inspectionCount={inspectionCount}
      maintenanceCount={maintenanceCount}
    >
      {children}
    </OperationsShell>
  );
}
