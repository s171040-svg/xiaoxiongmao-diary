import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_OWNER_KEY, accountCacheKey, applyPetSnapshot, canRestorePendingLocal, captureLocalValues, restoreLocalValues, snapshotPet } from './account-pet-save';
import { COMPANION_KEY, initialState, readState } from './companion-store';
import { UpdatePetSaveBody } from '@workspace/api-zod';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: index => [...map.keys()][index] ?? null,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
    clear: () => map.clear(),
  };
}
test('private cloud snapshot excludes chat, diary, photos and local account caches', () => {
  const storage = memoryStorage();
  const state = initialState(1_000);
  state.messages.push({ id: 'private', role: 'user', text: 'PRIVATE_CHAT', photo: 'PRIVATE_PHOTO', createdAt: 1_001 });
  state.diary.push({ id: 'diary', kind: 'idea', text: 'PRIVATE_DIARY', createdAt: 1_001, sourceMessageId: 'private' });
  state.draft = 'PRIVATE_DRAFT';
  state.draftPhoto = 'PRIVATE_DRAFT_PHOTO';
  state.gifts = [{ id: 'gift', emoji: '🥕', item: '胡萝卜', story: '礼物', animal: '兔子', receivedAt: 1_000 }];
  storage.setItem(COMPANION_KEY, JSON.stringify(state));
  storage.setItem(ACCOUNT_OWNER_KEY, 'account-a');
  storage.setItem(accountCacheKey('account-b'), 'PRIVATE_OTHER_ACCOUNT');
  const snapshot = snapshotPet(storage);
  assert.equal(snapshot.room.gifts[0].id, 'gift');
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE_'), false);
});
test('restoring account gameplay keeps that account local diary and fractional health', () => {
  const storage = memoryStorage();
  const state = initialState(1_000);
  state.messages = [{ id: 'mine', role: 'user', text: 'my conversation', createdAt: 1_001 }];
  storage.setItem(COMPANION_KEY, JSON.stringify(state));
  const saved = snapshotPet(storage);
  saved.room.careStats!.health = 42.5;
  saved.room.gifts = [{ id: 'saved', emoji: '🍬', item: '糖果', story: '礼物', animal: '朋友', receivedAt: 1_000, fedAt: 2_000 }];
  applyPetSnapshot(storage, saved);
  const restored = readState(storage);
  assert.equal(restored.careStats.health, 42.5);
  assert.equal(restored.messages[0].text, 'my conversation');
  assert.equal(restored.gifts[0].fedAt, 2_000);
});
test('account save validation preserves vitamin gifts and fever treatment progress', () => {
  const storage = memoryStorage();
  const state = initialState(1_000);
  state.worldEcology = { ...state.worldEcology!, sick: true, vitaminsFed: 2, lastPetPoopAt: 700 };
  state.gifts = [{
    id: 'account-vitamin',
    kind: 'vitamin',
    emoji: '💊',
    item: '维生素',
    animal: '医院小护士',
    story: '小护士送来的维生素',
    receivedAt: 900,
    fedAt: 950,
  }];
  storage.setItem(COMPANION_KEY, JSON.stringify(state));
  const snapshot = snapshotPet(storage);
  const request = UpdatePetSaveBody.parse({ snapshot, revision: 0 });
  assert.equal(request.snapshot.room.gifts[0].kind, 'vitamin');
  assert.equal(request.snapshot.room.worldEcology?.sick, true);
  assert.equal(request.snapshot.room.worldEcology?.vitaminsFed, 2);
  assert.equal(request.snapshot.room.worldEcology?.lastPetPoopAt, 700);
});
test('changing account clears active local slots but preserves each archived account', () => {
  const storage = memoryStorage();
  storage.setItem(COMPANION_KEY, JSON.stringify(initialState(1_000)));
  storage.setItem('little-panda-journal-v1', 'ACCOUNT_A_DIARY');
  const accountA = captureLocalValues(storage);
  storage.setItem(accountCacheKey('account-a'), JSON.stringify({ values: accountA, revision: 1, dirty: false }));
  storage.setItem(ACCOUNT_OWNER_KEY, 'account-a');
  restoreLocalValues(storage, {});
  assert.equal(storage.getItem('little-panda-journal-v1'), null);
  assert.ok(storage.getItem(accountCacheKey('account-a')));
  restoreLocalValues(storage, accountA);
  assert.equal(storage.getItem('little-panda-journal-v1'), 'ACCOUNT_A_DIARY');
  assert.equal(accountA[ACCOUNT_OWNER_KEY], undefined);
});
test('a committed save interrupted by reload is acknowledged rather than reported as another device', () => {
  const storage = memoryStorage();
  restoreLocalValues(storage, {});
  const snapshot = snapshotPet(storage);
  const reordered = { pet: snapshot.pet, room: { ...snapshot.room } };
  assert.equal(canRestorePendingLocal({
    values: {}, revision: 0, dirty: true, pendingWrite: { snapshot, revision: 0 },
  }, { snapshot: reordered, revision: 1 }), true);
  assert.equal(canRestorePendingLocal({
    values: {}, revision: 3, dirty: true, pendingWrite: { snapshot, revision: 3 },
  }, { snapshot: { ...snapshot, room: { ...snapshot.room, gifts: [
    { id: 'different', item: '糖', emoji: '🍬', animal: '朋友', story: '不同设备的礼物', receivedAt: 1_000 },
  ] } }, revision: 4 }), false);
});
