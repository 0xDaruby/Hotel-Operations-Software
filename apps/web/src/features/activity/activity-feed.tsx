'use client';

import { useState } from 'react';
import { BellDotIcon } from '@/components/icons';
import type { ActivityEvent } from './activity';
import { formatActivityAction, getActivityCategory, getActivityContextLabel } from './activity-view';
import type { ActivityCategory, ActivityDayGroup, ActivityFilter } from './activity-view';

type DisplayEvent = ActivityEvent & { formattedCreatedAt: string };
type DisplayGroup = Omit<ActivityDayGroup, 'events'> & { events: DisplayEvent[] };

type Props = {
  groups: DisplayGroup[];
  eventCount: number;
};

const filterLabels: Record<ActivityFilter, string> = {
  all: 'All activity',
  stays: 'Stays',
  inspections: 'Inspections',
  maintenance: 'Maintenance',
  other: 'Other',
};

export function ActivityFeed({ groups, eventCount }: Props) {
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>('all');
  const allEvents = groups.flatMap((group) => group.events);
  const hasOtherEvents = allEvents.some((event) => getActivityCategory(event.action) === 'other');
  const filters: ActivityFilter[] = ['all', 'stays', 'inspections', 'maintenance'];
  if (hasOtherEvents) filters.push('other');

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      events: group.events.filter((event) => (
        activeFilter === 'all' || getActivityCategory(event.action) === activeFilter
      )),
    }))
    .filter((group) => group.events.length > 0);
  const visibleCount = visibleGroups.reduce((total, group) => total + group.events.length, 0);

  return (
    <div className="activity-browser">
      <div className="activity-toolbar">
        <p className="activity-count" aria-live="polite">
          Showing <strong>{visibleCount}</strong> of {eventCount} recent {eventCount === 1 ? 'event' : 'events'}
        </p>
        <div className="activity-filters" role="group" aria-label="Filter activity by type">
          {filters.map((filter) => (
            <button
              aria-pressed={activeFilter === filter}
              className="activity-filter"
              key={filter}
              onClick={() => setActiveFilter(filter)}
              type="button"
            >
              {filterLabels[filter]}
            </button>
          ))}
        </div>
      </div>

      {visibleGroups.length ? (
        <div className="activity-groups" aria-live="polite">
          {visibleGroups.map((group) => (
            <section className="activity-day" key={group.key} aria-labelledby={`activity-day-${group.key}`}>
              <header className="activity-day-heading">
                <h3 id={`activity-day-${group.key}`}>{group.label}</h3>
                <span>{group.events.length} {group.events.length === 1 ? 'event' : 'events'}</span>
              </header>
              <div className="activity-list">
                {group.events.map((event) => (
                  <article className="activity-item" key={event.id}>
                    <BellDotIcon className="icon icon-md activity-dot" aria-hidden="true" />
                    <div className="activity-copy">
                      <strong>{formatActivityAction(event.action)}</strong>
                      <p>{getActivityContextLabel({ roomNumber: event.roomNumber, guestName: event.guestName })}</p>
                      <small>{event.actorName} · {event.formattedCreatedAt}</small>
                      {event.reason ? <p className="activity-reason">Reason: {event.reason}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="activity-filter-empty" role="status">
          No {filterLabels[activeFilter].toLowerCase()} in the recent activity.
        </div>
      )}
    </div>
  );
}