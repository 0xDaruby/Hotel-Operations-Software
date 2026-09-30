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

export function getActivityContextLabel(input: { roomNumber?: string | null; guestName?: string | null }): string {
  const room = input.roomNumber?.trim();
  const guest = input.guestName?.trim();
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
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
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
          : new Intl.DateTimeFormat('en-GB', { dateStyle: 'full' }).format(date);
      group = { key, label, events: [] };
      groups.set(key, group);
    }

    group.events.push(event);
  }

  return [...groups.values()];
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}