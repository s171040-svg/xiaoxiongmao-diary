import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const manifestPath = [
  resolve(process.cwd(), 'src/lib/panda-animation-manifest.json'),
  resolve(process.cwd(), 'artifacts/panda-journal/src/lib/panda-animation-manifest.json'),
].find(path => existsSync(path));

test('every animation inspector action has its own visible animation assets', () => {
  assert.ok(manifestPath, 'could not locate the panda animation manifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    frameCount: number;
    frameCountBySprite: Record<string, number>;
    actionSprites: Record<string, string>;
  };
  const assetRoot = resolve(dirname(manifestPath), '../../public/static/panda');
  const previewActions = [
    'bamboo',
    'jump',
    'spin',
    'somersault',
    'tail',
    'cuddle',
    'captured-homecoming',
  ];

  for (const action of previewActions) {
    const sprite = manifest.actionSprites[action];
    assert.ok(sprite, `${action} has no action sprite mapping`);
    if (action !== 'spin') {
      assert.notEqual(sprite, 'idle', `${action} must not reuse the idle animation`);
    }

    const count = manifest.frameCountBySprite[sprite] ?? manifest.frameCount;
    const base = action === 'cuddle'
      ? 'lying.png'
      : action === 'captured-homecoming' ? 'captured-dazed.png' : `${sprite}.png`;
    assert.ok(existsSync(resolve(assetRoot, base)), `${action} is missing its base image ${base}`);
    for (let frame = 1; frame <= count; frame += 1) {
      assert.ok(
        existsSync(resolve(assetRoot, `frames/${sprite}-${frame}.png`)),
        `${action} is missing ${sprite} frame ${frame}`,
      );
    }
  }

  const stageCss = readFileSync(resolve(assetRoot, '../../../src/components/PetStage.css'), 'utf8');
  assert.match(stageCss, /\.ps-panda\.ps-spin \.ps-body\{[^}]*ps-spin-in-place/);
  assert.match(stageCss, /\.ps-panda\.ps-somersault \.ps-body\{[^}]*ps-somersault-hop/);
});

test('both new toy interactions have complete transparent 96px frame sequences', () => {
  assert.ok(manifestPath, 'could not locate the panda animation manifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    frameCountBySprite: Record<string, number>;
  };
  const assetRoot = resolve(dirname(manifestPath), '../../public/static/panda');

  for (const sprite of ['toy-teaser', 'toy-laser']) {
    assert.equal(manifest.frameCountBySprite[sprite], 8, `${sprite} should have eight generated poses`);
    for (let frame = 1; frame <= 8; frame += 1) {
      const image = readFileSync(resolve(assetRoot, `frames/${sprite}-${frame}.png`));
      assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${sprite}-${frame} is a PNG`);
      assert.equal(image.readUInt32BE(16), 96, `${sprite}-${frame} keeps the 96px width`);
      assert.equal(image.readUInt32BE(20), 96, `${sprite}-${frame} keeps the 96px height`);
      assert.ok(image.length > 1000, `${sprite}-${frame} contains real sprite artwork`);
    }
  }
});
