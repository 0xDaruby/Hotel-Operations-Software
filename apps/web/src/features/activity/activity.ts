import { createClient } from '@/lib/supabase/server';

export type ActivityEvent = {
  id: string;
  action: string;
  actorName: string;
  roomNumber: string | null;
  guestName: string | null;
  reason: string | null;
  createdAt: string;
  details: Record<string, unknown> | null;
};

export function formatActivityAction(action: string) {
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

export function getActivityContextLabel(input: { roomNumber?: string | null; guestName?: string | null }) {
  const room = input.roomNumber?.trim();
  const guest = input.guestName?.trim();
  if (room && guest) return `Room ${room} · ${guest}`;
  if (room) return `Room ${room}`;
  if (guest) return guest;
  return 'General record';
}

export async function getActivityFeed(limit = 50): Promise<ActivityEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('activity_events')
    .select('id, action, actor_name, room_id, stay_id, reason, created_at, before_facts, after_facts')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Unable to load activity history: ${error.message}`);

  const roomIds = [...new Set((data ?? []).map((row) => row.room_id).filter(Boolean))] as string[];
  const roomMap = new Map<string, string>();

  if (roomIds.length) {
    const { data: roomRows, error: roomError } = await supabase
      .from('rooms')
      .select('id, room_number')
      .in('id', roomIds);

    if (!roomError) {
      for (const row of roomRows ?? []) {
        roomMap.set(row.id, row.room_number);
      }
    }
  }

  const stayIds = [...new Set((data ?? []).map((row) => row.stay_id).filter(Boolean))] as string[];
  const stayNameMap = new Map<string, string>();

  if (stayIds.length) {
    const { data: stayRows, error: stayError } = await supabase
      .from('stays')
      .select('id, guest_name')
      .in('id', stayIds);

    if (!stayError) {
      for (const row of stayRows ?? []) {
        stayNameMap.set(row.id, row.guest_name);
      }
    }
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const roomId = typeof row.room_id === 'string' ? row.room_id : null;
    const stayId = typeof row.stay_id === 'string' ? row.stay_id : null;
    const roomNumber = roomId ? roomMap.get(roomId) ?? null : null;
    const guestName = stayId ? stayNameMap.get(stayId) ?? null : null;
    const details = {
      before: row.before_facts ?? null,
      after: row.after_facts ?? null,
    };

    return {
      id: String(row.id ?? ''),
      action: String(row.action ?? 'unknown.action'),
      actorName: String(row.actor_name ?? 'Staff member'),
      roomNumber,
      guestName,
      reason: typeof row.reason === 'string' ? row.reason : null,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      details,
    };
  });
}
