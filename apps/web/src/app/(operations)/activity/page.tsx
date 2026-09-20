import { PageFoundation } from '@/components/page-foundation';
import { requireStaffProfile } from '@/features/auth/staff-profile';

export default async function ActivityPage() {
  await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  return <PageFoundation title="Activity history is ready" description="Production events will show the actor, action, affected record, timestamp, and preserved correction reasons." />;
}
