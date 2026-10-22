import assert from 'node:assert/strict';
import {
  blendRoomPoint,
  CAT_TREE_NEST_POINT,
  CAT_TREE_WALK_PATH,
  gaitProgress,
  isCatTreeNestScreenPoint,
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
  roomImagePolygonClipPath,
  roomImageRegionClipPath,
  roomWalkPathLength,
  roomFurnitureZIndex,
  roomDepthZIndex,
  roomFloorBoundsPercent,
  roomPointAtImagePosition,
  shouldPandaRenderBehindRack,
  ROOM_OUTSIDE_BOUNDARY_V,
  ROOM_IMAGE_HEIGHT,
  ROOM_IMAGE_WIDTH,
  unprojectRoomPoint,
  unprojectRoomWalkableSurfacePoint,
  unprojectScreenPoint,
} from './room-plane';

const far = projectRoomPoint({ u: 0.5, v: 0.1 });
const near = projectRoomPoint({ u: 0.5, v: ROOM_OUTSIDE_BOUNDARY_V });
assert.ok(near.y > far.y);
assert.ok(isWalkableRoomPoint({ u: 0.5, v: ROOM_OUTSIDE_BOUNDARY_V }),
  'the exterior edge is reachable instead of being clamped to the floor');
for (const [width, height] of [[1024, 576], [1280, 720], [1200, 800], [402, 874]]) {
  const boundary = projectRoomPoint({ u: 0.5, v: ROOM_OUTSIDE_BOUNDARY_V }, width, height);
  const imageScale = Math.min(width / ROOM_IMAGE_WIDTH, height / ROOM_IMAGE_HEIGHT);
  const imageBottom = (height + ROOM_IMAGE_HEIGHT * imageScale) / 2;
  assert.ok(Math.abs(boundary.y / 100 * height - imageBottom - imageScale) < 1e-9,
    'the fall begins one image pixel beyond the unchanged background bottom');
  const restored = unprojectRoomPoint(boundary.x, boundary.y, width, height);
  assert.ok(Math.abs(restored.v - ROOM_OUTSIDE_BOUNDARY_V) < 1e-12,
    'movement and the visible bottom boundary use the same coordinates');
}
const bottomTarget = nearestWalkableRoomPoint({ u: 0.5, v: 1 });
assert.equal(bottomTarget.v, 1, 'the full existing floor remains reachable');
const outsideRandom = [0, 0.5, 1];
assert.ok(randomWalkableRoomPoint(() => outsideRandom.shift() ?? 0.5).v > ROOM_OUTSIDE_BOUNDARY_V,
  'occasional autonomous walks can step beyond the background');
assert.equal(nearestWalkableRoomPoint({ u: 0.98, v: 0.8 }).u, 0.98,
  'the right-side grass no longer blocks the enlarged walking area');
assert.ok(isWalkableRoomSegment({ u: 0.95, v: 0.8 }, { u: 0.98, v: ROOM_OUTSIDE_BOUNDARY_V + 0.02 }),
  'the lower-right route can pass behind the grass and leave the floor');
assert.ok(nearestWalkableRoomPoint({ u: 0.5, v: ROOM_OUTSIDE_BOUNDARY_V + 0.02 }).v > ROOM_OUTSIDE_BOUNDARY_V,
  'an exterior destination is not silently clamped back inside');
assert.ok(near.scale > far.scale, 'the panda appears larger closer to the front of the room');
assert.ok(far.scale < 0.62, 'the panda appears smaller toward the back of the room');
assert.equal(projectRoomPoint({ u: 0.5, v: 0.92 }).scale, 0.62,
  'the panda keeps its original size at the lower walkable edge');
assert.equal(projectRoomPoint({ u: 0.5, v: 1 }).scale, 0.62,
  'the panda keeps its original size at the nearest room edge');
assert.ok(Math.abs(projectRoomPoint(CAT_TREE_NEST_POINT).scale - (0.62 * 2 / 3)) < 1e-12,
  'the panda scales to two-thirds at the nest');
assert.ok(projectRoomPoint(CAT_TREE_WALK_PATH[0]).scale > projectRoomPoint(CAT_TREE_NEST_POINT).scale,
  'the panda gradually shrinks while climbing toward the nest');
const droppedOnJarImage = unprojectRoomWalkableSurfacePoint(
  (258 / ROOM_IMAGE_WIDTH) * 100,
  (210 / ROOM_IMAGE_HEIGHT) * 100,
  ROOM_IMAGE_WIDTH,
  ROOM_IMAGE_HEIGHT,
);
assert.ok((droppedOnJarImage.elevation ?? 0) > 0);
assert.equal(isWalkableRoomPoint(droppedOnJarImage), false,
  'raised furniture and wall art are not treated as walkable floor when releasing a drag');
const releasedOnFloor = unprojectRoomWalkableSurfacePoint(25, (350 / ROOM_IMAGE_HEIGHT) * 100,
  ROOM_IMAGE_WIDTH, ROOM_IMAGE_HEIGHT);
assert.equal(isWalkableRoomPoint(releasedOnFloor), true,
  'dragging over the actual floor still produces a walkable destination');
assert.ok(near.zIndex > far.zIndex);
assert.ok(near.shadowScale > far.shadowScale);
assert.ok(near.shadowOpacity > far.shadowOpacity);
assert.ok(near.shadowBlur < far.shadowBlur);
assert.ok(near.brightness > far.brightness);
assert.ok(far.brightness >= 0.88 && near.brightness <= 1);
assert.ok(far.y > 56 && near.y > 100,
  'the walking plane extends below the room image for the immediate exit fall');
const wideRoomFloor = roomFloorBoundsPercent(1200, 800);
assert.ok(wideRoomFloor.far > 0 && wideRoomFloor.near > wideRoomFloor.far && wideRoomFloor.near < 100,
  'the room image keeps its original aspect ratio while the floor follows its visible position');
assert.ok(projectRoomPoint({ u: 0.24, v: 0.24 }).brightness
  > projectRoomPoint({ u: 0.9, v: 0.24 }).brightness, 'local light softly brightens nearby positions');
assert.ok(roomDepthZIndex(0.9) > roomDepthZIndex(0.1));
assert.ok(roomFurnitureZIndex(0.7) > roomDepthZIndex(0.7), 'furniture covers a character at its depth');
assert.ok(roomDepthZIndex(0.75) > roomFurnitureZIndex(0.7), 'a character in front of furniture draws over it');
assert.ok(roomFurnitureZIndex(0.7) > roomDepthZIndex(0.65), 'a character behind furniture is covered');
const rackBounds = { left: 100, top: 100, right: 160, bottom: 300 };
assert.equal(shouldPandaRenderBehindRack(
  { left: 115, top: 120, right: 150, bottom: 170 },
  rackBounds,
), true, 'a panda overlapping the rack upper half is drawn behind it');
assert.equal(shouldPandaRenderBehindRack(
  { left: 115, top: 220, right: 150, bottom: 270 },
  rackBounds,
), false, 'a panda overlapping the rack lower half stays in front');
assert.equal(shouldPandaRenderBehindRack(
  { left: 10, top: 120, right: 55, bottom: 170 },
  rackBounds,
), false, 'the rack does not occlude a panda that is not horizontally overlapping');
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

const blockedPoint = { u: 0.88, v: 0.08 };
assert.equal(isWalkableRoomPoint(blockedPoint), false, 'the wardrobe footprint is blocked');
assert.ok(isWalkableRoomPoint(nearestWalkableRoomPoint(blockedPoint)),
  'a dragged point can be relocated to the nearest clear floor');
assert.ok(isWalkableRoomPoint(nearestWalkableRoomPoint({ u: -1, v: 0.25 })),
  'points outside the room are clamped back onto clear floor');

const obstacleRouteStart = { u: 0.2, v: 0.09 };
const obstacleRouteEnd = { u: 0.65, v: 0.2 };
assert.ok(isWalkableRoomPoint(obstacleRouteStart) && isWalkableRoomPoint(obstacleRouteEnd));
const obstacleRoute = planRoomWalkPath(obstacleRouteStart, obstacleRouteEnd);
assert.ok(obstacleRoute.length > 2, 'the route detours around the cat tree instead of crossing it');
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

assert.ok(CAT_TREE_WALK_PATH.every(isWalkableRoomPoint), 'the cat-tree landing and stairs are part of the walkable room');
assert.ok(isWalkableRoomPoint(roomPointAtImagePosition(503, 250)),
  'a point on a horizontal stair tread is walkable');
assert.ok(isWalkableRoomPoint(roomPointAtImagePosition(484, 226)),
  'a point on the diagonal stair rail is walkable');
assert.equal(isWalkableRoomPoint(roomPointAtImagePosition(496, 238)), false,
  'the open gap between a tread and rails is not walkable');
for (let index = 1; index < CAT_TREE_WALK_PATH.length; index += 1) {
  assert.ok(isWalkableRoomSegment(CAT_TREE_WALK_PATH[index - 1], CAT_TREE_WALK_PATH[index]),
    `cat-tree stair segment ${index - 1} remains walkable`);
}
assert.ok(CAT_TREE_NEST_POINT.elevation && CAT_TREE_NEST_POINT.elevation > 0.3,
  'the pillow target is raised above the room floor');
const nestRoute = planRoomWalkPath({ u: 0.5, v: 0.58 }, CAT_TREE_NEST_POINT);
assert.ok(nestRoute.length > 2 && nestRoute.at(-1)?.elevation === CAT_TREE_NEST_POINT.elevation,
  'a floor route connects to the pillow through the ladder');
assert.ok(nestRoute.some(point => (point.elevation ?? 0) > 0.1),
  'the route visibly climbs the ladder rather than teleporting to the den');
for (let index = 0; index <= 300; index += 1) {
  assert.ok(isWalkableRoomPoint(pointAlongRoomWalkPath(nestRoute, index / 300)),
    'every interpolated point while climbing stays on the stairs or inside the den');
}
const nestExitRoute = planRoomWalkPath(CAT_TREE_NEST_POINT, { u: 0.7, v: 0.72 });
assert.ok(nestExitRoute.some(point => (point.elevation ?? 0) > 0.1)
  && nestExitRoute.at(-1)?.elevation === undefined,
  'a panda waking in the den can route back down to the floor');
for (const [index, point] of nestExitRoute.entries()) {
  assert.ok(isWalkableRoomPoint(point), `den exit waypoint ${index} stays walkable`);
  if (index > 0) assert.ok(isWalkableRoomSegment(nestExitRoute[index - 1], point));
}
const draggedNestPoint = unprojectRoomWalkableSurfacePoint((400 / ROOM_IMAGE_WIDTH) * 100, (140 / ROOM_IMAGE_HEIGHT) * 100);
assert.ok(isWalkableRoomPoint(draggedNestPoint) && (draggedNestPoint.elevation ?? 0) > 0.3,
  'dragging into the visible den keeps the panda on its raised surface');
const draggedLadderPoint = unprojectRoomWalkableSurfacePoint((503 / ROOM_IMAGE_WIDTH) * 100, (250 / ROOM_IMAGE_HEIGHT) * 100);
assert.ok(isWalkableRoomPoint(draggedLadderPoint) && (draggedLadderPoint.elevation ?? 0) > 0.1,
  'dropping the panda midway up the ladder does not snap it to the floor');
assert.equal(isCatTreeNestScreenPoint(400, 140), true);
assert.equal(isCatTreeNestScreenPoint(560, 321), false);
const mobileNest = projectRoomPoint(CAT_TREE_NEST_POINT, 400, 874);
assert.equal(isCatTreeNestScreenPoint(mobileNest.x * 4, mobileNest.y * 8.74, 400, 874), true,
  'the den drop target follows the room image on a tall viewport');
assert.ok(isWalkableRoomPoint(roomPointAtImagePosition(400, 140)));

const wideFurnitureClip = roomImageRegionClipPath({ left: 48, top: 68, right: 166, bottom: 142 }, 1200, 800);
const tallFurnitureClip = roomImageRegionClipPath({ left: 48, top: 68, right: 166, bottom: 142 }, 400, 874);
const widePlantClip = roomImagePolygonClipPath([[0, 390], [80, 410], [70, 470], [0, 460]], 1200, 800);
const tallPlantClip = roomImagePolygonClipPath([[0, 390], [80, 410], [70, 470], [0, 460]], 400, 874);
assert.equal(ROOM_IMAGE_WIDTH, 1024);
assert.equal(ROOM_IMAGE_HEIGHT, 576);
assert.ok(wideFurnitureClip.startsWith('polygon(') && tallFurnitureClip.startsWith('polygon('));
assert.notEqual(wideFurnitureClip, tallFurnitureClip, 'furniture occlusion follows the image on wide and tall viewports');
assert.ok(widePlantClip.startsWith('polygon(') && widePlantClip.split(',').length === 4);
assert.notEqual(widePlantClip, tallPlantClip, 'plant occlusion follows the image on wide and tall viewports');

console.log('PASS room projection, walkable targets, furniture-safe routes, image clipping and stepwise gait');
