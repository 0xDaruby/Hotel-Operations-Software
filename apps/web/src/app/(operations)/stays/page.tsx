import { PageFoundation } from '@/components/page-foundation';
import { requireStaffProfile } from '@/features/auth/staff-profile';

export default async function StaysPage() {
  await requireStaffProfile(['owner', 'receptionist']);
  return <PageFoundation title="Stay workspace is ready" description="Walk-in arrival, extension, room move, correction, and departure flows remain the next implementation layer." />;
}
