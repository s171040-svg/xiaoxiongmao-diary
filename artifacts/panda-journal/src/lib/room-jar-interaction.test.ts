import assert from 'node:assert/strict';
import test from 'node:test';
import { isPandaCenterInsideJar } from './room-jar-interaction';

const jar = { left: 10, top: 20, right: 30, bottom: 50 };

test('the panda stays trapped while its center remains inside the jar', () => {
  assert.equal(isPandaCenterInsideJar({ x: 20, y: 35 }, jar), true);
  assert.equal(isPandaCenterInsideJar({ x: 10, y: 20 }, jar), true);
  assert.equal(isPandaCenterInsideJar({ x: 30, y: 50 }, jar), true);
});

test('the panda leaves the jar only after its center is dragged past the rim', () => {
  const outsidePoints = [
    { x: 9, y: 35 },
    { x: 31, y: 35 },
    { x: 20, y: 19 },
    { x: 20, y: 51 },
  ];

  for (const point of outsidePoints) {
    assert.equal(isPandaCenterInsideJar(point, jar), false);
  }
});
