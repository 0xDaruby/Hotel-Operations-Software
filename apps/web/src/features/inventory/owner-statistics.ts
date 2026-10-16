import type { SupabaseClient } from '@supabase/supabase-js';
import type { OwnerPaymentTotals } from './owner-overview-payments';
import type { OwnerMovement } from './owner-overview-movement';
import { readAllRows } from '@/lib/read-all-rows';
import { getPreviousOperatingDate, summarizePaymentTotals, type OwnerPaymentObservation } from './owner-overview-payments';
import { getLagosOperatingDayBounds, summarizeOwnerMovement } from './owner-overview-movement';

export type OwnerStatistics = { paymentTotals: OwnerPaymentTotals; movement: OwnerMovement };

/** Aggregate under the caller's RLS policies; errors never become zero totals. */
export async function getOwnerStatistics(
  supabase: Pick<SupabaseClient, 'rpc' | 'from'>,
  today: string,
  now: string,
): Promise<OwnerStatistics> {
  const { data, error } = await supabase.rpc('get_owner_statistics', { p_today: today, p_now: now });
  // Rolling upgrade: only a missing RPC permits the old RLS-scoped read path.
  // All transport/permission failures remain explicit; no zero-total fallback.
  if (error?.code === 'PGRST202') {
    const yesterday = getPreviousOperatingDate(today);
    const bounds = getLagosOperatingDayBounds(today);
    const [payments, events, stays] = await Promise.all([
      readAllRows<OwnerPaymentObservation & { id: string; kind: 'initial' | 'extension' }>(
        (from, to) => supabase.from('payment_records')
          .select('id, amount, received_on, kind, stays(status)', { count: 'exact' })
          .in('received_on', [today, yesterday]).order('id').range(from, to), 'recent payments'),
      readAllRows<{ id: string; action: string }>(
        (from, to) => supabase.from('activity_events').select('id, action', { count: 'exact' })
          .gte('created_at', bounds.start).lt('created_at', bounds.end).order('id').range(from, to), 'movement'),
      readAllRows<{ id: string; departure_due_at: string }>(
        (from, to) => supabase.from('stays').select('id, departure_due_at', { count: 'exact' })
          .eq('status', 'active').order('id').range(from, to), 'active stays'),
    ]);
    return {
      paymentTotals: summarizePaymentTotals(payments, today, yesterday),
      movement: summarizeOwnerMovement({ payments, events, activeStays: stays, today, now }),
    };
  }
  if (error) throw new Error(`Unable to load owner statistics: ${error.message}`);
  if (!data || typeof data !== 'object') throw new Error('Owner statistics are incomplete.');
  const facts = data as Record<string, unknown>;
  function values(key: string, keys: string[]) {
    const group = facts[key];
    if (!group || typeof group !== 'object') throw new Error('Owner statistics are incomplete.');
    const record = group as Record<string, unknown>;
    for (const field of keys) {
      if (typeof record[field] !== 'number' || !Number.isFinite(record[field]) || record[field] < 0) {
        throw new Error('Owner statistics contain invalid values.');
      }
    }
  }
  values('paymentTotals', ['today', 'yesterday']);
  values('movement', ['arrivals', 'departures', 'extensions', 'departuresDueSoon', 'initialPayments', 'extensionPayments']);
  return data as OwnerStatistics;
}
