import Link from 'next/link';
import { getDockAttentionBadgeCount, type NavigationEntry } from './navigation-config';

type SidebarNavigationProps = {
  items: NavigationEntry[];
  pathname: string;
  attentionCount: number;
  inspectionCount: number | null;
  maintenanceCount: number | null;
  departureCount: number | null;
  onNavigate?: () => void;
};

function attentionLabel(href: string, count: number) {
  if (href === '/departure-due') return `${count} ${count === 1 ? 'stay' : 'stays'} overdue or due within 24 hours`;
  if (href === '/inspections') return `${count} open ${count === 1 ? 'inspection' : 'inspections'}`;
  if (href === '/maintenance') return `${count} open ${count === 1 ? 'maintenance issue' : 'maintenance issues'}`;
  return `${count} ${count === 1 ? 'item needs' : 'items need'} attention`;
}

export function SidebarNavigation({ items, pathname, attentionCount, inspectionCount, maintenanceCount, departureCount, onNavigate }: SidebarNavigationProps) {
  return <nav className="main-nav" aria-label="Main navigation">
    {items.map(item => {
      const count = getDockAttentionBadgeCount(item.href, attentionCount, inspectionCount, maintenanceCount, departureCount);
      return <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}
        aria-label={count === null ? undefined : `${item.label}, ${attentionLabel(item.href, count)}`} onClick={onNavigate}>
        {item.icon ? <span className="nav-icon" aria-hidden="true"><item.icon className="icon icon-md" /></span> : null}
        <span className="sidebar-nav-label">{item.label}</span>
        {count === null ? null : <span className="sidebar-attention-badge" aria-hidden="true">{count}</span>}
      </Link>;
    })}
  </nav>;
}
