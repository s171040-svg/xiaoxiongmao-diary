import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopCharacterSelection } from './desktop-character-selection';

const signedIn = { authLoaded: true, signedIn: true, loading: false, error: false };
for (const characterId of ['panda', 'xiaobai'] as const) {
  test(`desktop uses the account's locked ${characterId}`, () => {
    assert.deepEqual(desktopCharacterSelection({
      ...signedIn, selection: { characterId, locked: true },
    }), { characterId, status: 'ready', ready: true });
  });
}
test('guest panda is never a confirmed desktop identity', () => {
  assert.equal(desktopCharacterSelection({ ...signedIn, signedIn: false }).status, 'signed-out');
  assert.equal(desktopCharacterSelection({ ...signedIn, signedIn: false }).ready, false);
});
test('auth loading, account switches and failed reads cannot release a placeholder', () => {
  for (const input of [
    { ...signedIn, authLoaded: false },
    { ...signedIn, loading: true },
    { ...signedIn, error: true, selection: { characterId: 'xiaobai', locked: true } },
    { ...signedIn },
    { ...signedIn, selection: { characterId: null, locked: false } },
    { ...signedIn, selection: { characterId: 'unknown', locked: true } },
  ]) assert.equal(desktopCharacterSelection(input).ready, false);
});
test('shared household choice is passed through without a per-device override', () => {
  assert.equal(desktopCharacterSelection({
    ...signedIn, selection: { characterId: 'xiaobai', locked: true },
  }).characterId, 'xiaobai');
});
