import { PageFoundation } from '@/components/page-foundation';
import { requireStaffProfile } from '@/features/auth/staff-profile';

export default async function RoomsPage() {
  await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  return <PageFoundation title="Room board structure is ready" description="The authenticated shell is prepared for the production room inventory and derived readiness model." />;
}
