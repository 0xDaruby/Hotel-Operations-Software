'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { HistoryIcon } from '@/components/icons';
import type { ActivityEvent, getActivityHistoryPage } from './activity';
import { formatActivityAction, getActivityContextLabel, groupActivityEventsByDate } from './activity-view';
import { getActivityDetails } from './activity-details';
import { ActivityEventDetails } from './activity-event-details';
import { activityFilters } from './activity-query';
import type { HistoryFilters } from './activity-query';
import { loadOlderActivity } from './history-actions';

type Page = Awaited<ReturnType<typeof getActivityHistoryPage>>;
const filterLabels = { all: 'All activity', stays: 'Stays', inspections: 'Inspections', maintenance: 'Maintenance', other: 'Other' };

export function ActivityFeed({ initialPage, filters, filterError }: { initialPage: Page; filters: HistoryFilters; filterError?: string }) {
  const [snapshot, setSnapshot] = useState(initialPage);
  const [older, setOlder] = useState<ActivityEvent[]>([]);
  const [pagination, setPagination] = useState<{ cursor: Page['nextCursor'] } | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const loading = useRef(false);
  const events = [...new Map([...snapshot.events, ...older].map(event => [event.id, event])).values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const groups = groupActivityEventsByDate(events);
  const cursor = pagination ? pagination.cursor : snapshot.nextCursor;

  function loadOlder() {
    if (!cursor || loading.current) return;
    loading.current = true;
    setError('');
    startTransition(async () => {
      try {
        const result = await loadOlderActivity(filters, cursor);
        if (result.page) {
          setOlder(previous => [...previous, ...result.page.events]);
          setPagination({ cursor: result.page.nextCursor });
        } else setError(result.error ?? 'Could not load older activity. Please try again.');
      } catch {
        setError('Could not load older activity. Please try again.');
      } finally { loading.current = false; }
    });
  }

  return <div className="activity-browser">
    <div className="activity-toolbar">
      <nav className="activity-filters" aria-label="Filter activity by type">
        {activityFilters.map(category => {
          const params = new URLSearchParams({ ...filters, category });
          return <Link className="activity-filter" aria-current={filters.category === category ? 'page' : undefined} href={`/activity?${params}`} key={category}>{filterLabels[category]}</Link>;
        })}
      </nav>
      <form action="/activity" className="activity-date-filter">
        <input type="hidden" name="category" value={filters.category} />
        <label>From<input aria-label="Activity from date" name="from" type="date" defaultValue={filters.from} /></label>
        <label>To<input aria-label="Activity to date" name="to" type="date" defaultValue={filters.to} /></label>
        <button className="activity-filter activity-apply" type="submit">Apply dates</button>
        {filters.from || filters.to ? <Link className="activity-reset" href={`/activity?category=${filters.category}`}>Clear dates</Link> : null}
      </form>
    </div>
    {filterError ? <p role="alert">{filterError}</p> : null}
    {initialPage.events[0]?.id !== snapshot.events[0]?.id ? <button className="activity-load-more" disabled={pending} onClick={() => { setSnapshot(initialPage); setOlder([]); setPagination(null); setError(''); }} type="button">New activity available · Refresh</button> : null}
    <p className="activity-count" role="status">{events.length ? `Showing ${events.length} ${events.length === 1 ? 'event' : 'events'} · Newest first` : 'No activity matches these filters.'}</p>
    <div className="activity-groups">
      {groups.map(group => <section className="activity-day" key={group.key} aria-labelledby={`activity-day-${group.key}`}>
        <header className="activity-day-heading"><h2 id={`activity-day-${group.key}`}>{group.label}</h2></header>
        <div className="activity-list">{group.events.map(event => {
          const details = getActivityDetails(event);
          return <article className="activity-item" key={event.id}>
            <HistoryIcon className="icon icon-md activity-dot" aria-hidden="true" />
            <div className="activity-copy">
              <div className="activity-row-title"><strong>{formatActivityAction(event.action)}</strong><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })}</time></div>
              <p>{getActivityContextLabel(event)}</p>
              <small>{event.actorName}</small>
              {details.note || details.items.length ? <details className="activity-details">
                <summary>View details<span className="sr-only"> for {formatActivityAction(event.action)}, {getActivityContextLabel(event)}</span></summary>
                <ActivityEventDetails details={details} />
              </details> : null}
            </div>
          </article>;
        })}</div>
      </section>)}
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {events.length ? <button className="activity-load-more" onClick={loadOlder} aria-disabled={!cursor || pending} type="button">{pending ? 'Loading older activity…' : cursor ? 'Load older activity' : 'All activity loaded'}</button> : null}
  </div>;
}
