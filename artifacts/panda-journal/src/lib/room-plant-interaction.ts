import { projectRoomPoint, ROOM_IMAGE_HEIGHT, ROOM_IMAGE_WIDTH, type RoomPoint } from './room-plane';

// These cut-outs reuse only the plants' silhouettes, not surrounding floor.
export const LEFT_ROOM_PLANTS = [
  {
    id: 'lower-left-plant',
    polygon: [[0, 315], [11, 316], [30, 304], [43, 305], [30, 327], [45, 332], [56, 341], [68, 345], [67, 352], [51, 352], [64, 367], [60, 374], [38, 361], [47, 383], [44, 403], [32, 396], [29, 427], [22, 443], [0, 448]],
  },
  {
    id: 'front-left-plant',
    polygon: [[0, 450], [11, 445], [14, 438], [22, 442], [25, 455], [43, 443], [58, 438], [71, 438], [69, 446], [60, 452], [53, 463], [75, 457], [88, 460], [97, 468], [84, 474], [115, 478], [133, 484], [137, 493], [137, 576], [0, 576]],
  },
] as const;
export const LEFT_ROOM_PLANT_Z_INDEX = 241;

function contains(polygon: readonly (readonly [number, number])[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function isBehindLeftRoomPlants(point: RoomPoint, width = ROOM_IMAGE_WIDTH, height = ROOM_IMAGE_HEIGHT) {
  if ((point.elevation ?? 0) > .001) return false;
  const projected = projectRoomPoint(point, width, height);
  const scale = Math.min(width / ROOM_IMAGE_WIDTH, height / ROOM_IMAGE_HEIGHT);
  const imageX = (projected.x / 100 * width - (width - ROOM_IMAGE_WIDTH * scale) / 2) / scale;
  const imageY = (projected.y / 100 * height - (height - ROOM_IMAGE_HEIGHT * scale) / 2) / scale;
  // Sample the feet and body, rather than treating the whole left side as hidden.
  return LEFT_ROOM_PLANTS.some(plant =>
    [0, 14, 28].some(offset => contains(plant.polygon, imageX, imageY - offset)));
}

export function createPlantFallTracker() { return { inside: false, nextRoll: 0 }; }
export function rollLeftPlantFall(
  tracker: ReturnType<typeof createPlantFallTracker>, inside: boolean, now: number, random = Math.random,
) {
  if (!inside) { tracker.inside = false; tracker.nextRoll = 0; return false; }
  const entered = !tracker.inside;
  tracker.inside = true;
  if (!entered && now < tracker.nextRoll) return false;
  tracker.nextRoll = now + 5000;
  return random() < (entered ? .25 : .1);
}
