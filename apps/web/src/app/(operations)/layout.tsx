import { OperationsShell } from '@/components/operations-shell';
import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getOwnerOverviewData } from '@/features/inventory/owner-overview-data';
import { getOpenInspectionCount } from '@/features/inspections/inspections';
import { getOpenMaintenanceCount } from '@/features/maintenance/maintenance';
import { getDockBadgeRequirements } from '@/components/navigation-config';

export default async function OperationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireStaffProfile();
  const badgeRequirements = getDockBadgeRequirements(profile.role);
  const [overview, inspectionCount, maintenanceCount] = await Promise.all([
    badgeRequirements.overview ? getOwnerOverviewData() : Promise.resolve(null),
    badgeRequirements.inspections ? getOpenInspectionCount() : Promise.resolve(null),
    badgeRequirements.maintenance ? getOpenMaintenanceCount() : Promise.resolve(null),
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
