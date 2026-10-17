import type { ActivityEvent } from './activity';

export function formatActivityAction(action: string): string {
  const map: Record<string, string> = {
    'stay.arrived': 'Arrival recorded',
    'stay.extended': 'Stay extended',
    'stay.departed': 'Departure confirmed',
    'stay.moved': 'Room moved',
    'stay.corrected': 'Stay corrected',
    'stay.voided': 'Stay voided',
    'inspection.approved': 'Inspection approved',
    'inspection.attention': 'Inspection flagged',
    'inspection.access_blocked': 'Inspection blocked',
    'maintenance.reported': 'Maintenance reported',
    'maintenance.resolved': 'Maintenance resolved',
  };

  if (map[action]) return map[action];
  return action
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .join(' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getActivityContextLabel(input: { roomNumber?: string | null; guestName?: string | null; details?: ActivityEvent['details'] }): string {
  const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const before = record(input.details?.before);
  const after = record(input.details?.after);
  const text = (...values: unknown[]) => values.find((value): value is string => typeof value === 'string' && value.trim() !== '')?.trim();
  const room = text(after.to_room, after.room, before.room, input.roomNumber);
  const guest = text(after.guest, before.guest, input.guestName);
  if (room && guest) return `Room ${room} · ${guest}`;
  if (room) return `Room ${room}`;
  if (guest) return guest;
  return 'General record';
}

export type ActivityCategory = 'stays' | 'inspections' | 'maintenance' | 'other';
export type ActivityFilter = 'all' | ActivityCategory;

export type ActivityDayGroup = {
  key: string;
  label: string;
  events: ActivityEvent[];
};

export function getActivityCategory(action: string): ActivityCategory {
  const domain = action.split('.')[0];
  if (domain === 'stay') return 'stays';
  if (domain === 'inspection') return 'inspections';
  if (domain === 'maintenance') return 'maintenance';
  return 'other';
}

export function groupActivityEventsByDate(events: ActivityEvent[], now = new Date()): ActivityDayGroup[] {
  const todayKey = localDateKey(now);
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayKey = localDateKey(yesterday);
  const groups = new Map<string, ActivityDayGroup>();

  for (const event of events) {
    const date = new Date(event.createdAt);
    const key = localDateKey(date);
    let group = groups.get(key);

    if (!group) {
      const label = key === todayKey
        ? 'Today'
        : key === yesterdayKey
          ? 'Yesterday'
          : new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: 'Africa/Lagos' }).format(date);
      group = { key, label, events: [] };
      groups.set(key, group);
    }

    group.events.push(event);
  }

  return [...groups.values()];
}

function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
