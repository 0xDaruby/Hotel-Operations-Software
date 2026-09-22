import { createClient } from '@/lib/supabase/server';

type StoredRow = Record<string, unknown>;

export type RoomCategory = {
  id: string;
  name: string;
  dailyRate: number | null;
};

export type HotelRoom = {
  id: string;
  number: string;
  floor: string;
  categoryId: string | null;
  categoryName: string;
  dailyRate: number | null;
  active: boolean;
};

export type Inventory = {
  categories: RoomCategory[];
  rooms: HotelRoom[];
};

export type { InventorySummary, InventorySummaryInput } from './inventory-summary';

export { summarizeInventoryMetrics } from './inventory-summary';

function stringValue(row: StoredRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function numberValue(row: StoredRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function booleanValue(row: StoredRow, keys: string[], fallback: boolean) {
  for (const key of keys) {
    if (typeof row[key] === 'boolean') return row[key] as boolean;
  }
  return fallback;
}

function floorFor(roomNumber: string) {
  const firstDigit = roomNumber.match(/^([1-9])\d{2}$/)?.[1];
  return firstDigit ? `Floor ${firstDigit}` : 'Floor not recorded';
}

function naturalRoomOrder(a: HotelRoom, b: HotelRoom) {
  return a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' });
}

export async function getInventory(): Promise<Inventory> {
  const supabase = await createClient();
  const [roomsResult, categoriesResult] = await Promise.all([
    supabase.from('rooms').select('*'),
    supabase.from('room_categories').select('*'),
  ]);

  if (roomsResult.error) throw new Error(`Unable to load rooms: ${roomsResult.error.message}`);
  if (categoriesResult.error) {
    throw new Error(`Unable to load room categories: ${categoriesResult.error.message}`);
  }

  const categories = ((categoriesResult.data ?? []) as StoredRow[])
    .map((row) => ({
      id: stringValue(row, ['id']) ?? '',
      name: stringValue(row, ['name', 'display_name', 'label']) ?? 'Unlabelled category',
      dailyRate: numberValue(row, ['daily_rate', 'rate', 'price_per_day', 'amount']),
    }))
    .filter((category) => category.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const rooms = ((roomsResult.data ?? []) as StoredRow[])
    .map((row) => {
      const categoryId = stringValue(row, ['category_id', 'room_category_id']);
      const category = categoryId ? categoriesById.get(categoryId) : undefined;
      const number = stringValue(row, ['room_number', 'number', 'code']) ?? 'Unnumbered room';

      return {
        id: stringValue(row, ['id']) ?? number,
        number,
        floor: floorFor(number),
        categoryId,
        categoryName: category?.name ?? 'Category not recorded',
        dailyRate: category?.dailyRate ?? null,
        active: booleanValue(row, ['active', 'is_active'], true),
      };
    })
    .sort(naturalRoomOrder);

  return { categories, rooms };
}
