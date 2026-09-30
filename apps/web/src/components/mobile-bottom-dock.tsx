'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavigationEntry } from '@/components/navigation-config';

export type MobileBottomDockProps = {
  /** Destinations shown directly in the capsule, in priority order. */
  docked: NavigationEntry[];
  /** Destinations not in the capsule; when non-empty a Menu control is shown. */
  overflow: NavigationEntry[];
  /** Opens the existing drawer for destinations beyond the dock. */
  onOpenMenu: () => void;
};

/**
 * Floating capsule dock for mobile. Fixed to the viewport bottom, centred,
 * driven entirely by the current route for its active state. Holds at most
 * six elements: the docked destinations plus an optional Menu control.
 */
export function MobileBottomDock({ docked, overflow, onOpenMenu }: MobileBottomDockProps) {
  const pathname = usePathname();

  if (docked.length === 0) return null;

  const hasOverflow = overflow.length > 0;

  return (
    <nav className="mobile-dock" aria-label="Primary">
      {docked.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? 'mobile-dock-item mobile-dock-item-active' : 'mobile-dock-item'}
            aria-current={active ? 'page' : undefined}
          >
            {Icon ? (
              <span className="mobile-dock-icon" aria-hidden="true">
                <Icon className="icon icon-md" />
              </span>
            ) : null}
            <span className="mobile-dock-label">{item.shortLabel}</span>
            {active ? <span className="mobile-dock-indicator" aria-hidden="true" /> : null}
          </Link>
        );
      })}

      {hasOverflow ? (
        <button className="mobile-dock-item mobile-dock-more" onClick={onOpenMenu} type="button" aria-label="Open full menu">
          <span className="mobile-dock-more-dots" aria-hidden="true">
            <i /><i /><i />
          </span>
          <span className="mobile-dock-label">Menu</span>
        </button>
      ) : null}
    </nav>
  );
}
