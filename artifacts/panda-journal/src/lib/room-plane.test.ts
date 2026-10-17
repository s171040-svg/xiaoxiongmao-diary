import assert from 'node:assert/strict';
import {
  blendRoomPoint,
  gaitProgress,
  isWalkableRoomPoint,
  isWalkableRoomSegment,
  nearestWalkableRoomPoint,
  planRoomWalkPath,
  pointAlongRoomWalkPath,
  projectDesktopPoint,
  projectRoomPoint,
  projectScreenPoint,
  quadraticRoomPoint,
  randomRoomControlPoint,
  randomRoomPoint,
  randomWalkableRoomPoint,
  roomImageRegionClipPath,
  roomWalkPathLength,
  roomFurnitureZIndex,
  roomDepthZIndex,
  roomFloorBoundsPercent,
  ROOM_IMAGE_HEIGHT,
  ROOM_IMAGE_WIDTH,
  unprojectRoomPoint,
  unprojectScreenPoint,
} from './room-plane';

const far = projectRoomPoint({ u: 0.5, v: 0.1 });
const near = projectRoomPoint({ u: 0.5, v: 0.9 });
assert.ok(near.y > far.y);
assert.equal(near.scale, far.scale, 'the web-room panda stays at its minimum size at every depth');
assert.equal(far.scale, 0.62, 'the fixed scale matches the existing minimum animation size');
assert.ok(near.zIndex > far.zIndex);
assert.ok(near.shadowScale > far.shadowScale);
assert.ok(near.shadowOpacity > far.shadowOpacity);
assert.ok(near.shadowBlur < far.shadowBlur);
assert.ok(near.brightness > far.brightness);
assert.ok(far.brightness >= 0.88 && near.brightness <= 1);
assert.ok(far.y > 56 && near.y < 97, 'the web walking plane stays on the selected room image floor');
const wideRoomFloor = roomFloorBoundsPercent(1200, 800);
assert.ok(wideRoomFloor.far > 0 && wideRoomFloor.near > wideRoomFloor.far && wideRoomFloor.near < 100,
  'the room image keeps its original aspect ratio while the floor follows its visible position');
assert.ok(projectRoomPoint({ u: 0.24, v: 0.24 }).brightness
  > projectRoomPoint({ u: 0.9, v: 0.24 }).brightness, 'local light softly brightens nearby positions');
assert.ok(roomDepthZIndex(0.9) > roomDepthZIndex(0.1));
assert.ok(roomFurnitureZIndex(0.7) > roomDepthZIndex(0.7), 'furniture covers a character at its depth');
assert.ok(roomDepthZIndex(0.75) > roomFurnitureZIndex(0.7), 'a character in front of furniture draws over it');
assert.ok(roomFurnitureZIndex(0.7) > roomDepthZIndex(0.65), 'a character behind furniture is covered');
assert.ok(projectRoomPoint({ u: 0.08, v: 0.8 }).x < projectRoomPoint({ u: 0.08, v: 0.2 }).x,
  'the walkable plane widens toward the viewer');

const legacyDesktop = projectDesktopPoint({ u: 0.5, v: 0.5 });
assert.deepEqual(
  { x: legacyDesktop.x, y: legacyDesktop.y, scale: legacyDesktop.scale, zIndex: legacyDesktop.zIndex },
  { x: 50, y: 45, scale: 0.62, zIndex: 60 },
  'desktop keeps its screen-space position with the panda at minimum size',
);

const screenTopLeft = projectScreenPoint({ u: 0.08, v: 0.08 });
const screenBottomRight = projectScreenPoint({ u: 0.92, v: 0.92 });
assert.deepEqual(
  { x: screenTopLeft.x, y: screenTopLeft.y, scale: screenTopLeft.scale },
  { x: 8, y: 8, scale: 0.62 },
  'full-screen roaming starts near the top-left edge with the fixed minimum size',
);
assert.deepEqual(
  { x: screenBottomRight.x, y: screenBottomRight.y },
  { x: 92, y: 92 },
  'full-screen roaming reaches near the bottom-right edge',
);

for (const point of [{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: 0.08, v: 0.92 }]) {
  const projected = projectRoomPoint(point);
  assert.ok(projected.x >= 0 && projected.x <= 100);
  assert.ok(projected.y >= 0 && projected.y <= 100);
  assert.ok(projected.scale > 0);
}

for (const point of [{ u: 0.08, v: 0.08 }, { u: 0.23, v: 0.2 }, { u: 0.92, v: 0.92 }]) {
  const projected = projectScreenPoint(point);
  const restored = unprojectScreenPoint(projected.x, projected.y);
  assert.ok(Math.abs(restored.u - point.u) < 1e-12);
  assert.ok(Math.abs(restored.v - point.v) < 1e-12);
}

for (const point of [{ u: 0.08, v: 0.08 }, { u: 0.23, v: 0.2 }, { u: 0.92, v: 0.92 }]) {
  const projected = projectRoomPoint(point, 1200, 800);
  const restored = unprojectRoomPoint(projected.x, projected.y, 1200, 800);
  assert.ok(Math.abs(restored.u - point.u) < 1e-12);
  assert.ok(Math.abs(restored.v - point.v) < 1e-12);
}

assert.deepEqual(randomRoomPoint(() => 0), { u: 0.08, v: 0.08 });
const farCorner = randomRoomPoint(() => 1);
assert.ok(Math.abs(farCorner.u - 0.92) < 1e-12 && Math.abs(farCorner.v - 0.92) < 1e-12);
assert.deepEqual(blendRoomPoint({ u: 0.1, v: 0.2 }, { u: 0.9, v: 0.8 }, 0), { u: 0.1, v: 0.2 });
assert.deepEqual(blendRoomPoint({ u: 0.1, v: 0.2 }, { u: 0.9, v: 0.8 }, 1), { u: 0.9, v: 0.8 });

const routeStart = { u: 0.1, v: 0.15 };
const routeEnd = { u: 0.9, v: 0.86 };
const routeControl = randomRoomControlPoint(routeStart, routeEnd, () => 1);
assert.notDeepEqual(routeControl, { u: 0.5, v: 0.505 }, 'a wander route bends instead of moving on a straight line');
for (let index = 0; index <= 100; index += 1) {
  const point = quadraticRoomPoint(routeStart, routeControl, routeEnd, index / 100);
  assert.ok(point.u >= 0.08 && point.u <= 0.92 && point.v >= 0.08 && point.v <= 0.92,
    'the curved route stays within the walkable floor');
}
assert.equal(gaitProgress(0, 12), 0);
assert.equal(gaitProgress(1, 12), 1);
assert.ok(gaitProgress(0.05, 10) < 0.1);
assert.equal(gaitProgress(0.08, 10), gaitProgress(0.09, 10), 'each small step includes a brief pause');

let seed = 0x51a7;
const seededRandom = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
};
for (let index = 0; index < 500; index += 1) {
  assert.ok(isWalkableRoomPoint(randomWalkableRoomPoint(seededRandom)),
    'random room destinations stay on clear floor away from furniture');
}

const blockedPoint = { u: 0.6, v: 0.25 };
assert.equal(isWalkableRoomPoint(blockedPoint), false, 'the panda bed footprint is blocked');
assert.ok(isWalkableRoomPoint(nearestWalkableRoomPoint(blockedPoint)),
  'a dragged point can be relocated to the nearest clear floor');
assert.ok(isWalkableRoomPoint(nearestWalkableRoomPoint({ u: -1, v: 0.25 })),
  'points outside the room are clamped back onto clear floor');

const obstacleRouteStart = { u: 0.42, v: 0.4 };
const obstacleRouteEnd = { u: 0.83, v: 0.4 };
assert.ok(isWalkableRoomPoint(obstacleRouteStart) && isWalkableRoomPoint(obstacleRouteEnd));
const obstacleRoute = planRoomWalkPath(obstacleRouteStart, obstacleRouteEnd);
assert.ok(obstacleRoute.length > 2, 'the route detours around the panda bed instead of crossing it');
assert.ok(roomWalkPathLength(obstacleRoute)
  > Math.hypot(obstacleRouteEnd.u - obstacleRouteStart.u, obstacleRouteEnd.v - obstacleRouteStart.v));
for (const [index, point] of obstacleRoute.entries()) {
  assert.ok(isWalkableRoomPoint(point), `route waypoint ${index} is on clear floor`);
  if (index > 0) {
    assert.ok(isWalkableRoomSegment(obstacleRoute[index - 1], point),
      `route segment ${index - 1} avoids furniture and floor edges`);
  }
}
for (let index = 0; index <= 300; index += 1) {
  assert.ok(isWalkableRoomPoint(pointAlongRoomWalkPath(obstacleRoute, index / 300)),
    'every interpolated walking point remains outside furniture footprints');
}

const wideFurnitureClip = roomImageRegionClipPath({ left: 48, top: 68, right: 166, bottom: 142 }, 1200, 800);
const tallFurnitureClip = roomImageRegionClipPath({ left: 48, top: 68, right: 166, bottom: 142 }, 400, 874);
assert.equal(ROOM_IMAGE_WIDTH, 400);
assert.equal(ROOM_IMAGE_HEIGHT, 180);
assert.ok(wideFurnitureClip.startsWith('polygon(') && tallFurnitureClip.startsWith('polygon('));
assert.notEqual(wideFurnitureClip, tallFurnitureClip, 'furniture occlusion follows the image on wide and tall viewports');

console.log('PASS room projection, walkable targets, furniture-safe routes, image clipping and stepwise gait');
