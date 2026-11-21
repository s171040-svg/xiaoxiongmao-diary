import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BORED_DOCK_REST_MS, BORED_SEARCH_IDLE_MS, isBoredSearchDue } from './room-bored-search';

test('bored search starts only after five full minutes without user activity', () => {
  assert.equal(isBoredSearchDue(1000, 1000 + BORED_SEARCH_IDLE_MS - 1), false);
  assert.equal(isBoredSearchDue(1000, 1000 + BORED_SEARCH_IDLE_MS), true);
});

test('bored search does not start while the clock is earlier than the last activity', () => {
  assert.equal(isBoredSearchDue(2000, 1000), false);
});

test('toolbar rest lasts exactly one minute, independently of the idle trigger', () => {
  assert.equal(BORED_DOCK_REST_MS, 60_000);
  assert.equal(BORED_SEARCH_IDLE_MS, 300_000);
  const finishedAt = 1_000 + BORED_SEARCH_IDLE_MS + BORED_DOCK_REST_MS;
  assert.equal(isBoredSearchDue(finishedAt, finishedAt + 1), false);
  assert.equal(isBoredSearchDue(finishedAt, finishedAt + BORED_SEARCH_IDLE_MS), true);
});
