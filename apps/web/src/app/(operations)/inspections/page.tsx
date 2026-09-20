import { PageFoundation } from '@/components/page-foundation';
import { requireStaffProfile } from '@/features/auth/staff-profile';

export default async function InspectionsPage() {
  await requireStaffProfile(['owner', 'supervisor']);
  return <PageFoundation title="Shared inspection queue is ready" description="Supervisor completion will be attributed to the signed-in profile without assignments or inspection claims." />;
}
