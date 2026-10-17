import type { SupabaseClient } from '@supabase/supabase-js';

/** Active stays overdue or due within 24 hours, using the caller's hotel-scoped RLS client. */
export async function getDepartureAttentionCount(supabase: Pick<SupabaseClient, 'from'>, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase.from('stays')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .lte('departure_due_at', cutoff);

  if (error) throw new Error(`Unable to load departure attention count: ${error.message}`);
  if (count == null) throw new Error('Unable to load departure attention count: count was not returned.');
  return count;
}
