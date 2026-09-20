import { PageFoundation } from '@/components/page-foundation';
import { requireStaffProfile } from '@/features/auth/staff-profile';

export default async function OverviewPage() {
  await requireStaffProfile(['owner']);
  return <PageFoundation title="Overview structure is ready" description="Live room, stay, payment, and team activity summaries will be connected in the next feature slice." />;
}
