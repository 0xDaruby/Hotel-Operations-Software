'use client';

import { useMemo, useState } from 'react';
import { RepairIcon, UserCheck01Icon } from '@/components/icons';
import type { HotelRoom, RoomCategory } from './inventory';

type RoomBoardProps = {
  rooms: HotelRoom[];
  categories: RoomCategory[];
  occupiedRoomIds: string[];
  inspectionDueRoomIds: string[];
  maintenanceIssueCountByRoomId: Record<string, number>;
};

function formatNaira(amount: number | null) {
  return amount === null
    ? 'Rate not recorded'
    : `₦${amount.toLocaleString('en-NG')} / 24 hours`;
}

export function RoomBoard({
  rooms,
  categories,
  occupiedRoomIds,
  inspectionDueRoomIds,
  maintenanceIssueCountByRoomId,
}: RoomBoardProps) {
  const occupied = new Set(occupiedRoomIds);
  const inspectionDue = new Set(inspectionDueRoomIds);
  const [categoryId, setCategoryId] = useState('all');
  const [floor, setFloor] = useState('all');
  const [query, setQuery] = useState('');
  const floors = [...new Set(rooms.map((room) => room.floor))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const visibleRooms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rooms.filter((room) =>
      (categoryId === 'all' || room.categoryId === categoryId)
      && (floor === 'all' || room.floor === floor)
      && (!normalizedQuery || room.number.toLowerCase().includes(normalizedQuery)),
    );
  }, [categoryId, floor, query, rooms]);
  const filtersActive = categoryId !== 'all' || floor !== 'all' || query.trim() !== '';

  function clearFilters() {
    setCategoryId('all');
    setFloor('all');
    setQuery('');
  }

  return (
    <section aria-labelledby="room-board-heading">
      <div className="inventory-intro">
        <div>
          <p className="eyebrow">Permanent inventory</p>
          <h2 id="room-board-heading">{visibleRooms.length} of {rooms.length} rooms</h2>
        </div>
        <p>Occupancy, inspections, and maintenance are separate facts. A room is ready for check-in only when all three are clear.</p>
      </div>

      <div className="room-toolbar">
        <label className="inventory-field">
          <span>Category</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="inventory-field">
          <span>Floor</span>
          <select value={floor} onChange={(event) => setFloor(event.target.value)}>
            <option value="all">All floors</option>
            {floors.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="inventory-field inventory-search">
          <span>Find a room</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. 301" type="search" />
        </label>
        {filtersActive ? <button className="text-button" onClick={clearFilters} type="button">Clear filters</button> : null}
      </div>

      {visibleRooms.length ? (
        <div className="room-grid" aria-live="polite">
          {visibleRooms.map((room) => {
            const isOccupied = occupied.has(room.id);
            const isInspectionDue = inspectionDue.has(room.id);
            const issueCount = maintenanceIssueCountByRoomId[room.id] ?? 0;
            const isReady = room.active && !isOccupied && !isInspectionDue && issueCount === 0;

            const blockers: string[] = [];
            if (!room.active) blockers.push('Inactive inventory');
            if (isOccupied) blockers.push('Occupied');
            if (isInspectionDue) blockers.push('Inspection due');
            if (issueCount > 0) blockers.push(`${issueCount} open maintenance issue${issueCount === 1 ? '' : 's'}`);

            return (
              <article className={room.active ? 'room-card' : 'room-card room-card-inactive'} key={room.id}>
                <div className="room-card-head">
                  <div><p>{room.categoryName}</p><h3>{room.number}</h3></div>
                  <span>{room.floor}</span>
                </div>
                <div className="room-badges">
                  {!room.active ? <span className="status-badge status-muted">Inactive inventory</span> : null}
                  <span className={isOccupied ? 'status-badge status-occupied' : 'status-badge status-neutral'}>
                    {isOccupied ? <><UserCheck01Icon className="icon icon-sm icon-status-occupied" aria-hidden="true" />Occupied</> : 'Unoccupied'}
                  </span>
                  {isInspectionDue ? <span className="status-badge status-pending">Inspection due</span> : null}
                  {issueCount > 0 ? <span className="status-badge status-danger"><RepairIcon className="icon icon-sm icon-status-pending" aria-hidden="true" />Maintenance blocked</span> : null}
                  {isReady ? <span className="status-badge status-ready">Ready for check-in</span> : null}
                </div>
                {!isReady ? <p className="room-reason">Not ready: {blockers.join(' · ')}</p> : null}
                <p className="room-rate">{formatNaira(room.dailyRate)}</p>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="inventory-empty" role="status">
          <h2>{rooms.length ? 'No rooms match these filters' : 'No rooms are available'}</h2>
          <p>{rooms.length ? 'Try clearing one or more filters to see the inventory again.' : 'Your account has no room inventory available yet.'}</p>
          {filtersActive ? <button className="button button-secondary" onClick={clearFilters} type="button">Clear filters</button> : null}
        </div>
      )}
    </section>
  );
}