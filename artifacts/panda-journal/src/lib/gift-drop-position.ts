import {
  isWalkableRoomPoint,
  projectRoomPoint,
  ROOM_IMAGE_HEIGHT,
  ROOM_IMAGE_WIDTH,
  unprojectRoomWalkableSurfacePoint,
  type RoomPoint,
} from './room-plane';

type ImagePoint = { x: number; y: number };

const RUG = { x: 512, y: 416, radiusX: 402, radiusY: 110 };
const STORAGE_BOX_IMAGE_POINT: ImagePoint = { x: 350, y: 480 };
const ROOM_FURNITURE_KEEP_OUTS = [
  { x: 190, y: 405, radius: 74 },
  { x: 820, y: 407, radius: 74 },
  { x: 745, y: 465, radius: 78 },
  { ...STORAGE_BOX_IMAGE_POINT, radius: 68 },
] as const;

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function roomPointAtCarpetImagePoint(point: ImagePoint): RoomPoint {
  return unprojectRoomWalkableSurfacePoint(
    (point.x / ROOM_IMAGE_WIDTH) * 100,
    (point.y / ROOM_IMAGE_HEIGHT) * 100,
    ROOM_IMAGE_WIDTH,
    ROOM_IMAGE_HEIGHT,
  );
}

function isInsideRug(point: ImagePoint): boolean {
  const x = (point.x - RUG.x) / RUG.radiusX;
  const y = (point.y - RUG.y) / RUG.radiusY;
  return x * x + y * y <= 0.88 ** 2;
}

function isNearFurniture(point: ImagePoint): boolean {
  return ROOM_FURNITURE_KEEP_OUTS.some(keepOut =>
    Math.hypot(point.x - keepOut.x, point.y - keepOut.y) < keepOut.radius);
}

export function getGiftStorageRoomPoint(): RoomPoint {
  return roomPointAtCarpetImagePoint(STORAGE_BOX_IMAGE_POINT);
}

/** Pick a stable, random-looking spot on the carpet so a pending gift never jumps on rerender. */
export function getGiftDropRoomPoint(giftId: string): RoomPoint {
  const random = seededRandom(giftId);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 0.92;
    const imagePoint = {
      x: RUG.x + Math.cos(angle) * RUG.radiusX * radius,
      y: RUG.y + Math.sin(angle) * RUG.radiusY * radius,
    };
    if (!isInsideRug(imagePoint) || isNearFurniture(imagePoint)) continue;

    const roomPoint = roomPointAtCarpetImagePoint(imagePoint);
    if (isWalkableRoomPoint(roomPoint)) return roomPoint;
  }

  const safeCenter = roomPointAtCarpetImagePoint({ x: 530, y: 442 });
  return isWalkableRoomPoint(safeCenter) ? safeCenter : getGiftStorageRoomPoint();
}

/** Image-space bounds are useful for checking that drops stay on the rug at every viewport size. */
export function getGiftDropImagePosition(giftId: string): ImagePoint {
  const projected = projectRoomPoint(getGiftDropRoomPoint(giftId), ROOM_IMAGE_WIDTH, ROOM_IMAGE_HEIGHT);
  return {
    x: (projected.x / 100) * ROOM_IMAGE_WIDTH,
    y: (projected.y / 100) * ROOM_IMAGE_HEIGHT,
  };
}
