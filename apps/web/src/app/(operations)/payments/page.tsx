import { PageFoundation } from '@/components/page-foundation';
import { requireStaffProfile } from '@/features/auth/staff-profile';

export default async function PaymentsPage() {
  await requireStaffProfile(['owner']);
  return <PageFoundation title="Payment view is ready" description="Arrival and extension payments will be recorded separately and grouped by the day received." />;
}
