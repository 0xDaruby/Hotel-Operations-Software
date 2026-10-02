import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getActivityFeed, type ActivityEvent } from '@/features/activity/activity';
import { getInventory, type Inventory } from './inventory';
import { summarizeInventoryMetrics, type InventorySummary } from './inventory-summary';
import { buildOwnerAttentionItems, type OwnerAttentionItem } from './owner-overview-model';
import { toLagosDate } from '@/features/stays/format';
import { getPreviousOperatingDate, summarizePaymentTotals, type OwnerPaymentObservation, type OwnerPaymentTotals } from './owner-overview-payments';
import { getLagosOperatingDayBounds, summarizeOwnerMovement, type OwnerMovement } from './owner-overview-movement';

type StayRow = { id: string; room_id: string; departure_due_at: string; status: string };
type InspectionRow = { id: string; room_id: string; due_at: string; status: string };
type MaintenanceRow = { id: string; room_id: string; reported_at: string; version: number };
type PaymentRow = OwnerPaymentObservation & { kind: 'initial' | 'extension' };

export type OwnerOverviewData = {
  inventory: Inventory;
  summary: InventorySummary;
  occupancyPercent: number;
  attentionItems: OwnerAttentionItem[];
  occupiedRoomIds: string[];
  inspectionDueRoomIds: string[];
  maintenanceIssueCountByRoomId: Record<string, number>;
  now: string;
  paymentTotals: OwnerPaymentTotals;
  movement: OwnerMovement;
  teamPulseEvents: ActivityEvent[];
};

export const getOwnerOverviewData = cache(async function getOwnerOverviewData(): Promise<OwnerOverviewData> {
  const [inventory, supabase, teamPulseEvents] = await Promise.all([getInventory(), createClient(), getActivityFeed(5)]);
  const now = new Date().toISOString();
  const today = toLagosDate(now);
  const yesterday = getPreviousOperatingDate(today);
  const dayBounds = getLagosOperatingDayBounds(today);
  const [staysResult, inspectionsResult, maintenanceResult, paymentsResult, movementEventsResult] = await Promise.all([
    supabase.from('stays').select('id, room_id, departure_due_at, status').eq('status', 'active'),
    supabase.from('inspection_requirements').select('id, room_id, due_at, status').neq('status', 'approved'),
    supabase.from('maintenance_issues').select('id, room_id, reported_at, version').eq('status', 'open'),
    supabase.from('payment_records').select('amount, received_on, kind, stays(status)').in('received_on', [today, yesterday]),
    supabase.from('activity_events').select('action').gte('created_at', dayBounds.start).lt('created_at', dayBounds.end),
  ]);

  if (staysResult.error) throw new Error(`Unable to load active stays: ${staysResult.error.message}`);
  if (inspectionsResult.error) throw new Error(`Unable to load inspection status: ${inspectionsResult.error.message}`);
  if (maintenanceResult.error) throw new Error(`Unable to load maintenance status: ${maintenanceResult.error.message}`);
  if (paymentsResult.error) throw new Error(`Unable to load recent payment totals: ${paymentsResult.error.message}`);
  if (movementEventsResult.error) throw new Error(`Unable to load today's movement: ${movementEventsResult.error.message}`);

  const stays = (staysResult.data ?? []) as StayRow[];
  const inspections = (inspectionsResult.data ?? []) as InspectionRow[];
  const maintenanceIssues = (maintenanceResult.data ?? []) as MaintenanceRow[];
  const occupiedRoomIds = new Set(stays.map((stay) => stay.room_id));
  const inspectionDueRoomIds = new Set(inspections.map((inspection) => inspection.room_id));
  const maintenanceIssueCountByRoomId: Record<string, number> = {};
  for (const issue of maintenanceIssues) {
    maintenanceIssueCountByRoomId[issue.room_id] = (maintenanceIssueCountByRoomId[issue.room_id] ?? 0) + 1;
  }

  const summary = summarizeInventoryMetrics({
    rooms: inventory.rooms,
    occupiedRoomIds,
    inspectionDueRoomIds,
    maintenanceIssueCountByRoomId,
  });
  const roomNumberById = new Map(inventory.rooms.map((room) => [room.id, room.number]));
  const attentionItems = buildOwnerAttentionItems({
    now,
    stays,
    inspections,
    maintenanceIssues,
    roomNumberById,
  });
  const paymentRows = (paymentsResult.data ?? []) as PaymentRow[];
  const paymentTotals = summarizePaymentTotals(paymentRows, today, yesterday);
  const movement = summarizeOwnerMovement({
    events: (movementEventsResult.data ?? []) as Array<{ action: string }>,
    activeStays: stays,
    payments: paymentRows,
    now,
    today,
  });

  return {
    inventory,
    summary,
    occupancyPercent: summary.activeRooms === 0 ? 0 : Math.round((summary.occupiedRooms / summary.activeRooms) * 100),
    attentionItems,
    occupiedRoomIds: [...occupiedRoomIds],
    inspectionDueRoomIds: [...inspectionDueRoomIds],
    maintenanceIssueCountByRoomId,
    now,
    paymentTotals,
    movement,
    teamPulseEvents,
  };
});