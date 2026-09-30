import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getActivityFeed } from '@/features/activity/activity';
import { groupActivityEventsByDate } from '@/features/activity/activity-view';
import { ActivityFeed } from '@/features/activity/activity-feed';

export default async function ActivityPage() {
  await requireStaffProfile(['owner', 'receptionist', 'supervisor']);
  const events = await getActivityFeed();
  const groups = groupActivityEventsByDate(events).map((group) => ({
    ...group,
    events: group.events.map((event) => ({
      ...event,
      formattedCreatedAt: new Date(event.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
    })),
  }));

  return (
    <section className="activity-page" aria-labelledby="activity-heading">
      <div className="inventory-intro">
        <div>
          <p className="eyebrow">Attributed history</p>
          <h2 id="activity-heading">{events.length} recent {events.length === 1 ? 'event' : 'events'}</h2>
        </div>
      </div>

      {events.length ? (
        <ActivityFeed groups={groups} eventCount={events.length} />
      ) : (
        <div className="inventory-empty" role="status">
          <h2>No activity yet</h2>
          <p>Room changes, arrivals, inspections, and maintenance actions will appear here with the staff member who made them.</p>
        </div>
      )}
    </section>
  );
}
