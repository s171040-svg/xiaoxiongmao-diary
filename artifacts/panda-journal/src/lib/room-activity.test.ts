import assert from 'node:assert/strict';
import {
  chooseRestActivity,
  getRestDurationMs,
  isMouseBehindOnTurn,
  isNearSleepZone,
  scheduleActivityReset,
  PLUSH_PLAY_DURATION_MS,
} from './room-activity';

const sleepingZonePoint = { u: 0.2, v: 0.18 };
const ordinaryPoint = { u: 0.8, v: 0.72 };
assert.equal(isNearSleepZone(sleepingZonePoint), true);
assert.equal(isNearSleepZone(ordinaryPoint), false);
assert.equal(chooseRestActivity(sleepingZonePoint, () => 0.1), 'sleeping');
assert.equal(chooseRestActivity(ordinaryPoint, () => 0.1), 'lying');
assert.equal(chooseRestActivity(ordinaryPoint, () => 0.17), 'daydreaming');
assert.equal(chooseRestActivity(ordinaryPoint, () => 0.23), null);
assert.equal(chooseRestActivity(ordinaryPoint, () => 0.31), null);
assert.equal(chooseRestActivity(ordinaryPoint, () => 0.35), 'peeking');
assert.equal(chooseRestActivity(ordinaryPoint, () => 0.41), null);
assert.equal(chooseRestActivity(ordinaryPoint, () => 0.46), 'plush-play');
assert.equal(chooseRestActivity(ordinaryPoint, () => 0.53999), 'plush-play');
assert.equal(chooseRestActivity(ordinaryPoint, () => 0.54), null);
assert.equal(chooseRestActivity(sleepingZonePoint, () => 0.5), 'sleeping');
assert.equal(PLUSH_PLAY_DURATION_MS, 60_000);
assert.equal(getRestDurationMs('plush-play', () => 0), 60_000);
assert.equal(getRestDurationMs('plush-play', () => 0.99999), 60_000);
assert.equal(chooseRestActivity(sleepingZonePoint, () => 0.8), null);
assert.equal(chooseRestActivity(sleepingZonePoint, () => 0.9), 'peeking');
assert.equal(getRestDurationMs('lying', () => 0), 330000);
assert.equal(getRestDurationMs('lying', () => 0.999999), 449999);
assert.equal(getRestDurationMs('daydreaming', () => 0), 330000);
assert.equal(getRestDurationMs('daydreaming', () => 0.999999), 449999);
assert.equal(getRestDurationMs('peeking', () => 0), 4000);
assert.equal(getRestDurationMs('peeking', () => 0.999999), 6999);
assert.equal(getRestDurationMs('sleeping', () => 0), 330000);
assert.equal(getRestDurationMs('sleeping', () => 0.999999), 449999);
for (const activity of ['lying', 'sleeping', 'daydreaming'] as const) {
  assert.ok(getRestDurationMs(activity, () => 0) > 5 * 60 * 1000);
}
assert.equal(isMouseBehindOnTurn({ x: 50, y: 100 }, { x: 100, y: 100 }, 'left'), true);
assert.equal(isMouseBehindOnTurn({ x: 150, y: 100 }, { x: 100, y: 100 }, 'left'), false);
assert.equal(isMouseBehindOnTurn({ x: 500, y: 100 }, { x: 100, y: 100 }, 'left'), false);
assert.equal(isMouseBehindOnTurn({ x: 120, y: 100 }, { x: 100, y: 100 }, 'right'), true);

let scheduledCallback: (() => void) | undefined;
let scheduledDelay = 0;
let cancelledTimer: ReturnType<typeof setTimeout> | undefined;
let resetToRoaming = false;
const cancelScheduledActivity = scheduleActivityReset(
  'peeking',
  () => { resetToRoaming = true; },
  (callback, delay) => {
    scheduledCallback = callback;
    scheduledDelay = delay;
    return 123 as ReturnType<typeof setTimeout>;
  },
  (timer) => { cancelledTimer = timer; },
);
assert.ok(scheduledDelay >= 4000 && scheduledDelay <= 6999);
assert.equal(resetToRoaming, false);
scheduledCallback?.();
assert.equal(resetToRoaming, true);
cancelScheduledActivity();
assert.equal(cancelledTimer, 123);

console.log('PASS room activity selection, five-minute rest duration, and automatic reset scheduling');
