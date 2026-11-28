import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { characterAsset } from './pet-character-assets';
import { PIXELLAB_TRANSITION_FRAME_FILES } from './pixel-transition';
import { chooseRestActivity, getRestDurationMs, PLUSH_PLAY_DURATION_MS, scheduleActivityReset } from './room-activity';

const root = [resolve(process.cwd(), 'public/static'), resolve(process.cwd(), 'artifacts/panda-journal/public/static')]
  .find(path => existsSync(path))!;

test('both pets have their own complete transparent seated toy animation and six real transition frames', () => {
  for (const character of ['panda', 'xiaobai']) {
    const loop = character === 'panda'
      ? ['plush-play.png', ...Array.from({ length: 7 }, (_, n) => `frames/plush-play-${n + 1}.png`)]
      : Array.from({ length: 8 }, (_, n) => `loops/plush-play/${n + 1}.png`);
    const entry = PIXELLAB_TRANSITION_FRAME_FILES['plush-play'].map((path, n) =>
      character === 'panda' ? path : `transitions/to-plush-play/${n + 1}.png`);
    const entryImages: string[] = [];
    for (const path of [...loop, ...entry]) {
      const image = readFileSync(resolve(root, character, path));
      assert.equal(image.readUInt32BE(16), 96, path);
      assert.equal(image.readUInt32BE(20), 96, path);
      assert.equal(image[25], 6, `${path} has an alpha channel`);
      if (entry.includes(path)) entryImages.push(image.toString('base64'));
    }
    assert.equal(new Set(entryImages).size, 6, 'each transition frame is a separately drawn pose');
  }
});
test('Xiaobai maps the new body, loop and transition to dog redraws, not panda art', () => {
  for (const source of ['plush-play.png', 'frames/plush-play-7.png', ...PIXELLAB_TRANSITION_FRAME_FILES['plush-play']]) {
    const resolved = characterAsset(`/static/panda/${source}`, 'xiaobai');
    assert.equal(resolved.group, 'plush-play');
    assert.match(resolved.src, /\/static\/xiaobai\//);
    assert.ok(existsSync(resolve(root, new URL(resolved.src, 'http://localhost').pathname.replace('/static/', ''))));
  }
});
test('seated toy play is selected from idle choices and lasts exactly one minute', () => {
  assert.equal(chooseRestActivity({ u: 0.8, v: 0.72 }, () => 0.5), 'plush-play');
  assert.equal(PLUSH_PLAY_DURATION_MS, 60_000);
  assert.equal(getRestDurationMs('plush-play', () => 0), 60_000);
  assert.equal(getRestDurationMs('plush-play', () => 0.999), 60_000);
  let elapsed = 0, reset = false, cancelled = false;
  const stop = scheduleActivityReset('plush-play', () => { reset = true; },
    (callback, delay) => {
      elapsed = delay;
      // Run the stored callback without waiting a real minute.
      callback();
      return 1 as ReturnType<typeof setTimeout>;
    }, () => { cancelled = true; });
  assert.equal(elapsed, 60_000);
  assert.equal(reset, true);
  stop();
  assert.equal(cancelled, true);
});
