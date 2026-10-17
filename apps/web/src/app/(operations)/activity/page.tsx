import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getActivityHistoryPage } from '@/features/activity/activity';
import { parseHistoryFilters } from '@/features/activity/activity-query';
import { ActivityFeed } from '@/features/activity/activity-feed';

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  let filters;
  let filterError;
  try { filters = parseHistoryFilters(await searchParams); }
  catch (error) {
    filterError = error instanceof Error ? error.message : 'Choose valid filters.';
    filters = parseHistoryFilters({});
  }
  const initialPage = await getActivityHistoryPage(filters);
  return <section className="activity-page" aria-labelledby="workspace-page-heading">
    <ActivityFeed key={JSON.stringify(filters)} initialPage={initialPage} filters={filters} filterError={filterError} />
  </section>;
}
