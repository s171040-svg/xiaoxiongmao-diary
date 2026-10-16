export const WILD_GRAB_MIN_HOLD_MS = 2000;

const MAX_STILL_GAP_MS = 350;
const MIN_MOVEMENT_STEP_PX = 4;
const MIN_DIRECTION_CHANGE_RAD = Math.PI * 1.5;

export type GrabMotionStats = {
  startedAt: number | null;
  lastMovedAt: number;
  distancePx: number;
  directionChangeRad: number;
  lastHeadingRad: number | null;
};

export function createGrabMotionStats(now: number): GrabMotionStats {
  return {
    startedAt: null,
    lastMovedAt: now,
    distancePx: 0,
    directionChangeRad: 0,
    lastHeadingRad: null,
  };
}

export function recordGrabMotion(
  stats: GrabMotionStats,
  from: { x: number; y: number },
  to: { x: number; y: number },
  now: number,
): GrabMotionStats {
  const current = now - stats.lastMovedAt > MAX_STILL_GAP_MS
    ? createGrabMotionStats(now)
    : stats;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distancePx = Math.hypot(dx, dy);
  if (distancePx < MIN_MOVEMENT_STEP_PX) return current;

  const heading = Math.atan2(dy, dx);
  let directionChangeRad = current.directionChangeRad;
  if (current.lastHeadingRad !== null) {
    const rawChange = Math.abs(heading - current.lastHeadingRad);
    directionChangeRad += Math.min(rawChange, 2 * Math.PI - rawChange);
  }

  return {
    startedAt: current.startedAt ?? now,
    lastMovedAt: now,
    distancePx: current.distancePx + distancePx,
    directionChangeRad,
    lastHeadingRad: heading,
  };
}

export function qualifiesAsWildGrab(
  stats: GrabMotionStats,
  grabbedAt: number,
  releasedAt: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  if (stats.startedAt === null) return false;
  const minimumPathPx = Math.max(480, Math.min(viewportWidth, viewportHeight) * 0.55);
  return releasedAt - grabbedAt >= WILD_GRAB_MIN_HOLD_MS
    && releasedAt - stats.startedAt >= WILD_GRAB_MIN_HOLD_MS
    && releasedAt - stats.lastMovedAt <= MAX_STILL_GAP_MS
    && stats.distancePx >= minimumPathPx
    && stats.directionChangeRad >= MIN_DIRECTION_CHANGE_RAD;
}
