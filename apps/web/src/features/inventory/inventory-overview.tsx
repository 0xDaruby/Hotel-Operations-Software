'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Dialog } from '@/components/dialog';
import { formatActivityAction, getActivityContextLabel } from '@/features/activity/activity-view';
import type { ActivityEvent } from '@/features/activity/activity';
import { resolveMaintenanceIssueAction } from '@/features/maintenance/actions';
import { formatNaira } from '@/features/stays/format';
import type { Inventory } from './inventory';
import type { InventorySummary } from './inventory-summary';
import type { OwnerAttentionItem } from './owner-overview-model';
import type { OwnerMovement } from './owner-overview-movement';
import type { OwnerPaymentTotals } from './owner-overview-payments';
import { formatElapsedTime, formatLagosDateTime } from './owner-overview-time';

type InventoryOverviewProps = {
  inventory: Inventory;
  summary: InventorySummary;
  occupancyPercent: number;
  attentionItems: OwnerAttentionItem[];
  occupiedRoomIds: string[];
  inspectionDueRoomIds: string[];
  maintenanceIssueCountByRoomId: Record<string, number>;
  now: string;
  paymentTotals: OwnerPaymentTotals;
  movement: OwnerMovement;
  teamPulseEvents: ActivityEvent[];
};

const attentionText = {
  departure: { title: 'Departure overdue', elapsed: 'overdue', action: 'View departure' },
  inspection: { title: 'Inspection unresolved', elapsed: 'waiting', action: 'View inspection' },
  maintenance: { title: 'Maintenance blocking room', elapsed: 'blocked', action: 'Mark resolved' },
} as const;

export function InventoryOverview({
  inventory,
  summary,
  occupancyPercent,
  attentionItems,
  occupiedRoomIds,
  inspectionDueRoomIds,
  maintenanceIssueCountByRoomId,
  now: initialNow,
  paymentTotals,
  movement,
  teamPulseEvents,
}: InventoryOverviewProps) {
  const [now, setNow] = useState(() => new Date(initialNow).getTime());
  const [selectedIssue, setSelectedIssue] = useState<OwnerAttentionItem | null>(null);
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  const unassignedRooms = inventory.rooms.filter((room) => !inventory.categories.some((category) => category.id === room.categoryId));
  const categories = unassignedRooms.length
    ? [...inventory.categories, { id: 'unassigned', name: 'Category not recorded', dailyRate: null }]
    : inventory.categories;
  const overdueCount = attentionItems.filter((item) => item.kind === 'departure').length;
  const blockedCount = attentionItems.filter((item) => item.kind === 'maintenance').length;
  const inspectionCount = attentionItems.filter((item) => item.kind === 'inspection').length;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="owner-overview">
      <section className="owner-metrics" aria-label="Hotel overview metrics">
        <div className="owner-metric owner-occupancy">
          <span className="owner-metric-label">Occupancy</span>
          <strong>{summary.occupiedRooms}<small> / {summary.activeRooms}</small></strong>
          <span className="owner-metric-detail">{occupancyPercent}% of rooms in use</span>
          <progress max="100" value={occupancyPercent} aria-label={`${occupancyPercent}% occupancy`} />
        </div>
        <div className="owner-metric">
          <span className="owner-metric-label">Payments recorded today</span>
          <strong>{formatNaira(paymentTotals.today)}</strong>
          <span className="owner-metric-detail">{formatNaira(paymentTotals.yesterday)} yesterday</span>
        </div>
        <div className="owner-metric">
          <span className="owner-metric-label">Ready to sell</span>
          <strong>{summary.readyRooms}</strong>
          <span className="owner-metric-detail">Approved, no stay, no open block</span>
        </div>
        <div className="owner-metric">
          <span className="owner-metric-label">Needs attention</span>
          <strong>{attentionItems.length}</strong>
          <span className="owner-metric-detail">{overdueCount} overdue · {blockedCount} blocked · {inspectionCount} inspections</span>
        </div>
      </section>

      <div className="owner-overview-row owner-overview-primary-row">
        <section className="owner-panel owner-attention" id="attention" aria-labelledby="owner-attention-heading">
        <div className="owner-section-heading">
          <div>
            <p className="eyebrow">Needs attention</p>
            <h2 id="owner-attention-heading">{attentionItems.length ? `${attentionItems.length} items, oldest first` : inspectionDueRoomIds.length ? 'Inspections pending' : 'All clear'}</h2>
          </div>
          {attentionItems.length > 3 ? (
            <Link className="owner-view-all" href={attentionItems[0].href}>View all {attentionItems.length}</Link>
          ) : null}
        </div>
        {attentionItems.length ? (
          <ol className="owner-attention-list">
            {attentionItems.map((item) => {
              const copy = item.kind === 'inspection'
                ? { ...attentionText.inspection, title: inspectionTitle(item.inspectionStatus) }
                : attentionText[item.kind];
              const absoluteTime = formatLagosDateTime(item.occurredAt);
              const elapsed = formatElapsedTime(item.occurredAt, now);
              return (
                <li className="owner-attention-row" key={`${item.kind}-${item.id}`}>
                  <div className="owner-attention-copy">
                    <h3>Room {item.roomNumber} · {copy.title}</h3>
                    <p>{elapsed} {copy.elapsed}</p>
                  </div>
                  <details className="owner-time-disclosure">
                    <summary title={absoluteTime} aria-label={`${elapsed} ${copy.elapsed}. Show absolute time.`}>{elapsed}</summary>
                    <time dateTime={item.occurredAt}>{absoluteTime}</time>
                  </details>
                  {item.kind === 'maintenance' ? (
                    <button className="owner-row-action" onClick={() => setSelectedIssue(item)} type="button">{copy.action}</button>
                  ) : (
                    <Link className="owner-row-action" href={item.href}>{copy.action}</Link>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="owner-attention-empty" role="status">{inspectionDueRoomIds.length
            ? `${inspectionDueRoomIds.length} rooms awaiting inspection. Inspections appear here after waiting 2 hours.`
            : 'Nothing needs attention right now.'}</p>
        )}
        </section>

        <section className="owner-panel owner-movement" aria-labelledby="owner-movement-heading">
          <div className="owner-section-heading">
            <div>
              <p className="eyebrow">Today&apos;s movement</p>
              <h2 id="owner-movement-heading">Arrivals and departures</h2>
            </div>
          </div>
          <div className="owner-movement-counts">
            <div><strong>{movement.arrivals}</strong><span>Arrivals</span></div>
            <div><strong>{movement.departures}</strong><span>Departures confirmed</span></div>
            <div><strong>{movement.extensions}</strong><span>Stays extended</span></div>
            <div><strong>{movement.departuresDueSoon}</strong><span>Departures due in 4 h</span></div>
          </div>
          <div className="owner-movement-payments">
            <div><span>Initial payments</span><strong>{formatNaira(movement.initialPayments)}</strong></div>
            <div><span>Extension payments</span><strong>{formatNaira(movement.extensionPayments)}</strong></div>
          </div>
          <p className="owner-movement-note">Staff-recorded payments. An operational record, not accounting.</p>
        </section>
      </div>

      <div className="owner-overview-row owner-overview-secondary-row">
        <section className="owner-panel owner-room-map" aria-labelledby="owner-room-map-heading">
        <div className="owner-section-heading">
          <div>
            <p className="eyebrow">Room map</p>
            <h2 id="owner-room-map-heading">Every room, right now</h2>
          </div>
          <Link className="owner-view-all" href="/rooms">Open room board</Link>
        </div>
        {categories.map((category) => {
          const rooms = category.id === 'unassigned'
            ? unassignedRooms
            : inventory.rooms.filter((room) => room.categoryId === category.id);
          const isOpen = openCategories.includes(category.id);
          return (
            <section className="owner-category" key={category.id}>
              <div className="owner-category-heading">
                <span>{category.name}</span>
                <span>{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}</span>
              </div>
              <button
                aria-expanded={isOpen}
                className="owner-category-toggle"
                onClick={() => setOpenCategories((current) => (
                  current.includes(category.id)
                    ? current.filter((id) => id !== category.id)
                    : [...current, category.id]
                ))}
                type="button"
              >
                <span>{category.name}</span>
                <span>{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}</span>
              </button>
              <div className={`owner-room-grid${isOpen ? ' owner-room-grid-open' : ''}`}>
                {rooms.map((room) => {
                  const state = getRoomState(room, occupiedRoomIds, inspectionDueRoomIds, maintenanceIssueCountByRoomId);
                  return (
                    <article className={`owner-room-tile${state.occupied ? ' owner-room-occupied' : ''}${state.blocked ? ' owner-room-blocked' : ''}`} key={room.id}>
                      <strong>{room.number}</strong>
                      <span className="owner-room-occupancy">
                        {!room.active ? 'Inactive' : state.occupied ? 'Occupied' : state.ready ? 'Ready' : 'Unoccupied'}
                      </span>
                      <span className="owner-room-facts">
                        {state.inspection ? <span>Inspection due</span> : null}
                        {state.blocked ? <span>Maintenance blocked</span> : null}
                      </span>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        </section>

        <aside className="owner-panel owner-team-pulse" aria-labelledby="owner-team-pulse-heading">
          <div className="owner-section-heading">
            <div>
              <p className="eyebrow">Team pulse</p>
              <h2 id="owner-team-pulse-heading">Latest activity</h2>
            </div>
            <Link className="owner-view-all" href="/activity">All activity</Link>
          </div>
          {teamPulseEvents.length ? (
            <ol className="owner-pulse-list" aria-label="Latest staff activity">
              {teamPulseEvents.map((event) => (
                <li className="owner-pulse-item" key={event.id}>
                  <div className="owner-pulse-copy">
                    <strong>{formatActivityAction(event.action)} · {getActivityContextLabel(event)}</strong>
                    <span>{event.actorName}</span>
                  </div>
                  <time dateTime={event.createdAt} title={formatLagosDateTime(event.createdAt)}>
                    {formatElapsedTime(event.createdAt, now)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="owner-pulse-empty" role="status">No activity recorded yet.</p>
          )}
        </aside>
      </div>

      {selectedIssue ? <ResolveIssueDialog issue={selectedIssue} onClose={() => setSelectedIssue(null)} /> : null}
    </div>
  );
}

function inspectionTitle(status?: string) {
  if (status === 'attention') return 'Inspection needs follow-up';
  if (status === 'access_blocked') return 'Inspection access blocked';
  return 'Awaiting inspection';
}

function getRoomState(
  room: Inventory['rooms'][number],
  occupiedRoomIds: string[],
  inspectionDueRoomIds: string[],
  maintenanceIssueCountByRoomId: Record<string, number>,
) {
  const occupied = occupiedRoomIds.includes(room.id);
  const inspection = inspectionDueRoomIds.includes(room.id);
  const blocked = (maintenanceIssueCountByRoomId[room.id] ?? 0) > 0;
  return {
    occupied,
    inspection,
    blocked,
    ready: room.active && !occupied && !inspection && !blocked,
  };
}

function ResolveIssueDialog({ issue, onClose }: { issue: OwnerAttentionItem; onClose: () => void }) {
  const [resolutionDetail, setResolutionDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ resolvedBy: string; resolvedAt: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolutionDetail.trim() || pending) return;
    setError(null);
    setResolved(null);
    startTransition(async () => {
      const result = await resolveMaintenanceIssueAction({
        issueId: issue.id,
        resolutionDetail,
        expectedVersion: issue.version ?? 1,
      });
      if (result.ok) onClose();
      else if (result.alreadyResolved) setResolved(result.alreadyResolved);
      else setError(result.error ?? 'The maintenance issue could not be resolved.');
    });
  }

  return (
    <Dialog open title={`Resolve room ${issue.roomNumber} issue`} onClose={onClose}>
      <form className="stay-dialog-form" onSubmit={submit}>
        {resolved ? <p className="form-notice" role="status">Resolved by {resolved.resolvedBy} on {formatLagosDateTime(resolved.resolvedAt)}.</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="dialog-note">This resolves only this issue. Other open issues keep {issue.roomNumber} blocked, and this does not approve room cleanliness.</p>
        <label className="inventory-field">
          <span>Resolution detail</span>
          <textarea value={resolutionDetail} onChange={(event) => setResolutionDetail(event.target.value)} rows={4} maxLength={250} required />
        </label>
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>{resolved ? 'Close' : 'Cancel'}</button>
          {resolved ? null : <button className="button button-primary" type="submit" disabled={!resolutionDetail.trim() || pending}>{pending ? 'Resolving…' : 'Save resolution'}</button>}
        </div>
      </form>
    </Dialog>
  );
}
