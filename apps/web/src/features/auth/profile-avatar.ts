import type { StaffRole } from './staff-profile';

const profileAvatarInitials: Record<StaffRole, string> = {
  owner: 'M',
  supervisor: 'S',
  receptionist: 'R',
};

export function getProfileAvatarInitial(role: StaffRole): string {
  return profileAvatarInitials[role];
}