export type RoomProp = 'bed' | 'rack' | 'tub' | 'giftStorage' | 'trashCan';
export type RoomPlacedProps = Record<RoomProp, boolean>;

/** Missing flags in older rooms retain their previously visible furniture. */
export function normalizeRoomProps(value?: unknown): RoomPlacedProps {
  const result: RoomPlacedProps = { bed: false, rack: true, tub: true, giftStorage: true, trashCan: true };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(result) as RoomProp[]) {
      const saved = (value as Record<string, unknown>)[key];
      if (typeof saved === 'boolean') result[key] = saved;
    }
  }
  result.bed = false;
  return result;
}
