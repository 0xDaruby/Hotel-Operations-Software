'use client';

import { useMemo, useState } from 'react';
import type { HotelRoom, RoomCategory } from './inventory';

type RoomBoardProps = {
  rooms: HotelRoom[];
  categories: RoomCategory[];
  occupiedRoomIds: string[];
  blockedRoomIds: string[];
};

function formatNaira(amount: number | null) {
  return amount === null
    ? 'Rate not recorded'
    : `₦${amount.toLocaleString('en-NG')} / 24 hours`;
}

export function RoomBoard({ rooms, categories, occupiedRoomIds, blockedRoomIds }: RoomBoardProps) {
  const occupied = new Set(occupiedRoomIds);
  const blocked = new Set(blockedRoomIds);
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
        <p>Occupancy, inspections, maintenance, and ready-for-check-in are added when their records exist.</p>
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
          {visibleRooms.map((room) => (
            <article className={room.active ? 'room-card' : 'room-card room-card-inactive'} key={room.id}>
              <div className="room-card-head">
                <div><p>{room.categoryName}</p><h3>{room.number}</h3></div>
                <span>{room.floor}</span>
              </div>
              <div className="room-badges">
                <span className={room.active ? 'status-badge status-neutral' : 'status-badge status-muted'}>{room.active ? 'Active inventory' : 'Inactive inventory'}</span>
                {occupied.has(room.id) ? (
                  <span className="status-badge status-occupied">Occupied</span>
                ) : blocked.has(room.id) ? (
                  <span className="status-badge status-pending">Inspection due</span>
                ) : (
                  <span className="status-badge status-ready">Ready</span>
                )}
              </div>
              <p className="room-rate">{formatNaira(room.dailyRate)}</p>
            </article>
          ))}
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
