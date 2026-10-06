import type { SupabaseClient } from '@supabase/supabase-js';
import { INSPECTION_WAITING_THRESHOLD_MS, MAINTENANCE_BLOCKED_THRESHOLD_MS } from './owner-overview-thresholds';

/** Count attention items in the database without fetching overview records. Uses the caller's RLS-scoped client. */
export async function getOwnerAttentionCount(supabase: Pick<SupabaseClient, 'from'>, now = new Date()): Promise<number> {
  const timestamp = now.getTime();
  const results = await Promise.all([
    supabase.from('stays').select('id', { count: 'exact', head: true })
      .eq('status', 'active').lt('departure_due_at', now.toISOString()),
    supabase.from('inspection_requirements').select('id', { count: 'exact', head: true })
      .neq('status', 'approved').lte('due_at', new Date(timestamp - INSPECTION_WAITING_THRESHOLD_MS).toISOString()),
    supabase.from('maintenance_issues').select('id', { count: 'exact', head: true })
      .eq('status', 'open').lte('reported_at', new Date(timestamp - MAINTENANCE_BLOCKED_THRESHOLD_MS).toISOString()),
  ]);

  let total = 0;
  for (const result of results) {
    if (result.error) throw new Error(`Unable to load owner attention count: ${result.error.message}`);
    if (result.count === null) throw new Error('Unable to load owner attention count: count was not returned.');
    total += result.count;
  }
  return total;
}
