import {
  INSPECTION_WAITING_THRESHOLD_MS,
  MAINTENANCE_BLOCKED_THRESHOLD_MS,
} from './owner-overview-thresholds';

export type OwnerAttentionKind = 'departure' | 'inspection' | 'maintenance';

export type OwnerAttentionItem = {
  id: string;
  roomId: string;
  roomNumber: string;
  kind: OwnerAttentionKind;
  occurredAt: string;
  href: string;
  version?: number;
  inspectionStatus?: string;
};

type StayObservation = {
  id: string;
  room_id: string;
  departure_due_at: string;
  status: string;
};

type InspectionObservation = {
  id: string;
  room_id: string;
  due_at: string;
  status: string;
};

type MaintenanceObservation = {
  id: string;
  room_id: string;
  reported_at: string;
  version?: number;
};

type BuildOwnerAttentionItemsInput = {
  now: string;
  stays: StayObservation[];
  inspections: InspectionObservation[];
  maintenanceIssues: MaintenanceObservation[];
  roomNumberById: Map<string, string>;
};

function validTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function buildOwnerAttentionItems({
  now,
  stays,
  inspections,
  maintenanceIssues,
  roomNumberById,
}: BuildOwnerAttentionItemsInput): OwnerAttentionItem[] {
  const nowTimestamp = validTimestamp(now);
  if (nowTimestamp === null) return [];

  const items: OwnerAttentionItem[] = [];
  const addItem = (item: OwnerAttentionItem, thresholdMs: number) => {
    const occurredAt = validTimestamp(item.occurredAt);
    if (occurredAt === null || nowTimestamp - occurredAt < thresholdMs) return;
    items.push(item);
  };

  for (const stay of stays) {
    if (stay.status !== 'active') continue;
    const occurredAt = validTimestamp(stay.departure_due_at);
    if (occurredAt === null || occurredAt >= nowTimestamp) continue;
    addItem({
      id: stay.id,
      roomId: stay.room_id,
      roomNumber: roomNumberById.get(stay.room_id) ?? '—',
      kind: 'departure',
      occurredAt: stay.departure_due_at,
      href: '/departure-due',
    }, 0);
  }

  for (const inspection of inspections) {
    if (inspection.status === 'approved') continue;
    addItem({
      id: inspection.id,
      roomId: inspection.room_id,
      roomNumber: roomNumberById.get(inspection.room_id) ?? '—',
      kind: 'inspection',
      occurredAt: inspection.due_at,
      href: '/inspections',
      inspectionStatus: inspection.status,
    }, INSPECTION_WAITING_THRESHOLD_MS);
  }

  for (const issue of maintenanceIssues) {
    addItem({
      id: issue.id,
      roomId: issue.room_id,
      roomNumber: roomNumberById.get(issue.room_id) ?? '—',
      kind: 'maintenance',
      occurredAt: issue.reported_at,
      href: '/maintenance',
      version: issue.version,
    }, MAINTENANCE_BLOCKED_THRESHOLD_MS);
  }

  return items.sort((left, right) => {
    const timeDifference = validTimestamp(left.occurredAt)! - validTimestamp(right.occurredAt)!;
    return timeDifference || left.id.localeCompare(right.id);
  });
}

export function getOwnerRoomState(
  isActive: boolean,
  occupied: boolean,
  inspection: boolean,
  blocked: boolean,
) {
  return {
    occupied,
    inspection,
    blocked,
    ready: isActive && !occupied && !inspection && !blocked,
  };
}