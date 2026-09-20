import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const staffRoles = ['owner', 'receptionist', 'supervisor'] as const;
export type StaffRole = (typeof staffRoles)[number];

export type StaffProfile = {
  userId: string;
  hotelId: string;
  displayName: string;
  role: StaffRole;
};

type StaffProfileRow = {
  user_id: string;
  hotel_id: string;
  display_name: string;
  role: string;
  active: boolean;
};

type StaffLookup =
  | { status: 'ready'; profile: StaffProfile }
  | { status: 'signed-out' | 'missing' | 'inactive' | 'invalid-role' };

function isStaffRole(value: string): value is StaffRole {
  return staffRoles.includes(value as StaffRole);
}

export const getStaffProfile = cache(async (): Promise<StaffLookup> => {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) return { status: 'signed-out' };

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('user_id, hotel_id, display_name, role, active')
    .eq('user_id', userData.user.id)
    .maybeSingle<StaffProfileRow>();

  if (error) throw new Error(`Unable to load the staff profile: ${error.message}`);
  if (!data) return { status: 'missing' };
  if (!data.active) return { status: 'inactive' };
  if (!isStaffRole(data.role)) return { status: 'invalid-role' };

  return {
    status: 'ready',
    profile: {
      userId: data.user_id,
      hotelId: data.hotel_id,
      displayName: data.display_name,
      role: data.role,
    },
  };
});

export async function requireStaffProfile(allowedRoles?: readonly StaffRole[]) {
  const result = await getStaffProfile();

  if (result.status === 'signed-out') redirect('/login');
  if (result.status !== 'ready') redirect(`/login?reason=${result.status}`);

  if (allowedRoles && !allowedRoles.includes(result.profile.role)) {
    redirect(defaultRouteForRole(result.profile.role));
  }

  return result.profile;
}

export function defaultRouteForRole(role: StaffRole) {
  if (role === 'owner') return '/overview';
  if (role === 'receptionist') return '/rooms';
  return '/inspections';
}
