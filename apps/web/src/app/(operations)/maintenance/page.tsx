import { requireStaffProfile } from '@/features/auth/staff-profile';
import { MaintenanceWorkspace } from '@/features/maintenance/maintenance-workspace';
import { getMaintenanceIssues, getMaintenanceReportableRooms } from '@/features/maintenance/maintenance';

export default async function MaintenancePage() {
  const profile = await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  const [issues, rooms] = await Promise.all([getMaintenanceIssues(), getMaintenanceReportableRooms()]);

  return (
    <MaintenanceWorkspace
      issues={issues}
      rooms={rooms}
      canReport={profile.role === 'owner' || profile.role === 'supervisor'}
      canResolve={profile.role === 'owner' || profile.role === 'supervisor'}
    />
  );
}
