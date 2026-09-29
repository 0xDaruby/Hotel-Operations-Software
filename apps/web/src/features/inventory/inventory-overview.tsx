import Link from 'next/link';
import type { Inventory, InventorySummary } from './inventory';

export function InventoryOverview({ inventory, summary }: { inventory: Inventory; summary: InventorySummary }) {
  const activeRooms = inventory.rooms.filter((room) => room.active);
  const categoryCounts = inventory.categories.map((category) => ({
    name: category.name,
    rooms: activeRooms.filter((room) => room.categoryId === category.id).length,
  }));

  return (
    <div className="inventory-overview">
      <section className="metric-strip" aria-label="Inventory summary">
        <div><span>Hotel rooms</span><strong>{summary.activeRooms}</strong></div>
        <div><span>Occupied rooms</span><strong>{summary.occupiedRooms}</strong></div>
        <div><span>Available rooms for new arrivals</span><strong>{summary.readyRooms}</strong></div>
        <div><span>Inspection due (Pending)</span><strong>{summary.inspectionDueRooms}</strong></div>
        <div><span>Maintenance blocked</span><strong>{summary.maintenanceBlockedRooms}</strong></div>
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
