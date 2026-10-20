import assert from 'node:assert/strict';
import {
  createPlantFallTracker, isBehindLeftRoomPlants, LEFT_ROOM_PLANT_Z_INDEX, rollLeftPlantFall,
} from './room-plant-interaction';
import {
  isWalkableRoomPoint, isWalkableRoomSegment, nearestWalkableRoomPoint, planRoomWalkPath,
  pointAlongRoomWalkPath, projectRoomPoint, unprojectRoomPoint,
} from './room-plane';

for (const point of [{ u: 0, v: .41 }, { u: .04, v: .86 }]) {
  assert.ok(isWalkableRoomPoint(point), 'both left plants now have reachable space behind them');
  assert.deepEqual(nearestWalkableRoomPoint(point), point);
  assert.ok(isBehindLeftRoomPlants(point), 'both plant silhouettes count as hiding areas');
  assert.equal(isBehindLeftRoomPlants({ ...point, elevation: .2 }), false, 'elevated pandas are not on the plant floor');
  const path = planRoomWalkPath({ u: .4, v: .6 }, point);
  assert.ok(path.length >= 2);
  for (let i = 0; i <= 100; i++) assert.ok(isWalkableRoomPoint(pointAlongRoomWalkPath(path, i / 100)));
  for (const [width, height] of [[1024, 576], [1280, 800], [402, 874]]) {
    const screen = projectRoomPoint(point, width, height);
    const restored = unprojectRoomPoint(screen.x, screen.y, width, height);
    assert.ok(Math.abs(restored.u - point.u) < 1e-9, 'left room movement is not clamped back to the old limit');
  }
}
assert.ok(isWalkableRoomSegment({ u: .2, v: .6 }, { u: 0, v: .6 }), 'leftward chases can reach behind the plants');
assert.equal(isWalkableRoomPoint({ u: .05, v: .15 }), false, 'the left shelf remains solid');
assert.equal(isWalkableRoomPoint({ u: .9, v: .8 }), true, 'the right plant now permits walking behind its foreground layer');
assert.equal(isBehindLeftRoomPlants({ u: .5, v: .8 }), false, 'open floor has no plant penalty');
assert.equal(isBehindLeftRoomPlants({ u: .9, v: .8 }), false);
assert.equal(LEFT_ROOM_PLANT_Z_INDEX, 241, 'left plants sit one level above panda z=240');

const tracker = createPlantFallTracker();
let rolls = 0;
const random = () => { rolls++; return .2; };
assert.equal(rollLeftPlantFall(tracker, false, 0, random), false);
assert.equal(rollLeftPlantFall(tracker, true, 100, random), true, 'entry has a 25% chance');
for (let now = 101; now < 5100; now += 16) assert.equal(rollLeftPlantFall(tracker, true, now, random), false);
assert.equal(rolls, 1, 'animation frames do not multiply the entry probability');
assert.equal(rollLeftPlantFall(tracker, true, 5100, random), false, 'lingering uses a lower 10% chance');
assert.equal(rolls, 2);
assert.equal(rollLeftPlantFall(tracker, true, 10100, () => .09), true);
rollLeftPlantFall(tracker, false, 10200, random);
assert.equal(rollLeftPlantFall(tracker, true, 10300, random), true, 'leaving and entering starts a new entry check');
console.log('PASS expanded left paths, both foreground plants, matching hiding areas, and rate-limited fall chance');
