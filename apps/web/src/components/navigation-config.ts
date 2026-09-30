import type { ReactNode } from 'react';
import {
  BellDotIcon,
  Home04Icon,
  Hotel02Icon,
  HourglassOffIcon,
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
  eyebrow: string;
  subtitle: string;
};

/**
 * Single source of truth for operations navigation.
 * `label` serves the desktop sidebar; `shortLabel` serves the mobile dock.
 */
export const navigation: NavigationEntry[] = [
  { href: '/overview', label: 'Hotel Overview', shortLabel: 'Overview', icon: Home04Icon, roles: ['owner'], eyebrow: '', subtitle: '' },
  { href: '/rooms', label: 'Room board', shortLabel: 'Rooms', icon: Hotel02Icon, roles: ['owner', 'receptionist', 'supervisor'], eyebrow: '', subtitle: 'Occupancy, readiness, and maintenance — together.' },
  { href: '/stays', label: 'Guest stays', shortLabel: 'Stays', icon: UserCheck01Icon, roles: ['owner', 'receptionist'], eyebrow: 'Walk-in operations', subtitle: 'Arrivals, continuous stays, extensions, and departures.' },
  { href: '/departure-due', label: 'Departure due', shortLabel: 'Depart', icon: HourglassOffIcon, roles: ['owner', 'receptionist'], eyebrow: 'Reception attention', subtitle: 'Review deadlines without making rooms vacant automatically.' },
  { href: '/inspections', label: 'Inspections', shortLabel: 'Inspect', icon: TaskDaily02Icon, roles: ['owner', 'supervisor'], eyebrow: '', subtitle: '' },
  { href: '/maintenance', label: 'Maintenance', shortLabel: 'Fix-It', icon: RepairIcon, roles: ['owner', 'receptionist', 'supervisor'], eyebrow: 'Rooms needing attention', subtitle: 'See open issues and the rooms they block.' },
  { href: '/payments', label: 'Payments', shortLabel: 'Pay', icon: Wallet02Icon, roles: ['owner'], eyebrow: 'Operational money view', subtitle: 'Staff-recorded payments grouped by the day received.' },
  { href: '/activity', label: 'Activity', shortLabel: 'Activity', icon: BellDotIcon, roles: ['owner', 'receptionist', 'supervisor'], eyebrow: 'Attributed history', subtitle: 'One shared record of who changed what and when.' },
  { href: '/staff', label: 'Staff', shortLabel: 'Staff', icon: UserListIcon, roles: ['owner'], eyebrow: 'Owner access', subtitle: 'Review hotel staff profiles and account access.' },
];

export function getNavigationForRole(role: StaffRole): NavigationEntry[] {
  return navigation.filter((item) => item.roles.includes(role));
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
