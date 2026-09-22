'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { StaffProfile, StaffRole } from '@/features/auth/staff-profile';
import { createClient } from '@/lib/supabase/client';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles: readonly StaffRole[];
  eyebrow: string;
  subtitle: string;
};

const navigation: NavItem[] = [
  { href: '/overview', label: 'Overview', icon: '◫', roles: ['owner'], eyebrow: 'The day, in view', subtitle: 'Room readiness, active stays, and the work that needs your attention.' },
  { href: '/rooms', label: 'Room board', icon: '▦', roles: ['owner', 'receptionist', 'supervisor'], eyebrow: 'Every room, one truth', subtitle: 'Occupancy, readiness, and maintenance — together.' },
  { href: '/stays', label: 'Guest stays', icon: '↗', roles: ['owner', 'receptionist'], eyebrow: 'Walk-in operations', subtitle: 'Arrivals, continuous stays, extensions, and departures.' },
  { href: '/departure-due', label: 'Departure due', icon: '⌛', roles: ['owner', 'receptionist'], eyebrow: 'Reception attention', subtitle: 'Review deadlines without making rooms vacant automatically.' },
  { href: '/inspections', label: 'Inspections', icon: '✓', roles: ['owner', 'supervisor'], eyebrow: 'Shared inspection queue', subtitle: 'Check rooms in person and keep the whole team current.' },
  { href: '/maintenance', label: 'Maintenance', icon: '◇', roles: ['owner', 'receptionist', 'supervisor'], eyebrow: 'Rooms needing attention', subtitle: 'See open issues and the rooms they block.' },
  { href: '/payments', label: 'Payments', icon: '₦', roles: ['owner'], eyebrow: 'Operational money view', subtitle: 'Staff-recorded payments grouped by the day received.' },
  { href: '/activity', label: 'Activity', icon: '◷', roles: ['owner', 'receptionist', 'supervisor'], eyebrow: 'Attributed history', subtitle: 'One shared record of who changed what and when.' },
  { href: '/staff', label: 'Staff', icon: '◎', roles: ['owner'], eyebrow: 'Owner access', subtitle: 'Review hotel staff profiles and account access.' },
];

const roleLabels: Record<StaffRole, string> = {
  owner: 'Owner / Manager',
  receptionist: 'Receptionist',
  supervisor: 'Supervisor',
};

export function OperationsShell({ children, profile }: { children: ReactNode; profile: StaffProfile }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = navigation.filter((item) => item.roles.includes(profile.role));
  const current = navigation.find((item) => item.href === pathname) ?? items[0];
  const initials = profile.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <div className="app-shell">
        <aside className={menuOpen ? 'sidebar sidebar-open' : 'sidebar'} aria-label="Hotel navigation">
          <div className="brand-row">
            <span className="brand-mark" aria-hidden="true">X</span>
            <span><strong>XYZ Hotel</strong><small>Operations desk</small></span>
            <button className="menu-close" onClick={() => setMenuOpen(false)} type="button" aria-label="Close navigation">×</button>
          </div>
          <p className="nav-heading">Workspace</p>
          <nav className="main-nav" aria-label="Main navigation">
            {items.map((item) => (
              <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="sidebar-note">
            <span><i aria-hidden="true" />A shared view of your hotel</span>
            <p>Every room. Every handover.<br />Every update accounted for.</p>
          </div>
        </aside>

        {menuOpen ? <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} type="button" /> : null}

        <div className="workspace">
          <header className="topbar">
            <div className="hotel-context">
              <button className="menu-button" onClick={() => setMenuOpen(true)} type="button" aria-label="Open navigation">☰</button>
              <span className="hotel-symbol" aria-hidden="true">⌂</span>
              <strong>Hotel operations</strong><span>/ Staff workspace</span>
            </div>
            <div className="profile-summary">
              <span className="profile-avatar" aria-hidden="true">{initials}</span>
              <span className="profile-copy"><strong>{profile.displayName}</strong><small>{roleLabels[profile.role]}</small></span>
              <button className="sign-out" onClick={signOut} type="button">Sign out</button>
            </div>
          </header>

          <main className="content" id="main-content" tabIndex={-1}>
            <header className="page-heading">
              <p className="eyebrow">{current?.eyebrow}</p>
              <h1>{current?.label}</h1>
              <p>{current?.subtitle}</p>
            </header>
            {children}
            <footer className="footer"><span>Production staff workspace</span><span>XYZ Hotel / Operations</span></footer>
          </main>
        </div>
      </div>
    </>
  );
}
