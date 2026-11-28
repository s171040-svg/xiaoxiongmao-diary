import assert from 'node:assert/strict';
import { getBathBallSpawnPosition } from './bath-ball-position';

const tub = { left: 1080, right: 1244, top: 560, width: 164, height: 123 };
const ball = getBathBallSpawnPosition(tub, { width: 1280, height: 800 });
assert.equal(ball.x, tub.left - 44, 'the ball sits just outside the left end, within reach from the room');
assert.ok(Math.abs((ball.y + 20) - (tub.top + tub.height * (80.5 / 96))) < 1e-9,
  'the ball center is level with the bathtub feet');
assert.ok(ball.y + 40 <= 792 && ball.x >= 8);

const tubAtLeft = { left: 12, right: 120, top: 300, width: 108, height: 81 };
const rightSide = getBathBallSpawnPosition(tubAtLeft, { width: 402, height: 874 });
assert.equal(rightSide.x, tubAtLeft.right + 4, 'when there is no room at the left edge, use the right side');
assert.ok(rightSide.x + 40 <= 394);
console.log('PASS bath ball spawn stays beside the tub at leg height across wide and narrow views');
