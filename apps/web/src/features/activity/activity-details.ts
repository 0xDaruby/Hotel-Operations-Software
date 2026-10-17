import type { ActivityEvent } from './activity';

type Facts = Record<string, unknown>;
export type ActivityDetail = { label: string; value: string; previous?: string };
export type ActivityDetails = { items: ActivityDetail[]; note: string | null };

function facts(value: unknown): Facts {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Facts : {};
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

const labels: Record<string, string> = {
  days: 'Length of stay', paid_days: 'Length of stay', rate: 'Daily rate',
  amount: 'Payment recorded', extension_amount: 'Extension payment', recorded_amount: 'Recorded stay amount',
  arrival: 'Arrival', departure_due: 'Departure due', departed_at: 'Departure confirmed at',
  guest: 'Guest name', guest_phone: 'Guest phone', room: 'Room',
  from_room: 'Previous room', to_room: 'New room',
  issue_type: 'Issue', detail: 'Reported problem', resolution_detail: 'Resolution',
  findings: 'Findings', trigger: 'Inspection for', status: 'Status',
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (['amount', 'rate', 'extension_amount', 'recorded_amount'].includes(key)) {
      return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
    }
    if (key === 'days' || key === 'paid_days') return `${value} ${value === 1 ? 'day' : 'days'}`;
    return String(value);
  }
  if (typeof value === 'string') {
    if (['arrival', 'departure_due', 'departed_at'].includes(key) && Number.isFinite(Date.parse(value))) {
      return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(value)) + ' WAT';
    }
    if (key === 'trigger') return value === 'daily' ? 'Daily check' : value === 'departure' ? 'After departure' : value.replace(/_/g, ' ');
    if (key === 'issue_type' || key === 'status') return value.replace(/_/g, ' ').replace(/^./, char => char.toUpperCase());
    return value;
  }
  return '';
}

/** Event facts are partial snapshots: an absent key never means a value was removed. */
export function getActivityDetails(event: Pick<ActivityEvent, 'action' | 'details' | 'reason'>): ActivityDetails {
  const before = facts(event.details?.before);
  const after = facts(event.details?.after);
  const items: ActivityDetail[] = [];
  const handled = new Set<string>();
  let note = event.reason?.trim() || null;

  function add(key: string, compare = false, source: Facts = after, label = labels[key] ?? key.replace(/_/g, ' ').replace(/^./, char => char.toUpperCase())) {
    handled.add(key);
    const current = source[key];
    if (current === undefined || (typeof current === 'object' && current !== null)) return;
    if (compare && Object.hasOwn(before, key) && Object.hasOwn(after, key)) {
      if (JSON.stringify(before[key]) === JSON.stringify(current)) return;
      if (hasValue(before[key])) {
        items.push({ label, previous: formatValue(key, before[key]), value: formatValue(key, current) });
        return;
      }
    }
    if (hasValue(current)) items.push({ label, value: formatValue(key, current) });
  }

  switch (event.action) {
    case 'stay.arrived':
      ['days', 'rate', 'amount', 'arrival', 'departure_due'].forEach(key => add(key));
      break;
    case 'stay.extended':
      add('paid_days', true);
      add('departure_due', true);
      add('extension_amount');
      break;
    case 'stay.moved':
      if (hasValue(after.from_room) && hasValue(after.to_room)) {
        items.push({ label: 'Room', previous: `Room ${after.from_room}`, value: `Room ${after.to_room}` });
        handled.add('from_room');
        handled.add('to_room');
      } else {
        add('from_room');
        add('to_room');
      }
      break;
    case 'stay.corrected':
      ['guest', 'guest_phone', 'paid_days', 'departure_due', 'recorded_amount'].forEach(key => add(key, true));
      break;
    case 'stay.departed':
      add('departed_at');
      add('departure_due', false, before, 'Scheduled departure');
      break;
    case 'stay.voided':
      break;
    case 'inspection.approved':
    case 'inspection.attention':
    case 'inspection.access_blocked':
      add('trigger');
      add('findings');
      if (note === after.findings) note = null;
      break;
    case 'maintenance.reported':
      add('issue_type');
      add('detail');
      if (note === after.detail) note = null;
      break;
    case 'maintenance.resolved':
      add('issue_type', false, hasValue(after.issue_type) ? after : before);
      add('detail', false, before);
      add('resolution_detail');
      if (note === after.resolution_detail) note = null;
      break;
  }

  // Identity and workflow bookkeeping already have a home in the event heading.
  const contextual = new Set(['room', 'guest', 'inspection_triggered']);
  if (event.action.startsWith('stay.') || event.action.startsWith('inspection.') || event.action.startsWith('maintenance.')) contextual.add('status');
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (handled.has(key) || contextual.has(key) || /(?:^id$|_id$|^version$)/.test(key)) continue;
    // Keep future scalar facts readable without exposing raw objects or inferring missing values.
    if (Object.hasOwn(after, key)) add(key, true);
    else if (hasValue(before[key])) add(key, false, before, `Previously recorded ${labels[key]?.toLowerCase() ?? key.replace(/_/g, ' ')}`);
  }
  return { items, note };
}
