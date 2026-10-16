import type { RoomPoint } from './room-plane';

export type RoomActivityState = 'roaming' | 'lying' | 'sleeping' | 'daydreaming' | 'peeking';
export type RestActivityState = Exclude<RoomActivityState, 'roaming'>;
export type ScreenPoint = { x: number; y: number };
export type RoomFacing = 'left' | 'right';

export const MOUSE_STARTLE_RADIUS_PX = 156;

export function isMouseBehindOnTurn(
  mouse: ScreenPoint,
  panda: ScreenPoint,
  nextFacing: RoomFacing,
  radius = MOUSE_STARTLE_RADIUS_PX,
): boolean {
  const dx = mouse.x - panda.x;
  const dy = mouse.y - panda.y;
  const mouseIsOnTurnSide = nextFacing === 'left' ? dx < -18 : dx > 18;
  return mouseIsOnTurnSide && Math.hypot(dx, dy) <= radius;
}

const SLEEP_ZONE = {
  minU: 0.08,
  maxU: 0.34,
  minV: 0.08,
  maxV: 0.3,
} as const;

export function isNearSleepZone(point: RoomPoint): boolean {
  return point.u >= SLEEP_ZONE.minU && point.u <= SLEEP_ZONE.maxU
    && point.v >= SLEEP_ZONE.minV && point.v <= SLEEP_ZONE.maxV;
}

export function chooseRestActivity(
  point: RoomPoint,
  random: () => number = Math.random,
): RestActivityState | null {
  const sleepChance = isNearSleepZone(point) ? 0.55 : 0.025;
  const roll = random();
  if (roll < sleepChance) return 'sleeping';
  if (roll < sleepChance + 0.14) return 'lying';
  if (roll < sleepChance + 0.2) return 'daydreaming';
  if (roll < sleepChance + 0.32) return null;
  if (roll < sleepChance + 0.38) return 'peeking';
  return null;
}

export function getRestDurationMs(
  activity: RestActivityState,
  random: () => number = Math.random,
): number {
  if (activity === 'daydreaming') return 3200 + Math.floor(random() * 2400);
  if (activity === 'peeking') return 4000 + Math.floor(random() * 3000);
  return 10000 + Math.floor(random() * 10000);
}

export function scheduleActivityReset(
  activity: RestActivityState,
  onReset: () => void,
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
): () => void {
  const timer = schedule(onReset, getRestDurationMs(activity));
  return () => cancel(timer);
}
