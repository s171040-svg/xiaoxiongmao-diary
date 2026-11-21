import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { chooseLeafActivity, isLeafPlatformScreenPoint, leafActivityDuration, leafPlatformRect } from './room-leaf-platform';
import { initialState, MINUTE, tickCompanion } from './companion-store';

test('leaf platform is separate from the upper nest, stairs and floor at all aspect ratios', () => {
  for (const [width, height] of [[1024, 576], [1280, 800], [390, 844]]) {
    const r = leafPlatformRect(width, height);
    assert.equal(isLeafPlatformScreenPoint(r.left + r.width / 2, r.top + r.height / 2, width, height), true);
    const s = Math.min(width / 1024, height / 576);
    const point = (x: number, y: number) => [
      (width - 1024 * s) / 2 + x * s, (height - 576 * s) / 2 + y * s,
    ];
    for (const [x, y] of [[400, 140], [480, 210], [385, 330]]) {
      const [sx, sy] = point(x, y);
      assert.equal(isLeafPlatformScreenPoint(sx, sy, width, height), false);
    }
  }
});
test('both random activities are reachable and sleep retains its five-minute minimum', () => {
  assert.equal(chooseLeafActivity(() => 0), 'sleeping');
  assert.equal(chooseLeafActivity(() => .99), 'playing');
  assert.equal(leafActivityDuration('sleeping', () => 0), 5 * MINUTE);
  assert(leafActivityDuration('playing', () => .99) < MINUTE);
});
test('holding a pet on the platform prevents autonomous departure without skipping care decay', () => {
  const now = Date.now();
  const before = { ...initialState(now - 3 * 24 * 60 * MINUTE), nextIdleAt: now + MINUTE, nextTripAt: now - 1 };
  const held = tickCompanion(before, now, () => .9, { allowDeparture: false });
  assert.equal(held.event, undefined);
  assert.equal(held.state.trip, undefined);
  assert.notDeepEqual(held.state.careStats, before.careStats);
  assert.equal(tickCompanion(before, now, () => .9).event, 'departure');
});
test('each new pose transition contains six genuinely different transparent PNGs', () => {
  for (const prefix of ['idle-to-leaf-play', 'platform-grab-to-idle']) {
    const frames = Array.from({ length: 6 }, (_, i) =>
      readFileSync(`artifacts/panda-journal/public/static/panda/transitions/${prefix}-${i + 1}.png`));
    assert.equal(new Set(frames.map(frame => frame.toString('base64'))).size, 6);
    for (const frame of frames) {
      assert.equal(frame.readUInt32BE(16), 96);
      assert.equal(frame.readUInt32BE(20), 96);
    }
  }
});
