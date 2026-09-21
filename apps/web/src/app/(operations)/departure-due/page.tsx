import { requireStaffProfile } from '@/features/auth/staff-profile';
import { DepartureQueue } from '@/features/stays/departure-queue';
import { getActiveStays } from '@/features/stays/stays';

export default async function DepartureDuePage() {
  const profile = await requireStaffProfile(['owner', 'receptionist']);
  const stays = await getActiveStays();
  const now = new Date().toISOString();
  return (
    <>
      <div className="inventory-intro">
        <div>
          <p className="eyebrow">Departure management</p>
          <h2>{stays.length} occupied {stays.length === 1 ? 'room' : 'rooms'}</h2>
        </div>
        <p>A due or overdue deadline does not vacate a room. The stay stays occupied until departure is confirmed, and confirming creates an inspection requirement automatically.</p>
      </div>
      <DepartureQueue stays={stays} canRecord={profile.role !== 'supervisor'} now={now} />
    </>
  );
}
