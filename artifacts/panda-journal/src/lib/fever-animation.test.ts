import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { characterAsset } from './pet-character-assets';
import { PIXELLAB_TRANSITION_FRAME_FILES } from './pixel-transition';

const root = [
  resolve(process.cwd(), 'public/static'),
  resolve(process.cwd(), 'artifacts/panda-journal/public/static'),
].find(path => existsSync(path))!;

test('both pets have transparent fever loops and six real entry frames', () => {
  for (const character of ['panda', 'xiaobai']) {
    const loopFiles = character === 'panda'
      ? ['fever.png', ...Array.from({ length: 7 }, (_, n) => `frames/fever-${n + 1}.png`)]
      : ['fever.png', ...Array.from({ length: 8 }, (_, n) => `loops/fever/${n + 1}.png`)];
    const entryFiles = PIXELLAB_TRANSITION_FRAME_FILES.fever.map((path, n) =>
      character === 'panda' ? path : `transitions/to-fever/${n + 1}.png`);
    const entryFrames: string[] = [];
    for (const file of [...loopFiles, ...entryFiles]) {
      const image = readFileSync(resolve(root, character, file));
      assert.equal(image.readUInt32BE(16), 96, file);
      assert.equal(image.readUInt32BE(20), 96, file);
      assert.equal(image[25], 6, `${file} should retain transparency`);
      if (entryFiles.includes(file)) entryFrames.push(image.toString('base64'));
    }
    assert.equal(new Set(entryFrames).size, 6, `${character} transition frames should be different poses`);
  }
});

test('Xiaobai fever frames resolve to dog art for both loop and transition', () => {
  const sources = [
    '/static/panda/fever.png',
    '/static/panda/frames/fever-7.png',
    ...PIXELLAB_TRANSITION_FRAME_FILES.fever.map(file => `/static/panda/${file}`),
  ];
  for (const source of sources) {
    const asset = characterAsset(source, 'xiaobai');
    assert.equal(asset.group, 'fever');
    assert.match(asset.src, /\/static\/xiaobai\//);
    assert.ok(existsSync(resolve(root, new URL(asset.src, 'http://localhost').pathname.replace('/static/', ''))));
  }
});
