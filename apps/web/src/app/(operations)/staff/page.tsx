import { requireStaffProfile } from '@/features/auth/staff-profile';
import { getStaffMembers } from '@/features/staff/staff-management';
import { UserListIcon } from '@/components/icons';

export default async function StaffManagementPage() {
  await requireStaffProfile(['owner']);
  const staff = await getStaffMembers();

  return (
    <section className="staff-page" aria-labelledby="staff-heading">
      <div className="inventory-intro">
        <div>
          <p className="eyebrow">Owner access</p>
          <h2 id="staff-heading"><UserListIcon className="icon icon-lg" aria-hidden="true" />Hotel staff</h2>
        </div>
        <p>Only the owner creates or manages staff access. Profiles remain tied to the authenticated hotel and the matching Supabase user.</p>
      </div>

      <div className="staff-list" aria-live="polite">
        {staff.map((member) => (
          <article className="staff-card" key={member.userId}>
            <div className="inspection-card-head">
              <div>
                <p className="stay-room">{member.role}</p>
                <h3>{member.displayName}</h3>
              </div>
              <span className={`status-badge ${member.active ? 'status-occupied' : 'status-muted'}`}>
                {member.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <dl className="inspection-facts">
              <div><dt>Email</dt><dd>{member.email ?? 'Not available'}</dd></div>
              <div><dt>Role</dt><dd>{member.role}</dd></div>
              <div><dt>Hotel</dt><dd>{member.hotelId}</dd></div>
            </dl>
            <p className="inspection-findings">Protected owner-side management is available here for account review and activation state checks.</p>
          </article>
        ))}
      </div>
    </section>
  );
}
