export const ROOM_FURNITURE_LAYOUT_KEY = 'little-panda-room-furniture-layout-v1';

export type RoomFurnitureId = 'bed' | 'rack' | 'mailbox' | 'bathStation';
export type RoomFurniturePoint = { x: number; y: number };
export type RoomFurnitureLayout = Partial<Record<RoomFurnitureId, RoomFurniturePoint>>;

const furnitureIds: RoomFurnitureId[] = ['bed', 'rack', 'mailbox', 'bathStation'];

export function parseRoomFurnitureLayout(raw: string | null): RoomFurnitureLayout {
  if (!raw) return {};
  const value = JSON.parse(raw) as { version?: unknown; positions?: unknown };
  if (!value || value.version !== 1 || !value.positions || typeof value.positions !== 'object' || Array.isArray(value.positions)) {
    throw new Error('保存的房间布局格式不正确。');
  }

  const positions = value.positions as Record<string, unknown>;
  const layout: RoomFurnitureLayout = {};
  for (const id of furnitureIds) {
    const point = positions[id];
    if (point === undefined) continue;
    if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error('保存的家具位置不正确。');
    const { x, y } = point as { x?: unknown; y?: unknown };
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1
      || typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > 1) {
      throw new Error('保存的家具位置超出范围。');
    }
    layout[id] = { x, y };
  }
  return layout;
}

export function readRoomFurnitureLayout(storage: Pick<Storage, 'getItem'>): RoomFurnitureLayout {
  return parseRoomFurnitureLayout(storage.getItem(ROOM_FURNITURE_LAYOUT_KEY));
}

export function writeRoomFurnitureLayout(
  storage: Pick<Storage, 'setItem'>,
  layout: RoomFurnitureLayout,
) {
  storage.setItem(ROOM_FURNITURE_LAYOUT_KEY, JSON.stringify({ version: 1, positions: layout }));
}

export function clampRoomFurnitureCenter(
  centerX: number,
  centerY: number,
  itemWidth: number,
  itemHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): RoomFurniturePoint {
  const clamp = (value: number, size: number, viewport: number) => {
    if (size >= viewport) return viewport / 2;
    return Math.max(size / 2, Math.min(viewport - size / 2, value));
  };
  return {
    x: clamp(centerX, itemWidth, viewportWidth) / Math.max(1, viewportWidth),
    y: clamp(centerY, itemHeight, viewportHeight) / Math.max(1, viewportHeight),
  };
}
