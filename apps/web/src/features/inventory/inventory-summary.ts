export type InventorySummary = {
  activeRooms: number;
  occupiedRooms: number;
  readyRooms: number;
  inspectionDueRooms: number;
  maintenanceBlockedRooms: number;
  availableRooms: number;
};

export type InventorySummaryInput = {
  rooms: Array<{
    id: string;
    active: boolean;
  }>;
  occupiedRoomIds: Iterable<string>;
  inspectionDueRoomIds: Iterable<string>;
  maintenanceIssueCountByRoomId: Record<string, number>;
};

export function summarizeInventoryMetrics({
  rooms,
  occupiedRoomIds,
  inspectionDueRoomIds,
  maintenanceIssueCountByRoomId,
}: InventorySummaryInput): InventorySummary {
  const occupied = new Set(occupiedRoomIds);
  const inspectionDue = new Set(inspectionDueRoomIds);
  const activeRooms = rooms.filter((room) => room.active).length;
  const occupiedRooms = rooms.filter((room) => room.active && occupied.has(room.id)).length;
  const inspectionDueRooms = rooms.filter((room) => room.active && inspectionDue.has(room.id)).length;
  const maintenanceBlockedRooms = rooms.filter(
    (room) => room.active && (maintenanceIssueCountByRoomId[room.id] ?? 0) > 0,
  ).length;
  const readyRooms = rooms.filter(
    (room) => room.active
      && !occupied.has(room.id)
      && !inspectionDue.has(room.id)
      && (maintenanceIssueCountByRoomId[room.id] ?? 0) === 0,
  ).length;

  return {
    activeRooms,
    occupiedRooms,
    readyRooms,
    inspectionDueRooms,
    maintenanceBlockedRooms,
    availableRooms: readyRooms,
  };
}
