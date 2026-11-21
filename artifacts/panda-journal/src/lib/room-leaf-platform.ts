import { LEAF_PLATFORM_WALK_BOUNDS, ROOM_IMAGE_HEIGHT, ROOM_IMAGE_WIDTH, roomPointAtImagePosition } from './room-plane';

export type LeafPlatformActivity = 'sleeping' | 'playing' | 'sitting';
export const LEAF_PLATFORM_POINT = roomPointAtImagePosition(385, 235);
export const PLATFORM_LANDING_FRAMES = Array.from({ length: 6 },
  (_, index) => `transitions/platform-grab-to-idle-${index + 1}.png`);

export function leafPlatformRect(width: number, height: number) {
  const scale = Math.min(width / ROOM_IMAGE_WIDTH, height / ROOM_IMAGE_HEIGHT);
  return {
    left: (width - ROOM_IMAGE_WIDTH * scale) / 2 + 337 * scale,
    top: (height - ROOM_IMAGE_HEIGHT * scale) / 2 + 180 * scale,
    width: 112 * scale,
    height: 61 * scale,
  };
}

export function isLeafPlatformScreenPoint(x: number, y: number, width: number, height: number) {
  const rect = leafPlatformRect(width, height);
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

export function chooseLeafActivity(random = Math.random): LeafPlatformActivity {
  const roll = random();
  return roll < 1 / 3 ? 'sleeping' : roll < 2 / 3 ? 'playing' : 'sitting';
}

export function leafPlatformRestPoint(activity: LeafPlatformActivity, random = Math.random) {
  const { left, right, y } = LEAF_PLATFORM_WALK_BOUNDS;
  // Playing stays within paw's reach of the hanging leaf.
  return roomPointAtImagePosition(activity === 'playing' ? 385 : left + random() * (right - left), y);
}

export function leafActivityDuration(activity: LeafPlatformActivity, random = Math.random) {
  return activity === 'sleeping' ? 300_000 + random() * 180_000
    : activity === 'sitting' ? 30_000 + random() * 60_000 : 12_000 + random() * 18_000;
}
