import assert from 'node:assert/strict';
import test from 'node:test';
import { choosePetDream, dreamRandom, DREAM_CATALOGUE, DREAM_READY_MS } from './pet-dreams';

test('each dream has its own picture identity and matching description', () => {
  assert.equal(new Set(DREAM_CATALOGUE.map(d => d.id)).size, 12);
  for (let i = 0; i < 12; i++) {
    const dream = choosePetDream(undefined, () => (i + .1) / 12);
    assert.equal(dream.id, DREAM_CATALOGUE[i].id);
    assert.equal(dream.text, DREAM_CATALOGUE[i].text);
    assert(dream.title.length > 0);
  }
});
test('random changes never immediately repeat, even at random range boundaries', () => {
  for (const previous of DREAM_CATALOGUE) for (const random of [0, .5, .999999]) {
    assert.notEqual(choosePetDream(previous.id, () => random).id, previous.id);
  }
});
test('decorations stay stable on rerenders, with new variations for a different seed', () => {
  const positions = (seed: number) => {
    const rng = dreamRandom(seed);
    return Array.from({ length: 12 }, () => rng());
  };
  assert.deepEqual(positions(9), positions(9));
  assert.notDeepEqual(positions(9), positions(10));
  assert.equal(DREAM_READY_MS, 120000, 'ordinary sleep still waits two minutes before dreaming');
});
