'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import type { StaffProfile, StaffRole } from '@/features/auth/staff-profile';
import { getProfileAvatarInitial } from '@/features/auth/profile-avatar';
import { createClient } from '@/lib/supabase/client';
import { Home04Icon, Menu02Icon, XIcon } from '@/components/icons';
import { getDockNavigation, getNavigationForRole } from '@/components/navigation-config';
import { MobileBottomDock } from '@/components/mobile-bottom-dock';

const navigation = getNavigationForRole;

const roleLabels: Record<StaffRole, string> = {
  owner: 'Owner / Manager',
  receptionist: 'Receptionist',
  supervisor: 'Supervisor',
};

export function OperationsShell({ children, profile, attentionCount, inspectionCount, maintenanceCount }: {
  children: ReactNode;
  profile: StaffProfile;
  attentionCount: number;
  inspectionCount: number | null;
  maintenanceCount: number | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const suppressClickUntil = useRef(0);
  const items = navigation(profile.role);
  const current = items.find((item) => item.href === pathname) ?? items[0];
  const { docked, overflow } = getDockNavigation(profile.role);
  // When every destination fits the mobile dock there is nothing left for the
  // drawer to offer, so its mobile surfaces (drawer, Menu button, backdrop)
  // are skipped. Desktop keeps the persistent sidebar for all roles.
  const hasDrawerOverflow = overflow.length > 0;
  const avatarInitial = getProfileAvatarInitial(profile.role);

  useEffect(() => {
    if (profile.role !== 'owner' || !hasDrawerOverflow) return;
    const mobile = window.matchMedia('(max-width: 760px)');
    let gesture: { x: number; y: number; progress: number; horizontal: boolean } | null = null;
    function start(event: TouchEvent) {
      if (!mobile.matches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [role="slider"], [role="dialog"]')) return;
      if (!menuOpen && touch.clientX > 28) return;
      gesture = { x: touch.clientX, y: touch.clientY, progress: menuOpen ? 1 : 0, horizontal: false };
    }
    function move(event: TouchEvent) {
      if (!gesture) return;
      if (event.touches.length !== 1 || !mobile.matches) { cancel(); return; }
      const dx = event.touches[0].clientX - gesture.x;
      const dy = event.touches[0].clientY - gesture.y;
      if (!gesture.horizontal) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { cancel(); return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        gesture.horizontal = true;
      }
      if (event.cancelable) event.preventDefault();
      const width = sidebarRef.current?.getBoundingClientRect().width || 300;
      gesture.progress = Math.max(0, Math.min(1, (menuOpen ? 1 : 0) + dx / width));
      setDragProgress(gesture.progress);
    }
    function end() {
      if (gesture?.horizontal) {
        suppressClickUntil.current = Date.now() + 350;
        setMenuOpen(gesture.progress >= .35);
      }
      cancel();
    }
    function click(event: MouseEvent) {
      if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); }
    }
    function cancel() { gesture = null; setDragProgress(null); }
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', cancel);
    document.addEventListener('click', click, true);
    mobile.addEventListener('change', cancel);
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', cancel);
      document.removeEventListener('click', click, true);
      mobile.removeEventListener('change', cancel);
    };
  }, [profile.role, hasDrawerOverflow, menuOpen]);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 760px)');
    if (!menuOpen || !mobile.matches) return;
    function resize() { if (!mobile.matches) setMenuOpen(false); }
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector<HTMLButtonElement>('.menu-close')?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
      if (event.key !== 'Tab') return;
      const controls = sidebarRef.current?.querySelectorAll<HTMLElement>('button, a[href]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    mobile.addEventListener('change', resize);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', keyboard);
      mobile.removeEventListener('change', resize);
      previous?.focus();
    };
  }, [menuOpen]);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <div className={`app-shell${dragProgress !== null ? ' drawer-dragging' : ''}`} style={dragProgress !== null ? { '--drawer-progress': dragProgress } as CSSProperties : undefined}>
        <aside
          ref={sidebarRef}
          id="hotel-navigation"
          className={[
            'sidebar',
            menuOpen && hasDrawerOverflow ? 'sidebar-open' : '',
            hasDrawerOverflow ? '' : 'sidebar-no-drawer',
          ].filter(Boolean).join(' ')}
          aria-label="Hotel navigation"
        >
          <div className="brand-row">
            <span className="brand-mark" aria-hidden="true">X</span>
            <span><strong>XYZ Hotel</strong><small>Operations desk</small></span>
              <button className="menu-close" onClick={() => setMenuOpen(false)} type="button" aria-label="Close"><XIcon className="icon icon-md" aria-hidden="true" /></button>
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

        {hasDrawerOverflow ? <button className={`nav-backdrop${menuOpen ? ' nav-backdrop-open' : ''}`} tabIndex={-1} aria-hidden={!menuOpen} aria-label="Close navigation" onClick={() => setMenuOpen(false)} type="button" /> : null}

        <div className="workspace">
          <header className="topbar">
            <div className="hotel-context">
              {hasDrawerOverflow ? <button className="menu-button" onClick={() => setMenuOpen(true)} type="button" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="hotel-navigation"><Menu02Icon className="icon icon-md" aria-hidden="true" /></button> : null}
              <span className="hotel-symbol" aria-hidden="true"><Home04Icon className="icon icon-sm" /></span>
              <strong>Hotel Operations</strong><span>/ Staff workspace</span>
            </div>
            <div className="profile-summary">
              <span className="profile-avatar" aria-hidden="true">{avatarInitial}</span>
              <span className="profile-copy"><strong>{profile.displayName}</strong><small>{roleLabels[profile.role]}</small></span>
              <button className="sign-out" onClick={signOut} type="button">Sign out</button>
            </div>
          </header>

          <main key={pathname} className="content page-motion" id="main-content" tabIndex={-1}>
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
        attentionCount={attentionCount}
        inspectionCount={inspectionCount}
        maintenanceCount={maintenanceCount}
        onOpenMenu={() => setMenuOpen(true)}
      />
    </>
  );
}
