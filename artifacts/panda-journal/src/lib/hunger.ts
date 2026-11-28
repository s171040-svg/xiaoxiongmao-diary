export const HUNGER_DECAY_INTERVAL_MS = 60_000;

export type HungerClock = {
  lastTickAt: number;
  awakeElapsedMs: number;
  sleeping: boolean;
};

export function createHungerClock(now = Date.now(), sleeping = false): HungerClock {
  return { lastTickAt: now, awakeElapsedMs: 0, sleeping };
}

export function advanceHungerClock(clock: HungerClock, now: number, sleeping: boolean) {
  const elapsed = Math.max(0, now - clock.lastTickAt);
  const awakeElapsedMs = clock.awakeElapsedMs + (clock.sleeping ? 0 : elapsed);
  const lostPoints = Math.floor(awakeElapsedMs / HUNGER_DECAY_INTERVAL_MS);
  return {
    clock: {
      lastTickAt: Math.max(clock.lastTickAt, now),
      awakeElapsedMs: awakeElapsedMs % HUNGER_DECAY_INTERVAL_MS,
      sleeping,
    },
    lostPoints,
  };
}
