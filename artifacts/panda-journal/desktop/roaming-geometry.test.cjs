"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sandbox = { module: { exports: {} }, globalThis: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "roaming-geometry.js"), "utf8"), sandbox);
const { projectRoomPoint, actorBounds, isPointClear, isSegmentClear, findSafePoint, roomPointFromAnchor } = sandbox.module.exports;

test("full desktop roaming covers the screen while keeping the current panda scale", () => {
  const nearLeft = projectRoomPoint({ u: 0, v: 0 }, 1920, 1080, true);
  const farRight = projectRoomPoint({ u: 1, v: 1 }, 1920, 1080, true);
  assert.ok(nearLeft.x < 10);
  assert.ok(farRight.x > 90);
  assert.ok(nearLeft.y < 20);
  assert.ok(farRight.y > 85);
  assert.equal(nearLeft.scale, 0.62);
  const bounds = actorBounds({ u: 0.02, v: 0.04 }, 1920, 1080, true);
  assert.ok(bounds.x >= 0);
  assert.ok(bounds.y >= 0);
});

test("a target overlapping an application window is rejected", () => {
  const screen = { width: 1920, height: 1080 };
  const appWindow = { x: 760, y: 300, width: 420, height: 420 };
  assert.equal(isPointClear({ u: 0.5, v: 0.5 }, [appWindow], screen.width, screen.height, true), false);
  assert.equal(isPointClear({ u: 0.05, v: 0.05 }, [appWindow], screen.width, screen.height, true), true);
});

test("roaming finds a clear route around a window and stops if no clear space exists", () => {
  const width = 1920;
  const height = 1080;
  const obstacle = { x: 760, y: 300, width: 420, height: 420 };
  const start = { u: 0.25, v: 0.3 };
  const target = findSafePoint(start, [obstacle], width, height, true, () => 0.41);
  assert.ok(target);
  assert.equal(isPointClear(target, [obstacle], width, height, true), true);
  assert.equal(isSegmentClear(start, target, [obstacle], width, height), true);
  const noSpace = findSafePoint(
    { u: 0.5, v: 0.5 },
    [{ x: -1000, y: -1000, width: 4000, height: 4000 }],
    width,
    height,
    true,
    () => 0.5,
  );
  assert.equal(noSpace, null);
});

test("dragging maps a screen anchor back onto the same room point", () => {
  const point = { u: 0.37, v: 0.62 };
  const projected = projectRoomPoint(point, 1600, 900, true);
  const restored = roomPointFromAnchor(projected.x, projected.y, true);
  assert.ok(Math.abs(restored.u - point.u) < 1e-9);
  assert.ok(Math.abs(restored.v - point.v) < 1e-9);
  const clamped = roomPointFromAnchor(-40, 400, true);
  assert.equal(clamped.u, 0);
  assert.equal(clamped.v, 1);
  assert.equal(roomPointFromAnchor(50, 50, false), null);
});
