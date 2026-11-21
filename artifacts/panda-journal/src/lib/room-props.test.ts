import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeRoomProps } from './room-props';

test('older rooms keep the chest and bin visible without changing existing switches', () => {
  assert.deepEqual(normalizeRoomProps({ tub: false, rack: false }), {
    bed: false, rack: false, tub: false, giftStorage: true, trashCan: true,
  });
});
test('both new switches survive saving, reloading and shared room updates', () => {
  const hidden = normalizeRoomProps({ giftStorage: false, trashCan: false });
  assert.deepEqual(normalizeRoomProps(JSON.parse(JSON.stringify(hidden))), hidden);
  assert.equal(normalizeRoomProps({ ...hidden, giftStorage: true }).trashCan, false);
  assert.equal(normalizeRoomProps({ ...hidden, trashCan: true }).giftStorage, false);
});
test('invalid saved values cannot hide furniture or restore the retired bed switch', () => {
  assert.equal(normalizeRoomProps({ bed: true, trashCan: 'false', giftStorage: null }).trashCan, true);
  assert.equal(normalizeRoomProps({ bed: true }).bed, false);
  assert.deepEqual(normalizeRoomProps(null), normalizeRoomProps([]));
});
