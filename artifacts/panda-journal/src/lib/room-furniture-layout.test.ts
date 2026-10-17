import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampRoomFurnitureCenter,
  parseRoomFurnitureLayout,
  readRoomFurnitureLayout,
  ROOM_FURNITURE_LAYOUT_KEY,
  writeRoomFurnitureLayout,
} from './room-furniture-layout';

test('room furniture positions round-trip as a local per-browser layout', () => {
  const saved = new Map<string, string>();
  const layout = { bed: { x: 0.24, y: 0.61 }, bathStation: { x: 0.82, y: 0.72 } };
  writeRoomFurnitureLayout({ setItem: (key, value) => saved.set(key, value) }, layout);
  assert.equal(saved.has(ROOM_FURNITURE_LAYOUT_KEY), true);
  assert.deepEqual(readRoomFurnitureLayout({ getItem: key => saved.get(key) ?? null }), layout);
});

test('invalid room furniture positions are rejected instead of silently applied', () => {
  assert.throws(() => parseRoomFurnitureLayout('not json'));
  assert.throws(() => parseRoomFurnitureLayout(JSON.stringify({ version: 1, positions: { bed: { x: 1.2, y: 0.4 } } })));
  assert.deepEqual(parseRoomFurnitureLayout(null), {});
});

test('dragged furniture stays fully in the viewport', () => {
  assert.deepEqual(clampRoomFurnitureCenter(-20, 1000, 120, 80, 800, 600), {
    x: 0.075,
    y: 0.9333333333333333,
  });
  assert.deepEqual(clampRoomFurnitureCenter(20, 20, 900, 700, 800, 600), { x: 0.5, y: 0.5 });
});
