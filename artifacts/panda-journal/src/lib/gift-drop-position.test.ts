import assert from 'node:assert/strict';
import { isWalkableRoomPoint, projectRoomPoint } from './room-plane';
import {
  getGiftDropImagePosition,
  getGiftDropRoomPoint,
  getGiftStorageRoomPoint,
} from './gift-drop-position';

const first = getGiftDropRoomPoint('gift-a');
assert.deepEqual(first, getGiftDropRoomPoint('gift-a'), 'the same pending gift keeps its room position');

const imagePoint = getGiftDropImagePosition('gift-a');
const normalizedX = (imagePoint.x - 512) / 402;
const normalizedY = (imagePoint.y - 416) / 110;
assert.ok(normalizedX ** 2 + normalizedY ** 2 <= 1, 'gift drops remain inside the carpet');
assert.ok(isWalkableRoomPoint(first), 'gift drops do not land on blocked furniture');

for (let index = 0; index < 100; index += 1) {
  const point = getGiftDropRoomPoint(`gift-${index}`);
  const projected = projectRoomPoint(point);
  const x = (projected.x / 100) * 1024;
  const y = (projected.y / 100) * 576;
  const rugX = (x - 512) / 402;
  const rugY = (y - 416) / 110;
  assert.ok(rugX ** 2 + rugY ** 2 <= 1, `gift-${index} stays on the rug`);
  assert.ok(isWalkableRoomPoint(point), `gift-${index} lands on walkable floor`);
}

const storage = getGiftStorageRoomPoint();
assert.ok(isWalkableRoomPoint(storage), 'the gift storage box sits on walkable carpet');
