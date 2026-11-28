import assert from 'node:assert/strict';
import test from 'node:test';
import { punchDuration, punchFrameAt } from './panda-punch';

test('web punch traverses one full fall and recovery and then ends', () => {
  assert.equal(punchDuration(), 2000);
  assert.equal(punchFrameAt(-1), null);
  assert.equal(punchFrameAt(0), 0);
  assert.equal(punchFrameAt(1999), 24);
  assert.equal(punchFrameAt(2000), null);
  assert.equal(punchFrameAt(60000), null);
});

test('reduced motion holds a brief real reaction pose instead of animating a fall', () => {
  assert.equal(punchDuration(true), 400);
  assert.equal(punchFrameAt(0, true), 12);
  assert.equal(punchFrameAt(399, true), 12);
  assert.equal(punchFrameAt(400, true), null);
});
