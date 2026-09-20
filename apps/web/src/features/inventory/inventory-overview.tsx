import Link from 'next/link';
import type { Inventory } from './inventory';

export function InventoryOverview({ inventory }: { inventory: Inventory }) {
  const activeRooms = inventory.rooms.filter((room) => room.active);
  const categoryCounts = inventory.categories.map((category) => ({
    name: category.name,
    rooms: activeRooms.filter((room) => room.categoryId === category.id).length,
  }));

  return (
    <div className="inventory-overview">
      <section className="metric-strip" aria-label="Inventory summary">
        <div><span>Active rooms</span><strong>{activeRooms.length}</strong><small>Permanent hotel inventory</small></div>
        <div><span>Room categories</span><strong>{inventory.categories.length}</strong><small>Rates per 24-hour period</small></div>
        <div><span>Operational facts</span><strong>—</strong><small>Added in the next lifecycle stages</small></div>
      </section>
      <section className="inventory-summary-panel">
        <div>
          <p className="eyebrow">Inventory position</p>
          <h2>Rooms by category</h2>
          <p>These are permanent rooms and rates only. They do not claim occupancy or readiness.</p>
        </div>
        <ul>
          {categoryCounts.map((category) => <li key={category.name}><span>{category.name}</span><strong>{category.rooms} rooms</strong></li>)}
        </ul>
        <Link className="button button-secondary" href="/rooms">Open room board</Link>
      </section>
    </div>
  );
}
