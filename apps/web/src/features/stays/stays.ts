import { getStaffProfile, type StaffProfile } from '@/features/auth/staff-profile';
import { createClient } from '@/lib/supabase/server';
import { toLagosDate } from './format';

export { formatNaira, formatDateTime, toLagosDate } from './format';

export type Stay = {
  id: string;
  roomId: string;
  roomNumber: string;
  guestName: string;
  guestPhone: string | null;
  categoryId: string;
  categoryName: string;
  originalDailyRate: number;
  arrivalAt: string;
  departureDueAt: string;
  paidDays: number;
  status: 'active' | 'departed' | 'void';
  version: number;
  createdByName: string | null;
};

export type PaymentRecord = {
  id: string;
  stayId: string;
  kind: 'initial' | 'extension';
  amount: number;
  receivedOn: string;
  createdByName: string;
  createdAt: string;
};

export type OperationalContext = {
  hotelId: string;
  profile: StaffProfile;
  rooms: { id: string; roomNumber: string; categoryName: string; dailyRate: number }[];
  readyRooms: { id: string; roomNumber: string; categoryName: string; dailyRate: number }[];
  occupiedRoomIds: Set<string>;
  now: string;
  today: string;
};

export type StayTotals = {
  stayId: string;
  totalAmount: number;
  totalDays: number;
};

function stringValue(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string') return value;
  }
  return '';
}

function nullableString(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string') return value;
  }
  return null;
}

function numberValue(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function parseStay(row: Record<string, unknown>, roomNumberById: Map<string, string>, categoryNameById: Map<string, string>): Stay | null {
  const roomId = stringValue(row, 'room_id');
  const guestName = stringValue(row, 'guest_name')?.trim();
  if (!roomId || !guestName) return null;
  const categoryId = stringValue(row, 'category_id');

  const staffProfile = (() => {
    const sp = row.staff_profiles;
    if (sp && typeof sp === 'object' && !Array.isArray(sp) && 'display_name' in sp) {
      return (sp as { display_name?: string }).display_name ?? null;
    }
    if (Array.isArray(sp) && sp.length > 0 && typeof sp[0] === 'object' && sp[0] && 'display_name' in sp[0]) {
      return (sp[0] as { display_name?: string }).display_name ?? null;
    }
    return null;
  })();

  return {
    id: stringValue(row, 'id'),
    roomId,
    roomNumber: roomNumberById.get(roomId) ?? '—',
    guestName,
    guestPhone: nullableString(row, 'guest_phone'),
    categoryId,
    categoryName: categoryNameById.get(categoryId) ?? '—',
    originalDailyRate: numberValue(row, 'original_daily_rate') ?? 0,
    arrivalAt: stringValue(row, 'arrival_at'),
    departureDueAt: stringValue(row, 'departure_due_at'),
    paidDays: numberValue(row, 'paid_days') ?? 1,
    status: (stringValue(row, 'status') as Stay['status']) || 'active',
    version: numberValue(row, 'version') ?? 1,
    createdByName: staffProfile ?? nullableString(row, 'created_by_name'),
  };
}

export function getBlockedRoomIds(
  inspectionRows: Array<{ room_id?: string | null; status?: string | null }> = [],
  maintenanceRoomIds: Iterable<string> = [],
): Set<string> {
  const blockedRoomIds = new Set<string>();

  for (const row of inspectionRows) {
    if (row.room_id && row.status && row.status !== 'approved') blockedRoomIds.add(row.room_id);
  }

  for (const roomId of maintenanceRoomIds) {
    if (roomId) blockedRoomIds.add(roomId);
  }

  return blockedRoomIds;
}

export async function getOperationalContext(): Promise<OperationalContext> {
  const lookup = await getStaffProfile();
  if (lookup.status !== 'ready') throw new Error('No staff profile.');
  const profile = lookup.profile;
  const supabase = await createClient();

  const { data: roomRows } = await supabase
    .from('rooms')
    .select('id, room_number, category_id, active, room_categories(name, daily_rate)')
    .eq('active', true)
    .order('room_number', { ascending: true });
  const [{ data: inspectionRows }, { data: maintenanceRows }] = await Promise.all([
    supabase.from('inspection_requirements').select('room_id, status').neq('status', 'approved'),
    supabase.from('maintenance_issues').select('room_id').eq('status', 'open'),
  ]);
  const blockedRoomIds = getBlockedRoomIds(
    (inspectionRows ?? []) as Array<{ room_id?: string | null; status?: string | null }>,
    ((maintenanceRows ?? []) as Array<{ room_id?: string | null }>).map((row) => row.room_id ?? '').filter(Boolean),
  );
  const { data: activeStayRows } = await supabase
    .from('stays')
    .select('room_id')
    .eq('status', 'active');
  const occupiedRoomIds = new Set((activeStayRows ?? []).map((row: { room_id: string }) => row.room_id));

  const rooms: OperationalContext['rooms'] = [];
  const readyRooms: OperationalContext['readyRooms'] = [];
  for (const row of (roomRows ?? []) as Record<string, unknown>[]) {
    const id = row.id as string;
    const cat = (Array.isArray(row.room_categories) ? row.room_categories[0] : row.room_categories) as
      | { name?: string; daily_rate?: number }
      | undefined;
    const categoryName = (cat?.name as string) ?? '—';
    const dailyRate = Number(cat?.daily_rate ?? 0);
    const entry = { id, roomNumber: row.room_number as string, categoryName, dailyRate };
    rooms.push(entry);
    if (!occupiedRoomIds.has(id) && !blockedRoomIds.has(id)) readyRooms.push(entry);
  }

  return {
    hotelId: profile.hotelId,
    profile,
    rooms,
    readyRooms,
    occupiedRoomIds,
    now: new Date().toISOString(),
    today: toLagosDate(new Date().toISOString()),
  };
}

export async function getActiveStays(): Promise<Stay[]> {
  const supabase = await createClient();
  const [{ data: stayRows, error: stayError }, { data: roomRows }, { data: categoryRows }] = await Promise.all([
    supabase
      .from('stays')
      .select('id, room_id, guest_name, guest_phone, category_id, original_daily_rate, arrival_at, departure_due_at, paid_days, status, version, created_by, staff_profiles!created_by(display_name)')
      .eq('status', 'active')
      .order('arrival_at', { ascending: true }),
    supabase.from('rooms').select('id, room_number'),
    supabase.from('room_categories').select('id, name'),
  ]);

  if (stayError) throw new Error(`Unable to load active stays: ${stayError.message}`);

  const roomNumberById = new Map((roomRows ?? []).map((row: { id: string; room_number: string }) => [row.id, row.room_number]));
  const categoryNameById = new Map((categoryRows ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
  return ((stayRows ?? []) as Record<string, unknown>[])
    .map((row) => parseStay(row, roomNumberById, categoryNameById))
    .filter((stay): stay is Stay => stay !== null);
}

export async function getStayPayments(stayIds: string[]): Promise<PaymentRecord[]> {
  if (!stayIds.length) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('payment_records')
    .select('id, stay_id, kind, amount, received_on, created_by_name, created_at')
    .in('stay_id', stayIds)
    .order('created_at', { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    stayId: row.stay_id as string,
    kind: (row.kind as PaymentRecord['kind']) ?? 'initial',
    amount: Number(row.amount ?? 0),
    receivedOn: row.received_on as string,
    createdByName: (row.created_by_name as string) ?? '—',
    createdAt: row.created_at as string,
  }));
}

export async function getPaymentsForDate(date: string): Promise<{ payments: (PaymentRecord & { roomNumber: string })[]; total: number }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('payment_records')
    .select('id, stay_id, kind, amount, received_on, created_by_name, created_at, stays(status)')
    .eq('received_on', date)
    .order('created_at', { ascending: true });
  const rows = ((data ?? []) as Record<string, unknown>[]).filter((row) => {
    const stay = (Array.isArray(row.stays) ? row.stays[0] : row.stays) as { status?: string } | undefined;
    return stay?.status !== 'void';
  });
  const stayIds = [...new Set(rows.map((row) => row.stay_id as string))];
  const { data: stayRoomRows } = stayIds.length
    ? await supabase.from('stays').select('id, room_id').in('id', stayIds)
    : { data: [] as { id: string; room_id: string }[] };
  const stayRoomById = new Map((stayRoomRows ?? []).map((row: { id: string; room_id: string }) => [row.id, row.room_id]));
  const roomIds = [...new Set([...stayRoomById.values()])];
  const { data: roomRows } = roomIds.length
    ? await supabase.from('rooms').select('id, room_number').in('id', roomIds)
    : { data: [] as { id: string; room_number: string }[] };
  const roomNumberById = new Map((roomRows ?? []).map((row: { id: string; room_number: string }) => [row.id, row.room_number]));
  const payments = rows.map((row) => ({
    id: row.id as string,
    stayId: row.stay_id as string,
    kind: (row.kind as PaymentRecord['kind']) ?? 'initial',
    amount: Number(row.amount ?? 0),
    receivedOn: row.received_on as string,
    createdByName: (row.created_by_name as string) ?? '—',
    createdAt: row.created_at as string,
    roomNumber: roomNumberById.get(stayRoomById.get(row.stay_id as string) ?? '') ?? '—',
  }));
  return { payments, total: payments.reduce((sum, p) => sum + p.amount, 0) };
}

export async function getStayTotals(stayIds: string[]): Promise<Record<string, StayTotals>> {
  const payments = await getStayPayments(stayIds);
  const totals: Record<string, StayTotals> = {};
  for (const p of payments) {
    const entry = totals[p.stayId] ?? { stayId: p.stayId, totalAmount: 0, totalDays: 0 };
    entry.totalAmount += p.amount;
    entry.totalDays += p.kind === 'initial' ? 1 : 0;
    totals[p.stayId] = entry;
  }
  return totals;
}
