import { requireStaffProfile } from '@/features/auth/staff-profile';
import { ArrivalForm } from '@/features/stays/arrival-form';
import { StayList } from '@/features/stays/stay-list';
import { getActiveStays, getOperationalContext, getStayPayments, getStayTotals } from '@/features/stays/stays';

export default async function StaysPage() {
  await requireStaffProfile(['owner', 'receptionist']);
  const [context, stays] = await Promise.all([getOperationalContext(), getActiveStays()]);
  const stayIds = stays.map((stay) => stay.id);
  const [payments, totals] = await Promise.all([getStayPayments(stayIds), getStayTotals(stayIds)]);
  const canRecord = context.profile.role !== 'supervisor';

  return (
    <div className="stays-layout">
      <div className="stays-main">
        <div className="inventory-intro">
          <div>
            <p className="eyebrow">Walk-in stays</p>
            <h2>{stays.length} active {stays.length === 1 ? 'stay' : 'stays'}</h2>
          </div>
          <p>Rooms stay occupied past their deadline until reception confirms departure. Expired deadlines never free a room on their own.</p>
        </div>
        <StayList stays={stays} payments={payments} totals={totals} readyRooms={context.readyRooms} canRecord={canRecord} />
      </div>
      <aside className="stays-side">
        <h2>Record walk-in arrival</h2>
        <p className="stays-side-note">Rate is locked from the room category and the deadline is arrival plus 24 hours per paid day.</p>
        <ArrivalForm readyRooms={context.readyRooms} />
      </aside>
    </div>
  );
}
