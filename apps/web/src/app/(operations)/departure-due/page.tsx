import { PageFoundation } from '@/components/page-foundation';
import { requireStaffProfile } from '@/features/auth/staff-profile';

export default async function DepartureDuePage() {
  await requireStaffProfile(['owner', 'receptionist']);
  return <PageFoundation title="Departure queue is ready" description="Due stays will remain occupied here until reception explicitly confirms departure." />;
}
