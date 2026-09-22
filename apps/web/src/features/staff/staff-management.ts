import { createClient } from '@/lib/supabase/server';

export type StaffMember = {
  userId: string;
  displayName: string;
  email: string | null;
  role: 'owner' | 'receptionist' | 'supervisor';
  active: boolean;
  hotelId: string;
};

export async function getStaffMembers(): Promise<StaffMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('user_id, display_name, role, active, hotel_id')
    .order('display_name', { ascending: true });

  if (error) throw new Error(`Unable to load staff members: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    userId: String(row.user_id ?? ''),
    displayName: String(row.display_name ?? 'Unnamed staff'),
    email: null,
    role: (row.role as StaffMember['role']) ?? 'receptionist',
    active: Boolean(row.active),
    hotelId: String(row.hotel_id ?? ''),
  }));
}

export async function getCurrentHotelId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('hotel_id')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (profileError) throw new Error(`Unable to load hotel context: ${profileError.message}`);
  return profile?.hotel_id ?? null;
}
