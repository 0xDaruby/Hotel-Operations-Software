'use server';

import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getActivityHistoryPage } from './activity';
import { parseHistoryFilters } from './activity-query';
import type { ActivityCursor, HistoryFilters } from './activity-query';

export async function loadOlderActivity(filters: HistoryFilters, cursor: ActivityCursor) {
  await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  try {
    return { page: await getActivityHistoryPage(parseHistoryFilters(filters), cursor), error: null };
  } catch {
    return { page: null, error: 'Could not load older activity. Please try again.' };
  }
}
