import assert from 'node:assert/strict';
import { bathPetAnchor, bathPetClipPath } from './room-bath-occlusion';

const track = { left: 0, top: 0, width: 128, height: 96 };
const tub = { ...track };
for (const size of [40, 78, 110]) {
  const anchor = bathPetAnchor(tub, size);
  assert.equal(anchor.x, 64);
  // The face ends at 64% of the track; leave a 2% track-height gap above water.
  assert(Math.abs(anchor.y - size * 0.36 - (46 - size * 0.02)) < 0.001);
  const moved = bathPetAnchor({ ...tub, left: 20, top: 30 }, size);
  assert.equal(moved.x, anchor.x + 20);
  assert.equal(moved.y, anchor.y + 30);
  const scaledAnchor = bathPetAnchor({ left: 0, top: 0, width: 256, height: 192 }, size * 2);
  assert.equal(scaledAnchor.y, anchor.y * 2);
}
assert.equal(bathPetAnchor(tub, 48, 50, 20).x, 50,
  'the plunge keeps the pet at its current horizontal position');
assert.equal(bathPetAnchor(tub, 48, -40, 20).x, 10,
  'the plunge stays inside the tub when released near its edge');
const path = bathPetClipPath(track, tub);
assert(path);
const points = (clip: string) => [...clip.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)]
  .map(([, x, y]) => [Number(x), Number(y)]);
const rim = points(path).slice(2);
assert(rim.some(([x, y]) => x === 89 && y === 46), 'front-center rim matches original tub pixels');
assert(rim.some(([x, y]) => x === 10 && y === 38), 'curved left rim is retained');
assert(rim.some(([x, y]) => x === 117 && y === 38), 'curved right rim is retained');

const shift = { left: 420, top: 250 };
assert.equal(bathPetClipPath({ ...track, ...shift }, { ...tub, ...shift }), path,
  'moving the furniture and pet together preserves the occlusion');
const scaled = points(bathPetClipPath(
  { left: 0, top: 0, width: 256, height: 192 },
  { left: 0, top: 0, width: 256, height: 192 },
)!);
assert.deepEqual(scaled, points(path).map(([x, y]) => [x * 2, y * 2]),
  'the contour follows actual rendered size instead of a fixed sprite crop');
const movedRim = points(bathPetClipPath(track, { ...tub, left: 17, top: 19 })!).slice(2);
assert.deepEqual(movedRim, rim.map(([x, y]) => [x + 17, y + 19]),
  'tub movement changes the local clipping coordinates');

for (const invalid of [
  { ...tub, width: 0 }, { ...tub, height: 0 }, { ...tub, left: NaN },
  { ...tub, top: Infinity },
]) assert.equal(bathPetClipPath(track, invalid), null);
assert.equal(bathPetClipPath({ ...track, height: 0 }, tub), null);
console.log('PASS: bathtub front-rim masking follows movement and scale and rejects invalid geometry.');
