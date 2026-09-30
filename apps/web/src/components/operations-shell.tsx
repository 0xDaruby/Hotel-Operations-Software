'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { StaffProfile, StaffRole } from '@/features/auth/staff-profile';
import { createClient } from '@/lib/supabase/client';
import { Home04Icon } from '@/components/icons';
import { getDockNavigation, getNavigationForRole } from '@/components/navigation-config';
import { MobileBottomDock } from '@/components/mobile-bottom-dock';

const navigation = getNavigationForRole;

const roleLabels: Record<StaffRole, string> = {
  owner: 'Owner / Manager',
  receptionist: 'Receptionist',
  supervisor: 'Supervisor',
};

export function OperationsShell({ children, profile }: { children: ReactNode; profile: StaffProfile }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = navigation(profile.role);
  const current = items.find((item) => item.href === pathname) ?? items[0];
  const { docked, overflow } = getDockNavigation(profile.role);
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
              <button className="menu-close" onClick={() => setMenuOpen(false)} type="button">Close</button>
          </div>
          <p className="nav-heading">Workspace</p>
          <nav className="main-nav" aria-label="Main navigation">
            {items.map((item) => (
              <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
                {item.icon ? <span className="nav-icon" aria-hidden="true"><item.icon className="icon icon-md" /></span> : null}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="sidebar-note">
          </div>
        </aside>

        {menuOpen ? <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} type="button" /> : null}

        <div className="workspace">
          <header className="topbar">
            <div className="hotel-context">
              <button className="menu-button" onClick={() => setMenuOpen(true)} type="button">Menu</button>
              <span className="hotel-symbol" aria-hidden="true"><Home04Icon className="icon icon-sm" /></span>
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
            <footer className="footer"><span></span><span>XYZ Hotel / Operations</span></footer>
          </main>
        </div>
      </div>

      <MobileBottomDock
        docked={docked}
        overflow={overflow}
        onOpenMenu={() => setMenuOpen(true)}
      />
    </>
  );
}
