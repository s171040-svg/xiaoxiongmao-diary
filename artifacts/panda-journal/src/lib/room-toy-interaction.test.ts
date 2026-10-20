import assert from 'node:assert/strict';
import { advanceToy, createShakeDetector, createToyRuntime, shakeToy, toyVisual } from './room-toy-interaction';
import { isWalkableRoomPoint } from './room-plane';

const detector = createShakeDetector();
assert.equal(detector.move(100, 100, 0), false);
assert.equal(detector.move(140, 100, 100), false, 'moving to a new place alone is not shaking');
assert.equal(detector.move(110, 100, 200), true, 'a back-and-forth wave attracts attention');
detector.reset();
assert.equal(detector.move(50, 50, 300), false);
assert.equal(detector.move(51, 50, 310), false, 'tiny pointer jitter does not count');

const state = createToyRuntime();
let point = { u: .4, v: .6 };
const target = { u: .6, v: .6 };
assert.equal(advanceToy(state, 'teaser', point, target, 20, .02).walking, false, 'simply placing the wand does not start a chase');
assert.equal(shakeToy(state, 100), true);
assert.equal(state.phase, 'curious');
assert.equal(toyVisual(state, 800).sprite, 'toy-curious');
assert.equal(shakeToy(state, 200), false, 'one burst cannot immediately trigger both stages');
assert.equal(advanceToy(state, 'teaser', point, target, 900, .02).walking, false, 'first look is held before approaching');
assert.equal(advanceToy(state, 'teaser', point, target, 1800, .02).walking, true);
assert.equal(state.phase, 'approach');
assert.equal(shakeToy(state, 1900), true);
assert.equal(state.phase, 'excited');
for (let now = 2000; now < 5000 && state.phase !== 'brake'; now += 20) {
  const result = advanceToy(state, 'teaser', point, target, now, .02);
  point = result.point;
  assert.ok(isWalkableRoomPoint(point));
}
assert.equal(state.phase, 'brake', 'second shake ends in contact and braking');
const contactPoint = { ...point };
for (let now = state.since + 20; now <= state.since + 700; now += 20) {
  point = advanceToy(state, 'teaser', point, target, now, .02).point;
}
assert.ok(point.u > contactPoint.u + .05, 'momentum moves the panda forward after contact');
assert.ok(point.u < contactPoint.u + .09, 'braking is a short finite slide');
const waitingNearToy = createToyRuntime(0);
shakeToy(waitingNearToy, 0);
advanceToy(waitingNearToy, 'teaser', target, target, 1800, .02);
assert.equal(waitingNearToy.phase, 'watching', 'nearby toys keep the panda visibly curious instead of returning to idle');
assert.equal(toyVisual(waitingNearToy, 4000).sprite, 'toy-curious');
assert.ok(shakeToy(waitingNearToy, 4100), 'a second wave works after the panda has reached the toy');
assert.equal(waitingNearToy.phase, 'excited');
const fixedFacing = createToyRuntime(0);
fixedFacing.phase = 'brake';
fixedFacing.velocity = { u: 1, v: 0 };
fixedFacing.slideFrom = { u: .5, v: .6 };
assert.ok(advanceToy(fixedFacing, 'teaser', fixedFacing.slideFrom, { u: .4, v: .6 }, 200, .02).lookU > 0,
  'the panda keeps facing forward while skidding past a toy rather than flipping backward');

const wall = createToyRuntime(0);
wall.phase = 'brake';
wall.slideFrom = { u: .565, v: .13 };
wall.velocity = { u: 0, v: -1 };
advanceToy(wall, 'teaser', wall.slideFrom, { u: .565, v: .08 }, 500, .02);
assert.equal(wall.phase, 'dizzy', 'braking into the back wall triggers a separate wall collision');
assert.equal(toyVisual(wall, 1500).sprite, 'toy-wall-dizzy', 'wall dizzy never uses the old delivery-drop art');
advanceToy(wall, 'teaser', wall.slideFrom, target, 3200, .02);
assert.equal(wall.phase, 'recover', 'dizziness exits through real reversed frames');
advanceToy(wall, 'teaser', wall.slideFrom, target, 5500, .02);
assert.equal(wall.phase, 'waiting', 'the panda recovers rather than getting stuck');
const wallJourney = createToyRuntime(0);
let wallPoint = { u: .7, v: .6 };
const wallPhases = new Set<string>();
shakeToy(wallJourney, 0);
for (let time = 0; time < 12000; time += 20) {
  if (time === 1000) shakeToy(wallJourney, time);
  const movement = advanceToy(wallJourney, 'teaser', wallPoint, { u: .565, v: .08 }, time, .02);
  wallPoint = movement.point;
  wallPhases.add(wallJourney.phase);
  assert.ok(isWalkableRoomPoint(wallPoint), 'the entire wall journey stays outside furniture');
}
for (const phase of ['curious', 'excited', 'rush', 'brake', 'dizzy', 'recover', 'waiting']) {
  assert.ok(wallPhases.has(phase), `the full two-wave route reaches ${phase}`);
}

const laser = createToyRuntime();
const laserResult = advanceToy(laser, 'laser', { u: .5, v: .6 }, { u: .5, v: .6 }, 20, .02);
assert.equal(laserResult.contact, true);
assert.equal(laser.phase, 'laser-pounce');
assert.equal(toyVisual(laser, 500).sprite, 'toy-laser', 'laser pounces use independent art and never the wand rush');
console.log('PASS wand toggle-independent shaking, two-stage attention, chase, brake, wall dizziness, recovery, and separate laser pounce');
