import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isTransientAuthError } from './session-access';

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
  setup_pending: boolean;
};

type StaffLookup =
  | { status: 'ready'; profile: StaffProfile }
  | { status: 'signed-out' | 'missing' | 'inactive' | 'invalid-role' | 'setup-pending' | 'revoked' | 'deleted' };

function isStaffRole(value: string): value is StaffRole {
  return staffRoles.includes(value as StaffRole);
}

export const getStaffProfile = cache(async (): Promise<StaffLookup> => {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError && isTransientAuthError(userError)) throw Error('Authentication is temporarily unavailable.');
  if (userError || !userData.user) return { status: 'signed-out' };

  const access = await supabase.rpc('get_staff_access_status');
  // Rolling upgrade: retain the original active-profile check until 0014 is installed.
  if (access.error && access.error.code !== 'PGRST202') throw Error('Staff session could not be verified.');
  if (!access.error && access.data !== 'ready') {
    if (access.data === 'deleted') return { status: 'deleted' };
    if (access.data === 'inactive') return { status: 'inactive' };
    if (access.data === 'setup-pending') return { status: 'setup-pending' };
    return { status: 'revoked' };
  }

  const { data, error } = await supabase
    .from('staff_profiles')
    // Existing schema remains usable before the additive setup migration.
    // A missing setup_pending field is false; all existing role/active checks
    // still apply. No new account can be provisioned without its RPC migration.
    .select('*')
    .eq('user_id', userData.user.id)
    .maybeSingle<StaffProfileRow>();

  if (error) throw new Error(`Unable to load the staff profile: ${error.message}`);
  if (!data) return { status: 'missing' };
  if (data.setup_pending) return { status: 'setup-pending' };
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
  if (result.status === 'setup-pending') redirect('/set-password');
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
