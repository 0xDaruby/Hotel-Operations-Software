import { OperationsShell } from '@/components/operations-shell';
import { requireStaffProfile } from '@/features/auth/staff-profile';

export default async function OperationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireStaffProfile();
  return <OperationsShell profile={profile}>{children}</OperationsShell>;
}
