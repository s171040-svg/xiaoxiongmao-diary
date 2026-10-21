import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BATH_BALL_DRY_MS,
  BATH_BALL_DRYING_STORAGE_KEY,
  finishBathBallDrying,
  hangBathBallToDry,
  readBathBallDryingState,
  saveBathBallDryingState,
  wetBathBall,
} from './bath-ball-drying';

test('the used bath ball stays unavailable until it dries on the window hook for five seconds', () => {
  const now = 1000;
  const wet = wetBathBall();
  assert.equal(hangBathBallToDry(wet, now).driesAt, now + BATH_BALL_DRY_MS);
  const drying = hangBathBallToDry(wet, now);
  assert.deepEqual(finishBathBallDrying(drying, now + BATH_BALL_DRY_MS - 1), drying);
  assert.deepEqual(finishBathBallDrying(drying, now + BATH_BALL_DRY_MS), {
    wet: false,
    onWindowHook: true,
    driesAt: null,
  });
});

test('the drying deadline survives reloads and completes while the app is closed', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const drying = hangBathBallToDry(wetBathBall(), 10_000);
  saveBathBallDryingState(storage, drying);
  assert.equal(JSON.parse(values.get(BATH_BALL_DRYING_STORAGE_KEY)!).driesAt, 15_000);
  assert.deepEqual(readBathBallDryingState(storage, 14_999), drying);
  assert.deepEqual(readBathBallDryingState(storage, 15_000), {
    wet: false,
    onWindowHook: true,
    driesAt: null,
  });
});

test('a wet ball away from the hook remains wet through a reload', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  const wet = wetBathBall();
  saveBathBallDryingState(storage, wet);
  assert.deepEqual(readBathBallDryingState(storage), wet);
});
