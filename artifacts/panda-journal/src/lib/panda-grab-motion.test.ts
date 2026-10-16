import assert from 'node:assert/strict';
import {
  createGrabMotionStats,
  qualifiesAsWildGrab,
  recordGrabMotion,
} from './panda-grab-motion';

function circleMotion(durationMs: number, turns: number) {
  let stats = createGrabMotionStats(0);
  const steps = durationMs / 50;
  for (let step = 1; step <= steps; step += 1) {
    const angle = step / steps * turns * 2 * Math.PI;
    const next = {
      x: 320 + Math.cos(angle) * 60,
      y: 240 + Math.sin(angle) * 60,
    };
    const previousAngle = (step - 1) / steps * turns * 2 * Math.PI;
    const previous = {
      x: 320 + Math.cos(previousAngle) * 60,
      y: 240 + Math.sin(previousAngle) * 60,
    };
    stats = recordGrabMotion(stats, previous, next, step * 50);
  }
  return stats;
}

const frantic = circleMotion(2100, 2.5);
assert.equal(qualifiesAsWildGrab(frantic, 0, 2100, 1280, 800), true,
  'a sustained, multi-turn drag held for two seconds triggers the dizzy fall');
assert.equal(qualifiesAsWildGrab(frantic, 0, 1999, 1280, 800), false,
  'a drag shorter than two seconds never triggers');

let straight = createGrabMotionStats(0);
for (let step = 1; step <= 42; step += 1) {
  straight = recordGrabMotion(straight, { x: (step - 1) * 12, y: 100 }, { x: step * 12, y: 100 }, step * 50);
}
assert.equal(qualifiesAsWildGrab(straight, 0, 2100, 1280, 800), false,
  'fast movement in one direction is not treated as dizzying');

let interrupted = circleMotion(1000, 2);
for (let step = 1; step <= 12; step += 1) {
  const previousAngle = (step - 1) / 12 * Math.PI * 4;
  const angle = step / 12 * Math.PI * 4;
  interrupted = recordGrabMotion(
    interrupted,
    { x: 320 + Math.cos(previousAngle) * 60, y: 240 + Math.sin(previousAngle) * 60 },
    { x: 320 + Math.cos(angle) * 60, y: 240 + Math.sin(angle) * 60 },
    1500 + step * 50,
  );
}
assert.equal(qualifiesAsWildGrab(interrupted, 0, 2200, 1280, 800), false,
  'a long pause resets the continuous-motion window');

assert.equal(
  qualifiesAsWildGrab(createGrabMotionStats(0), 0, 6000, 1280, 800),
  false,
  'holding still does not count as wild movement',
);

console.log('PASS grab-motion thresholds: sustained circles trigger, short, straight, paused and still drags do not');
