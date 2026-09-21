import { requireStaffProfile } from '@/features/auth/staff-profile';
import { InspectionWorkspace } from '@/features/inspections/inspection-workspace';
import { getInspectionQueue } from '@/features/inspections/inspections';

export default async function InspectionsPage() {
  const profile = await requireStaffProfile(['owner', 'supervisor']);
  const requirements = await getInspectionQueue();
  return <InspectionWorkspace requirements={requirements} canRecord={profile.role === 'supervisor'} />;
}