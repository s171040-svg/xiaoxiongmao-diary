import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceHungerClock, createHungerClock, HUNGER_DECAY_INTERVAL_MS } from './hunger';

test('hunger drops one point per awake minute and carries partial minutes', () => {
  const start = createHungerClock(10_000);
  const half = advanceHungerClock(start, 10_000 + HUNGER_DECAY_INTERVAL_MS / 2, false);
  assert.equal(half.lostPoints, 0);
  assert.equal(half.clock.awakeElapsedMs, HUNGER_DECAY_INTERVAL_MS / 2);

  const full = advanceHungerClock(half.clock, 10_000 + HUNGER_DECAY_INTERVAL_MS, false);
  assert.equal(full.lostPoints, 1);
  assert.equal(full.clock.awakeElapsedMs, 0);
});

test('sleeping time does not count and the remaining awake time resumes afterward', () => {
  const start = createHungerClock(0);
  const beforeSleep = advanceHungerClock(start, 40_000, false);
  const sleepStarted = advanceHungerClock(beforeSleep.clock, 40_000, true);
  const asleep = advanceHungerClock(sleepStarted.clock, 4_040_000, true);
  assert.equal(asleep.lostPoints, 0);
  assert.equal(asleep.clock.awakeElapsedMs, 40_000);

  const awakeStarted = advanceHungerClock(asleep.clock, 4_040_000, false);
  const awake = advanceHungerClock(awakeStarted.clock, 4_060_000, false);
  assert.equal(awake.lostPoints, 1);
  assert.equal(awake.clock.awakeElapsedMs, 0);
});

test('clock never applies negative elapsed time after a clock adjustment', () => {
  const start = createHungerClock(10_000);
  const adjusted = advanceHungerClock(start, 5_000, false);
  assert.equal(adjusted.lostPoints, 0);
  assert.equal(adjusted.clock.lastTickAt, 10_000);
  assert.equal(adjusted.clock.awakeElapsedMs, 0);
});
