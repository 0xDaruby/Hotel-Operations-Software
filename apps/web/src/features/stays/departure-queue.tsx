'use client';

import { useState } from 'react';
import { HourglassOffIcon } from '@/components/icons';
import { formatDateLabel, formatNaira } from './format';
import { DepartDialog } from './stay-list';
import type { Stay } from './stays';

type DepartureQueueProps = {
  stays: Stay[];
  canRecord: boolean;
  now: string;
};

export function DepartureQueue({ stays, canRecord, now }: DepartureQueueProps) {
  const [departing, setDeparting] = useState<Stay | null>(null);
  const nowMs = new Date(now).getTime();
  const HOUR = 60 * 60 * 1000;

  const overdue = stays.filter((stay) => new Date(stay.departureDueAt).getTime() <= nowMs);
  const dueSoon = stays.filter((stay) => {
    const due = new Date(stay.departureDueAt).getTime();
    return due > nowMs && due <= nowMs + 24 * HOUR;
  });
  const upcoming = stays.filter((stay) => new Date(stay.departureDueAt).getTime() > nowMs + 24 * HOUR);

  if (!stays.length) {
    return (
      <div className="inventory-empty" role="status">
        <h2>Nothing is due for departure</h2>
        <p>Active stays will appear here as their 24-hour deadlines approach.</p>
      </div>
    );
  }

  return (
    <div className="queue-columns">
      <QueueColumn
        title="Overdue — guest still in room"
        hint="Occupancy continues until reception confirms departure."
        stays={overdue}
        tone="overdue"
        canRecord={canRecord}
        onDepart={setDeparting}
        emptyLabel="No overdue stays."
      />
      <QueueColumn
        title="Due within 24 hours"
        hint="Prepare for departure confirmation."
        stays={dueSoon}
        tone="soon"
        canRecord={canRecord}
        onDepart={setDeparting}
        emptyLabel="No stays due in the next 24 hours."
      />
      <QueueColumn
        title="Later stays"
        hint="Upcoming deadlines beyond 24 hours."
        stays={upcoming}
        tone="later"
        canRecord={canRecord}
        onDepart={setDeparting}
        emptyLabel="No later stays."
      />
      {departing ? <DepartDialog stay={departing} onClose={() => setDeparting(null)} /> : null}
    </div>
  );
}

function QueueColumn({ title, hint, stays, tone, canRecord, onDepart, emptyLabel }: {
  title: string;
  hint: string;
  stays: Stay[];
  tone: 'overdue' | 'soon' | 'later';
  canRecord: boolean;
  onDepart: (stay: Stay) => void;
  emptyLabel: string;
}) {
  return (
    <section className={`queue-column queue-${tone}`} aria-label={title}>
      <div className="queue-column-head">
        <h3 className="queue-title"><HourglassOffIcon className={`icon icon-sm ${tone === 'overdue' ? 'icon-status-danger' : tone === 'soon' ? 'icon-status-pending' : 'icon-status-muted'}`} aria-hidden="true" />{title}</h3>
        <span className="status-badge status-neutral">{stays.length}</span>
      </div>
      <p className="queue-hint">{hint}</p>
      {stays.length ? (
        <ul className="queue-list">
          {stays.map((stay) => (
            <li className="queue-item" key={stay.id}>
              <div className="queue-item-main">
                <strong>{stay.roomNumber}</strong>
                <span>{stay.guestName}</span>
              </div>
              <div className="queue-item-meta">
                <span>Deadline {formatDateLabel(stay.departureDueAt)}</span>
                <span>{formatNaira(stay.originalDailyRate)}/day</span>
              </div>
              {canRecord ? (
                <button className="button button-secondary" type="button" onClick={() => onDepart(stay)}>Confirm departure</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="queue-empty">{emptyLabel}</p>
      )}
    </section>
  );
}
