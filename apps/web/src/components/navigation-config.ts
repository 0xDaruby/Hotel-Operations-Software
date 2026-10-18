import type { ReactNode } from 'react';
import {
  HistoryIcon,
  Home04Icon,
  Hotel02Icon,
  DepartureIcon,
  RepairIcon,
  TaskDaily02Icon,
  UserCheck01Icon,
  UserListIcon,
  Wallet02Icon,
  type IconProps,
} from '@/components/icons';
import type { StaffRole } from '@/features/auth/staff-profile';

export type NavigationEntry = {
  href: string;
  label: string;
  shortLabel: string;
  icon?: (props: IconProps) => ReactNode;
  roles: readonly StaffRole[];
  subtitle: string;
};

/**
 * Single source of truth for operations navigation.
 * `label` serves the desktop sidebar; `shortLabel` serves the mobile dock.
 */
export const navigation: NavigationEntry[] = [
  { href: '/overview', label: 'Hotel Overview', shortLabel: 'Overview', icon: Home04Icon, roles: ['owner'], subtitle: '' },
  { href: '/rooms', label: 'Room board', shortLabel: 'Rooms', icon: Hotel02Icon, roles: ['owner', 'receptionist', 'supervisor'], subtitle: '' },
  { href: '/stays', label: 'Guest stays', shortLabel: 'Stays', icon: UserCheck01Icon, roles: ['owner', 'receptionist'], subtitle: '' },
  { href: '/departure-due', label: 'Departure due', shortLabel: 'Depart', icon: DepartureIcon, roles: ['owner', 'receptionist'], subtitle: '' },
  { href: '/inspections', label: 'Inspections', shortLabel: 'Inspect', icon: TaskDaily02Icon, roles: ['owner', 'supervisor'], subtitle: '' },
  { href: '/maintenance', label: 'Maintenance', shortLabel: 'Fix-It', icon: RepairIcon, roles: ['owner', 'receptionist', 'supervisor'], subtitle: '' },
  { href: '/payments', label: 'Payments', shortLabel: 'Pay', icon: Wallet02Icon, roles: ['owner'], subtitle: '' },
  { href: '/activity', label: 'Activity log', shortLabel: 'History', icon: HistoryIcon, roles: ['owner', 'receptionist', 'supervisor'], subtitle: 'Who did what, and when. Times are shown in WAT.' },
  { href: '/staff', label: 'Staff', shortLabel: 'Staff', icon: UserListIcon, roles: ['owner'], subtitle: '' },
];

export function getNavigationForRole(role: StaffRole): NavigationEntry[] {
  return navigation.filter((item) => item.roles.includes(role));
}

export function getDockAttentionBadgeCount(
  href: string,
  attentionCount: number,
  inspectionCount: number | null = null,
  maintenanceCount: number | null = null,
  departureCount: number | null = null,
): number | null {
  if (href === '/overview') return attentionCount > 0 ? attentionCount : null;
  if (href === '/inspections') return inspectionCount !== null && inspectionCount > 0 ? inspectionCount : null;
  if (href === '/maintenance') return maintenanceCount !== null && maintenanceCount > 0 ? maintenanceCount : null;
  if (href === '/departure-due') return departureCount !== null && departureCount > 0 ? departureCount : null;
  return null;
}

/** Hard cap for the mobile dock so the capsule never overflows on small screens. */
export const DOCK_MAX_ITEMS = 6;

/**
 * Explicit dock priority per role. Receptionist and supervisor have few enough
 * destinations that every one fits; the owner's nine are prioritised down to
 * the dock cap with the remainder reachable via the Menu overflow control.
 */
export const dockOrder: Record<StaffRole, string[]> = {
  owner: ['/overview', '/stays', '/inspections', '/maintenance', '/payments'],
  receptionist: ['/rooms', '/stays', '/departure-due', '/maintenance', '/activity'],
  supervisor: ['/rooms', '/inspections', '/maintenance', '/activity'],
};

export type DockedNavigation = { docked: NavigationEntry[]; overflow: NavigationEntry[] };

export function getDockNavigation(role: StaffRole): DockedNavigation {
  const byHref = new Map(getNavigationForRole(role).map((item) => [item.href, item]));
  const docked = dockOrder[role]
    .map((href) => byHref.get(href))
    .filter((item): item is NavigationEntry => Boolean(item))
    .slice(0, DOCK_MAX_ITEMS);
  const dockedHrefs = new Set(docked.map((item) => item.href));
  const overflow = getNavigationForRole(role).filter((item) => !dockedHrefs.has(item.href));
  return { docked, overflow };
}

export type NavigationBadgeRequirements = {
  overview: boolean;
  inspections: boolean;
  maintenance: boolean;
  departures: boolean;
};

export function getNavigationBadgeRequirements(role: StaffRole): NavigationBadgeRequirements {
  const destinations = new Set(getNavigationForRole(role).map((item) => item.href));
  return {
    overview: destinations.has('/overview'),
    inspections: destinations.has('/inspections'),
    maintenance: destinations.has('/maintenance'),
    departures: destinations.has('/departure-due'),
  };
}
