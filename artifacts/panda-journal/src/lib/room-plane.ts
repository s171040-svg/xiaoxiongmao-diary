export type RoomPoint = { u: number; v: number };

export type RoomProjection = {
  x: number;
  y: number;
  scale: number;
  zIndex: number;
  depth: number;
  shadowScale: number;
  shadowOpacity: number;
  shadowBlur: number;
  brightness: number;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ROOM_MIN = 0.08;
const ROOM_MAX = 0.92;
const PANDA_MIN_SCALE = 0.62;
const ROOM_IMAGE_WIDTH = 800;
const ROOM_IMAGE_HEIGHT = 360;
const ROOM_IMAGE_FLOOR_FAR_Y = 274;
const ROOM_IMAGE_FLOOR_NEAR_Y = 350;
const FLOOR_FAR_HALF_WIDTH = 27;
const FLOOR_NEAR_HALF_WIDTH = 48;

const clampRoom = (value: number) => Math.min(ROOM_MAX, Math.max(ROOM_MIN, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function roomFloorBoundsPercent(width: number, height: number): { far: number; near: number } {
  const viewportWidth = Math.max(1, width);
  const viewportHeight = Math.max(1, height);
  const imageScale = Math.min(viewportWidth / ROOM_IMAGE_WIDTH, viewportHeight / ROOM_IMAGE_HEIGHT);
  const imageTop = viewportHeight - ROOM_IMAGE_HEIGHT * imageScale;
  const toViewportPercent = (imageY: number) => ((imageTop + imageY * imageScale) / viewportHeight) * 100;
  return {
    far: toViewportPercent(ROOM_IMAGE_FLOOR_FAR_Y),
    near: toViewportPercent(ROOM_IMAGE_FLOOR_NEAR_Y),
  };
}

function lightFalloff(u: number, v: number, centerU: number, centerV: number, radiusU: number, radiusV: number) {
  return Math.max(0, 1 - Math.hypot((u - centerU) / radiusU, (v - centerV) / radiusV));
}

export function randomRoomPoint(random = Math.random): RoomPoint {
  return { u: 0.08 + random() * 0.84, v: 0.08 + random() * 0.84 };
}

export function roomDepthZIndex(depth: number): number {
  return 10 + Math.round(clamp(depth) * 100);
}

/**
 * Keeps a room object slightly above a character standing at its depth.
 * Characters at greater depth naturally sort in front of it.
 */
export function roomFurnitureZIndex(depth: number): number {
  return roomDepthZIndex(depth) + 1;
}

/**
 * Maps room-plane coordinates to the web room's visible floor.
 * v=0 is the far wall; v=1 is the front edge closest to the viewer.
 */
export function projectRoomPoint(point: RoomPoint, viewportWidth = ROOM_IMAGE_WIDTH, viewportHeight = ROOM_IMAGE_HEIGHT): RoomProjection {
  const u = clamp(point.u);
  const depth = clamp(point.v);
  const floor = roomFloorBoundsPercent(viewportWidth, viewportHeight);
  const halfWidth = lerp(FLOOR_FAR_HALF_WIDTH, FLOOR_NEAR_HALF_WIDTH, depth);
  const windowLight = lightFalloff(u, depth, 0.24, 0.24, 0.38, 0.28) * 0.028;
  const lampLight = lightFalloff(u, depth, 0.74, 0.46, 0.24, 0.2) * 0.02;
  const ambientBrightness = Math.min(1, 0.88 + depth * 0.1 + windowLight + lampLight);
  return {
    x: 50 + (u - 0.5) * 2 * halfWidth,
    y: lerp(floor.far, floor.near, depth),
    scale: PANDA_MIN_SCALE,
    zIndex: roomDepthZIndex(depth),
    depth,
    shadowScale: lerp(0.58, 1.06, depth),
    shadowOpacity: lerp(0.26, 0.68, depth),
    shadowBlur: lerp(2.8, 1.25, depth),
    brightness: ambientBrightness,
  };
}

/**
 * Keeps the Electron floating-pet presentation on its original screen-space projection.
 */
export function projectDesktopPoint(point: RoomPoint): RoomProjection {
  const u = clamp(point.u);
  const v = clamp(point.v);
  const halfWidth = 28 + v * 18;
  return {
    x: 50 + (u - 0.5) * 2 * halfWidth,
    y: 14 + v * 62,
    scale: PANDA_MIN_SCALE,
    zIndex: 10 + Math.round(v * 100),
    depth: v,
    shadowScale: 1,
    shadowOpacity: 0.7,
    shadowBlur: 2,
    brightness: 1,
  };
}

/** Maps the web companion to the available viewport until a room boundary is configured. */
export function projectScreenPoint(point: RoomPoint): RoomProjection {
  const u = clamp(point.u);
  const depth = clamp(point.v);
  return {
    x: u * 100,
    y: depth * 100,
    scale: PANDA_MIN_SCALE,
    zIndex: roomDepthZIndex(depth),
    depth,
    shadowScale: 0.9,
    shadowOpacity: 0.5,
    shadowBlur: 2,
    brightness: 1,
  };
}

export function unprojectScreenPoint(x: number, y: number): RoomPoint {
  return {
    u: clampRoom(x / 100),
    v: clampRoom(y / 100),
  };
}

export function unprojectRoomPoint(x: number, y: number, viewportWidth = ROOM_IMAGE_WIDTH, viewportHeight = ROOM_IMAGE_HEIGHT): RoomPoint {
  const floor = roomFloorBoundsPercent(viewportWidth, viewportHeight);
  const v = clampRoom((y - floor.far) / (floor.near - floor.far));
  const halfWidth = lerp(FLOOR_FAR_HALF_WIDTH, FLOOR_NEAR_HALF_WIDTH, v);
  return {
    u: clampRoom(0.5 + (x - 50) / (2 * halfWidth)),
    v,
  };
}

export function blendRoomPoint(from: RoomPoint, to: RoomPoint, progress: number): RoomPoint {
  const t = clamp(progress);
  const eased = t * t * (3 - 2 * t);
  return {
    u: from.u + (to.u - from.u) * eased,
    v: from.v + (to.v - from.v) * eased,
  };
}

export function randomRoomControlPoint(from: RoomPoint, to: RoomPoint, random = Math.random): RoomPoint {
  const dx = to.u - from.u;
  const dy = to.v - from.v;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) return { ...from };

  const offset = (random() * 2 - 1) * Math.min(0.24, distance * 0.48);
  return {
    u: clampRoom((from.u + to.u) / 2 - (dy / distance) * offset),
    v: clampRoom((from.v + to.v) / 2 + (dx / distance) * offset),
  };
}

export function quadraticRoomPoint(
  from: RoomPoint,
  control: RoomPoint,
  to: RoomPoint,
  progress: number,
): RoomPoint {
  const t = clamp(progress);
  const inverse = 1 - t;
  return {
    u: clampRoom(inverse * inverse * from.u + 2 * inverse * t * control.u + t * t * to.u),
    v: clampRoom(inverse * inverse * from.v + 2 * inverse * t * control.v + t * t * to.v),
  };
}

export function gaitProgress(progress: number, stepCount: number): number {
  const t = clamp(progress);
  if (t === 0 || t === 1) return t;

  const steps = Math.max(1, Math.floor(stepCount));
  const phase = t * steps;
  const completed = Math.min(steps - 1, Math.floor(phase));
  const inStep = phase - completed;
  const stride = Math.min(1, inStep / 0.78);
  const easedStride = 1 - (1 - stride) ** 2;
  return (completed + easedStride) / steps;
}
