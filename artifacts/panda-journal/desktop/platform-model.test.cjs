const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sandbox = { module: { exports: {} } };
require("node:vm").runInNewContext(fs.readFileSync(path.join(__dirname, "platform-model.js"), "utf8"), sandbox);
const model = sandbox.module.exports;
const win = (id, x, y, width, height = 200, z = 0) => ({ id, x, y, width, height, z });
const surfaces = windows => model.platforms(windows, 1000, 720);
const json = value => JSON.parse(JSON.stringify(value));

test("taskbar is always a full-width bottom platform, including failed scans", () => {
  for (const windows of [[], null, [null, { id: "bad" }]]) {
    const lines = surfaces(windows);
    assert.equal(lines.length, 1);
    assert.deepEqual(json(lines[0]), { ownerId: "taskbar", left: 20, right: 980, y: 720, sourceX: 0 });
  }
});
test("only actual window top edges are platforms, not bottoms or content lines", () => {
  const lines = surfaces([win("1", 100, 120, 500)]);
  assert.deepEqual(Array.from(lines, l => l.y), [720, 120]);
  assert(!lines.some(l => l.y === 320));
});
test("maximized, offscreen and narrow window tops are not standable", () => {
  const lines = surfaces([win("1", 0, 0, 1000), win("2", 10, -5, 800),
    win("3", 100, 100, 30), win("4", 1200, 200, 400), win("5", 0, 800, 800)]);
  assert.equal(lines.length, 1);
});
test("foreground windows split or fully hide window-top platforms behind them", () => {
  const lines = surfaces([win("back", 100, 200, 400, 300, 2),
    win("front", 240, 150, 120, 300, 1)]);
  const back = lines.filter(l => l.ownerId === "back");
  assert.deepEqual(Array.from(back, l => [l.left, l.right]), [[120, 220], [380, 480]]);
  assert.equal(surfaces([win("back", 100, 200, 400, 300, 2),
    win("front", 0, 100, 900, 400, 1)]).filter(l => l.ownerId === "back").length, 0);
});
test("walking stays horizontal and turns before either end of its current segment", () => {
  for (const line of surfaces([win("1", 100, 120, 500)])) {
    for (const x of [line.left, (line.left + line.right) / 2, line.right]) {
      for (const random of [() => 0, () => .99]) {
        const target = model.walkTarget({ x, y: line.y }, line, random);
        assert(target); assert.equal(target.y, line.y);
        assert(target.x >= line.left && target.x <= line.right);
        assert.notEqual(target.x, x);
      }
    }
  }
});
test("edge climbs approach the nearest screen side from the taskbar only", () => {
  const [taskbar, ledge] = surfaces([win("side-window", 0, 120, 500)]);
  assert.deepEqual(json(model.edgeRoute({ x: 100, y: 720 }, taskbar)), { side: "left", x: 20, groundY: 720, topY: 574 });
  assert.deepEqual(json(model.edgeRoute({ x: 900, y: 720 }, taskbar)), { side: "right", x: 980, groundY: 720, topY: 574 });
  assert.equal(model.edgeRoute({ x: 20, y: 120 }, ledge), null);
  assert.equal(model.edgeRoute({ x: 20, y: 100 }, model.ground(200, 100)), null);
  assert.equal(model.edgeRoute({ x: 20, y: 140 }, model.ground(200, 140)).topY, 48);
});
test("only the two actual taskbar ends are screen fall triggers", () => {
  const [taskbar, ledge] = surfaces([win("side-window", 0, 120, 500)]);
  assert.equal(model.reachedEdge({ x: 20, y: 720 }, taskbar).side, "left");
  assert.equal(model.reachedEdge({ x: 980, y: 720 }, taskbar).side, "right");
  assert.equal(model.reachedEdge({ x: 30, y: 720 }, taskbar), null);
  assert.equal(model.reachedEdge({ x: 20, y: 120 }, ledge), null);
});
test("closed windows cause a strictly vertical fall onto the nearest lower top", () => {
  const lines = surfaces([win("lower", 100, 240, 600), win("lowest", 100, 400, 600, 200, 2)]);
  let point = { x: 250, y: 100 }, velocity = 0, support = null;
  for (let i = 0; i < 200 && !support; i++) {
    const step = model.fall(point, velocity, .016, lines);
    assert.equal(step.point.x, 250); assert(step.point.y >= point.y);
    point = step.point; velocity = step.velocity; support = step.support;
  }
  assert.equal(support.ownerId, "lower"); assert.equal(point.y, 240);
});
test("no lateral snapping to a window; unsupported x falls all the way to taskbar", () => {
  const lines = surfaces([win("aside", 500, 240, 400)]);
  const step = model.fall({ x: 250, y: 100 }, 0, .016, lines, true);
  assert.equal(step.point.x, 250); assert.equal(step.point.y, 720);
  assert.equal(step.support.ownerId, "taskbar");
});
test("falling never catches a platform above the feet or tunnels through a close one", () => {
  const lines = surfaces([win("above", 100, 100, 600), win("below", 100, 302, 600)]);
  const step = model.fall({ x: 250, y: 300 }, 600, 10, lines);
  assert.equal(step.support.ownerId, "below"); assert.equal(step.point.y, 302);
});
test("standing pet follows its own moved window, not another window with the same top", () => {
  const before = surfaces([win("1", 100, 200, 500)]);
  const support = model.supportAt({ x: 250, y: 200 }, before);
  const after = surfaces([win("1", 160, 240, 500)]);
  const tracked = model.track({ x: 250, y: 200 }, support, after);
  assert.deepEqual(json(tracked.point), { x: 310, y: 240 });
  assert.equal(tracked.support.ownerId, "1");
  assert.equal(model.track({ x: 250, y: 200 }, support, surfaces([win("2", 100, 200, 500)])).support, null);
});
test("closing, minimizing, covering or shrinking away support releases the pet without sideways movement", () => {
  const before = surfaces([win("1", 100, 200, 500, 300, 2)]);
  const point = { x: 400, y: 200 }, support = model.supportAt(point, before);
  for (const after of [surfaces([]), surfaces([win("1", 100, 200, 100)]),
    surfaces([win("1", 100, 200, 500, 300, 2), win("front", 0, 100, 900, 500, 1)])]) {
    const tracked = model.track(point, support, after);
    assert.equal(tracked.support, null); assert.equal(tracked.point.x, 400);
  }
});
test("drag release and reduced motion settle only onto a surface below", () => {
  const lines = surfaces([win("1", 100, 240, 500)]);
  assert.equal(model.supportAt({ x: 250, y: 239.9 }, lines).ownerId, "1");
  assert.equal(model.supportAt({ x: 250, y: 180 }, lines), null);
  assert.equal(model.fall({ x: 250, y: 180 }, 0, 0, lines, true).point.y, 240);
  for (const [width, height] of [[1920, 1080], [340, 360], [30, 30]]) {
    const point = model.constrain({ x: -10000, y: 10000 }, width, height);
    assert(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height);
  }
});
