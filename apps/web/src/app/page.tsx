import { redirect } from 'next/navigation';
import { defaultRouteForRole, requireStaffProfile } from '@/features/auth/staff-profile';

export default async function HomePage() {
  const profile = await requireStaffProfile();
  redirect(defaultRouteForRole(profile.role));
}
