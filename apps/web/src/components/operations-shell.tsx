'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StaffProfile } from '@/features/auth/staff-profile';
import { Home04Icon, Menu02Icon, XIcon } from '@/components/icons';
import { getDockNavigation, getNavigationForRole } from '@/components/navigation-config';
import { MobileBottomDock } from '@/components/mobile-bottom-dock';
import { SidebarNavigation } from '@/components/sidebar-navigation';
import { StaffProfileMenu } from '@/components/staff-profile-menu';

const navigation = getNavigationForRole;

export function OperationsShell({ children, profile, attentionCount, inspectionCount, maintenanceCount, departureCount }: {
  children: ReactNode;
  profile: StaffProfile;
  attentionCount: number;
  inspectionCount: number | null;
  maintenanceCount: number | null;
  departureCount: number | null;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const suppressedClickTarget = useRef<Element | null>(null);
  const items = navigation(profile.role);
  const current = items.find((item) => item.href === pathname) ?? items[0];
  const { docked, overflow } = getDockNavigation(profile.role);
  // When every destination fits the mobile dock there is nothing left for the
  // drawer to offer, so its mobile surfaces (drawer, Menu button, backdrop)
  // are skipped. Desktop keeps the persistent sidebar for all roles.
  const hasDrawerOverflow = overflow.length > 0;

  useEffect(() => {
    if (profile.role !== 'owner' || !hasDrawerOverflow) return;
    const mobile = window.matchMedia('(max-width: 760px)');
    let gesture: { x: number; y: number; distance: number; start: number; progress: number; horizontal: boolean; target: Element | null } | null = null;
    let frame = 0;
    const shell = shellRef.current;
    function paint(progress: number) {
      shell?.style.setProperty('--drawer-progress', String(progress));
      shell?.classList.add('drawer-dragging');
    }
    function resetClick() { suppressedClickTarget.current = null; }
    function start(event: TouchEvent) {
      resetClick();
      if (!mobile.matches || event.touches.length !== 1) { cancel(); return; }
      const touch = event.touches[0];
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [role="slider"], [role="dialog"], dialog')) return;
      if (!menuOpen && touch.clientX > 28 && !(target && sidebarRef.current?.contains(target))) return;
      // Capture the visible position so a reversing drag never jumps to the old target.
      const bounds = sidebarRef.current?.getBoundingClientRect();
      const distance = (bounds?.width || 300) * 1.02;
      const progress = Math.max(0, Math.min(1, 1 + (bounds?.left ?? -distance) / distance));
      gesture = { x: touch.clientX, y: touch.clientY, distance, start: progress, progress, horizontal: false, target: target?.closest('button, a') ?? target };
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (progress > 0 && progress < 1) paint(progress);
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
      gesture.progress = Math.max(0, Math.min(1, gesture.start + dx / gesture.distance));
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        if (gesture) paint(gesture.progress);
      });
    }
    function end() {
      if (gesture?.horizontal) {
        suppressedClickTarget.current = gesture.target;
        paint(gesture.progress);
        setMenuOpen(gesture.progress >= .35);
      }
      gesture = null;
      if (frame) cancelAnimationFrame(frame);
      // Let React commit the open/closed destination before releasing direct tracking.
      frame = requestAnimationFrame(() => { frame = 0; shell?.classList.remove('drawer-dragging'); });
    }
    function click(event: MouseEvent) {
      const target = event.target instanceof Node ? event.target : null;
      if (target && suppressedClickTarget.current?.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
      }
      resetClick();
    }
    function cancel() {
      gesture = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      shell?.classList.remove('drawer-dragging');
    }
    document.addEventListener('pointerdown', resetClick, { passive: true });
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
      document.removeEventListener('pointerdown', resetClick);
      mobile.removeEventListener('change', cancel);
      cancel();
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

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <div ref={shellRef} className="app-shell">
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
          <SidebarNavigation items={items} pathname={pathname} attentionCount={attentionCount}
            inspectionCount={inspectionCount} maintenanceCount={maintenanceCount} departureCount={departureCount}
            onNavigate={() => setMenuOpen(false)} />
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
            <StaffProfileMenu key={pathname} profile={profile} />
          </header>

          <main key={pathname} className="content" id="main-content" tabIndex={-1}>
            <header className="page-heading">
              <h1 id="workspace-page-heading">{current?.label}</h1>
              {current?.subtitle ? <p>{current.subtitle}</p> : null}
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
        departureCount={departureCount}
        onOpenMenu={() => setMenuOpen(true)}
      />
    </>
  );
}
