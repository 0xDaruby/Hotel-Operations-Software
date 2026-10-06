import { OperationsShell } from '@/components/operations-shell';
import { OperationsRefresh } from '@/components/operations-refresh';
import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getOwnerAttentionCount } from '@/features/inventory/owner-attention-count';
import { createClient } from '@/lib/supabase/server';
import { getOpenInspectionCount } from '@/features/inspections/inspections';
import { getOpenMaintenanceCount } from '@/features/maintenance/maintenance';
import { getDockBadgeRequirements } from '@/components/navigation-config';

export default async function OperationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireStaffProfile();
  const badgeRequirements = getDockBadgeRequirements(profile.role);
  const [attentionCount, inspectionCount, maintenanceCount] = await Promise.all([
    badgeRequirements.overview ? createClient().then((supabase) => getOwnerAttentionCount(supabase)) : Promise.resolve(0),
    badgeRequirements.inspections ? getOpenInspectionCount() : Promise.resolve(null),
    badgeRequirements.maintenance ? getOpenMaintenanceCount() : Promise.resolve(null),
  ]);
  return (
    <OperationsShell
      profile={profile}
      attentionCount={attentionCount}
      inspectionCount={inspectionCount}
      maintenanceCount={maintenanceCount}
    >
      <OperationsRefresh />
      {children}
    </OperationsShell>
  );
}
