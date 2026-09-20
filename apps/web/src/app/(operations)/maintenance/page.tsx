import { PageFoundation } from '@/components/page-foundation';
import { requireStaffProfile } from '@/features/auth/staff-profile';

export default async function MaintenancePage() {
  await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  return <PageFoundation title="Maintenance workspace is ready" description="Open issues will remain separate from cleanliness and will block room assignment through backend rules." />;
}
