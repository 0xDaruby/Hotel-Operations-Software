import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getActivityFeed, type ActivityEvent } from '@/features/activity/activity';
import { getInventory, type Inventory } from './inventory';
import { summarizeInventoryMetrics, type InventorySummary } from './inventory-summary';
import { buildOwnerAttentionItems, type OwnerAttentionItem } from './owner-overview-model';
import { toLagosDate } from '@/features/stays/format';
import type { OwnerPaymentTotals } from './owner-overview-payments';
import type { OwnerMovement } from './owner-overview-movement';
import { getOwnerStatistics } from './owner-statistics';
import { readAllRows } from '@/lib/read-all-rows';

type StayRow = { id: string; room_id: string; departure_due_at: string; status: string };
type InspectionRow = { id: string; room_id: string; due_at: string; status: string };
type MaintenanceRow = { id: string; room_id: string; reported_at: string; version: number };

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
  const [stays, inspections, maintenanceIssues, statistics] = await Promise.all([
    readAllRows<StayRow>((from, to) => supabase.from('stays')
      .select('id, room_id, departure_due_at, status', { count: 'exact' }).eq('status', 'active').order('id').range(from, to), 'active stays'),
    readAllRows<InspectionRow>((from, to) => supabase.from('inspection_requirements')
      .select('id, room_id, due_at, status', { count: 'exact' }).neq('status', 'approved').order('id').range(from, to), 'inspection status'),
    readAllRows<MaintenanceRow>((from, to) => supabase.from('maintenance_issues')
      .select('id, room_id, reported_at, version', { count: 'exact' }).eq('status', 'open').order('id').range(from, to), 'maintenance status'),
    getOwnerStatistics(supabase, today, now),
  ]);
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
  const { paymentTotals, movement } = statistics;

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
