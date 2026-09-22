import { requireStaffProfile } from '@/features/auth/staff-profile';
import { formatActivityAction, getActivityContextLabel, getActivityFeed } from '@/features/activity/activity';

export default async function ActivityPage() {
  await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  const events = await getActivityFeed();

  return (
    <section className="activity-page" aria-labelledby="activity-heading">
      <div className="inventory-intro">
        <div>
          <p className="eyebrow">Attributed history</p>
          <h2 id="activity-heading">{events.length} recent {events.length === 1 ? 'event' : 'events'}</h2>
        </div>
        <p>Every consequential action is stored with the actor, the affected room or stay, and the time it was recorded.</p>
      </div>

      {events.length ? (
        <div className="activity-list" aria-live="polite">
          {events.map((event) => (
            <article className="activity-item" key={event.id}>
              <div className="activity-dot" aria-hidden="true" />
              <div className="activity-copy">
                <strong>{formatActivityAction(event.action)}</strong>
                <p>{getActivityContextLabel({ roomNumber: event.roomNumber, guestName: event.guestName })}</p>
                <small>{event.actorName} · {new Date(event.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</small>
                {event.reason ? <p className="activity-reason">Reason: {event.reason}</p> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="inventory-empty" role="status">
          <h2>No activity yet</h2>
          <p>Room changes, arrivals, inspections, and maintenance actions will appear here with the staff member who made them.</p>
        </div>
      )}
    </section>
  );
}
