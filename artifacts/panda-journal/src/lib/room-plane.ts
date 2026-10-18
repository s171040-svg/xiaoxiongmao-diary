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
export const ROOM_IMAGE_WIDTH = 1024;
export const ROOM_IMAGE_HEIGHT = 576;
const ROOM_IMAGE_FLOOR_FAR_Y = 300;
const ROOM_IMAGE_FLOOR_NEAR_Y = 565;
const FLOOR_FAR_HALF_WIDTH = 46;
const FLOOR_NEAR_HALF_WIDTH = 48;

const WALKER_CLEARANCE = 0.018;
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

export function roomImageRegionClipPath(
  region: { left: number; top: number; right: number; bottom: number },
  viewportWidth: number,
  viewportHeight: number,
): string {
  const scale = Math.min(viewportWidth / ROOM_IMAGE_WIDTH, viewportHeight / ROOM_IMAGE_HEIGHT);
  const imageLeft = (viewportWidth - ROOM_IMAGE_WIDTH * scale) / 2;
  const imageTop = viewportHeight - ROOM_IMAGE_HEIGHT * scale;
  const point = (x: number, y: number) => `${(
    (imageLeft + x * scale) / viewportWidth * 100
  ).toFixed(3)}% ${((imageTop + y * scale) / viewportHeight * 100).toFixed(3)}%`;
  return `polygon(${point(region.left, region.top)}, ${point(region.right, region.top)}, ${point(region.right, region.bottom)}, ${point(region.left, region.bottom)})`;
}
function lightFalloff(u: number, v: number, centerU: number, centerV: number, radiusU: number, radiusV: number) {
  return Math.max(0, 1 - Math.hypot((u - centerU) / radiusU, (v - centerV) / radiusV));
}

export function randomRoomPoint(random = Math.random): RoomPoint {
  return { u: 0.08 + random() * 0.84, v: 0.08 + random() * 0.84 };
}

function pointInObstacle(point: RoomPoint, obstacle: typeof ROOM_OBSTACLES[number], margin = WALKER_CLEARANCE) {
  return point.u >= obstacle.minU - margin && point.u <= obstacle.maxU + margin
    && point.v >= obstacle.minV - margin && point.v <= obstacle.maxV + margin;
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

let walkableRoomSamples: RoomPoint[] | null = null;

/** Samples only from the open floor; the legacy sampler remains for the desktop pet. */
export function randomWalkableRoomPoint(random = Math.random): RoomPoint {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const point = {
      u: ROOM_MIN + random() * (ROOM_MAX - ROOM_MIN),
      v: ROOM_MIN + random() * (ROOM_MAX - ROOM_MIN),
    };
    if (isWalkableRoomPoint(point)) return point;
  }
  const samples = getWalkableRoomSamples();
  const index = Math.min(samples.length - 1, Math.floor(random() * samples.length));
  return { ...samples[index] };
}

export function roomWalkPathLength(path: RoomPoint[]): number {
  return path.slice(1).reduce((length, point, index) =>
    length + Math.hypot(point.u - path[index].u, point.v - path[index].v), 0);
}

export function isWalkableRoomPoint(point: RoomPoint): boolean {
  if (point.u < ROOM_MIN || point.u > ROOM_MAX || point.v < ROOM_MIN || point.v > ROOM_MAX) return false;
  return !ROOM_OBSTACLES.some(obstacle => pointInObstacle(point, obstacle));
}

const ROOM_OBSTACLES = [
  { minU: 0.31, maxU: 0.54, minV: 0, maxV: 0.1 }, // cat tree base
  { minU: 0.57, maxU: 0.77, minV: 0, maxV: 0.08 }, // panda armchair
  { minU: 0.79, maxU: 0.96, minV: 0, maxV: 0.16 }, // wardrobe
  { minU: 0.9, maxU: 1, minV: 0.1, maxV: 0.3 }, // dresser
  { minU: 0, maxU: 0.13, minV: 0, maxV: 0.28 }, // left shelf and table
  { minU: 0, maxU: 0.14, minV: 0.38, maxV: 1 }, // bottom-left planter
  { minU: 0.82, maxU: 1, minV: 0.52, maxV: 1 }, // bottom-right plant
] as const;

function getWalkableRoomSamples(): RoomPoint[] {
  if (walkableRoomSamples) return walkableRoomSamples;
  const samples: RoomPoint[] = [];
  const step = 0.012;
  for (let u = ROOM_MIN + step / 2; u < ROOM_MAX; u += step) {
    for (let v = ROOM_MIN + step / 2; v < ROOM_MAX; v += step) {
      const point = { u, v };
      if (isWalkableRoomPoint(point)) samples.push(point);
    }
  }
  walkableRoomSamples = samples;
  return samples;
}

/**
 * Routes around the room's fixed furniture using a visibility graph of padded corners.
 * Every returned segment is checked against the walkable floor and obstacle clearances.
 */
export function planRoomWalkPath(fromPoint: RoomPoint, toPoint: RoomPoint): RoomPoint[] {
  const from = nearestWalkableRoomPoint(fromPoint);
  const to = nearestWalkableRoomPoint(toPoint);
  if (Math.hypot(to.u - from.u, to.v - from.v) < 0.001) return [from];
  if (roomSegmentIsWalkable(from, to)) return [from, to];

  const cornerPadding = WALKER_CLEARANCE + 0.006;
  const nodes = [from, to];
  for (const obstacle of ROOM_OBSTACLES) {
    for (const corner of [
      { u: obstacle.minU - cornerPadding, v: obstacle.minV - cornerPadding },
      { u: obstacle.minU - cornerPadding, v: obstacle.maxV + cornerPadding },
      { u: obstacle.maxU + cornerPadding, v: obstacle.minV - cornerPadding },
      { u: obstacle.maxU + cornerPadding, v: obstacle.maxV + cornerPadding },
    ]) {
      if (isWalkableRoomPoint(corner)) nodes.push(corner);
    }
  }

  const distances = nodes.map((_, index) => index === 0 ? 0 : Number.POSITIVE_INFINITY);
  const previous = nodes.map(() => -1);
  const visited = new Set<number>();
  while (visited.size < nodes.length) {
    let current = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      if (visited.has(index)) continue;
      if (current < 0 || distances[index] < distances[current]) current = index;
    }
    if (current < 0 || !Number.isFinite(distances[current])) break;
    if (current === 1) break;
    visited.add(current);
    for (let next = 0; next < nodes.length; next += 1) {
      if (next === current || visited.has(next) || !roomSegmentIsWalkable(nodes[current], nodes[next])) continue;
      const candidateDistance = distances[current]
        + Math.hypot(nodes[next].u - nodes[current].u, nodes[next].v - nodes[current].v);
      if (candidateDistance >= distances[next]) continue;
      distances[next] = candidateDistance;
      previous[next] = current;
    }
  }

  if (!Number.isFinite(distances[1])) return [from];
  const route: RoomPoint[] = [];
  for (let node = 1; node >= 0; node = previous[node]) {
    route.unshift(nodes[node]);
    if (node === 0) break;
  }
  return route;
}

function roomSegmentIsWalkable(from: RoomPoint, to: RoomPoint): boolean {
  const distance = Math.hypot(to.u - from.u, to.v - from.v);
  const steps = Math.max(1, Math.ceil(distance / 0.01));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    if (!isWalkableRoomPoint({
      u: from.u + (to.u - from.u) * progress,
      v: from.v + (to.v - from.v) * progress,
    })) return false;
  }
  return true;
}

export function pointAlongRoomWalkPath(path: RoomPoint[], progress: number): RoomPoint {
  if (path.length < 2) return { ...path[0] };
  const totalLength = roomWalkPathLength(path);
  let remaining = clamp(progress) * totalLength;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    const segmentLength = Math.hypot(to.u - from.u, to.v - from.v);
    if (remaining <= segmentLength || index === path.length - 1) {
      const segmentProgress = segmentLength === 0 ? 1 : Math.min(1, remaining / segmentLength);
      return {
        u: from.u + (to.u - from.u) * segmentProgress,
        v: from.v + (to.v - from.v) * segmentProgress,
      };
    }
    remaining -= segmentLength;
  }
  return { ...path[path.length - 1] };
}

/** Keeps a manually moved pet on the floor and outside furniture footprints. */
export function nearestWalkableRoomPoint(point: RoomPoint): RoomPoint {
  const bounded = {
    u: Math.min(ROOM_MAX, Math.max(ROOM_MIN, point.u)),
    v: Math.min(ROOM_MAX, Math.max(ROOM_MIN, point.v)),
  };
  if (isWalkableRoomPoint(bounded)) return bounded;

  const candidates: RoomPoint[] = [];
  for (const obstacle of ROOM_OBSTACLES) {
    const minU = obstacle.minU - WALKER_CLEARANCE;
    const maxU = obstacle.maxU + WALKER_CLEARANCE;
    const minV = obstacle.minV - WALKER_CLEARANCE;
    const maxV = obstacle.maxV + WALKER_CLEARANCE;
    if (bounded.u < minU || bounded.u > maxU || bounded.v < minV || bounded.v > maxV) continue;
    const margin = 0.002;
    candidates.push(
      { u: minU - margin, v: Math.min(maxV, Math.max(minV, bounded.v)) },
      { u: maxU + margin, v: Math.min(maxV, Math.max(minV, bounded.v)) },
      { u: Math.min(maxU, Math.max(minU, bounded.u)), v: minV - margin },
      { u: Math.min(maxU, Math.max(minU, bounded.u)), v: maxV + margin },
    );
  }
  const safeCandidates = candidates.filter(isWalkableRoomPoint);
  if (safeCandidates.length) {
    return safeCandidates.reduce((nearest, candidate) =>
      Math.hypot(candidate.u - bounded.u, candidate.v - bounded.v)
        < Math.hypot(nearest.u - bounded.u, nearest.v - bounded.v) ? candidate : nearest);
  }

  return getWalkableRoomSamples().reduce((nearest, candidate) =>
    Math.hypot(candidate.u - bounded.u, candidate.v - bounded.v)
      < Math.hypot(nearest.u - bounded.u, nearest.v - bounded.v) ? candidate : nearest);
}

export function isWalkableRoomSegment(from: RoomPoint, to: RoomPoint): boolean {
  return roomSegmentIsWalkable(from, to);
}
