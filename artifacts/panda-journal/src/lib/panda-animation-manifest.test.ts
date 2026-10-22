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
    'climb-up',
    'eat-banana',
    'eat-carrot',
    'eat-fish',
    'eat-candy',
    'eat-strawberry',
    'eat-cookie',
    'eat-bamboo',
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
  assert.match(stageCss, /\.ps-panda\.ps-somersault \.ps-body\{[^}]*animation:none/);
  assert.match(stageCss, /\.ps-panda\.ps-somersault\{animation:none\}/);
  assert.doesNotMatch(stageCss, /ps-somersault-hop/);
});

test('belly-up pawing uses distinct transparent frames and a matched grounded transition', () => {
  assert.ok(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const assetRoot = resolve(dirname(manifestPath), '../../public/static/panda');
  assert.equal(manifest.actionSprites.somersault, 'back-pawing');
  assert.equal(manifest.frameCountBySprite['back-pawing'], 8);
  const frames = [
    'back-pawing.png',
    ...Array.from({ length: 8 }, (_, i) => `frames/back-pawing-${i + 1}.png`),
  ].map(file => readFileSync(resolve(assetRoot, file)));
  const transition = Array.from({ length: 7 }, (_, i) =>
    readFileSync(resolve(assetRoot, `transitions/idle-to-back-pawing-${i + 1}.png`)));
  for (const image of [...frames, ...transition]) {
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(16), 80);
    assert.equal(image.readUInt32BE(20), 80);
    assert.equal(image[25], 6, 'PNG must retain RGBA transparency');
  }
  assert.ok(new Set(frames.map(image => image.toString('base64'))).size >= 6);
  assert.equal(new Set(transition.map(image => image.toString('base64'))).size, 7,
    'five distinct intermediate poses must connect the start and end poses');
  assert.deepEqual(transition.at(-1), frames[0], 'transition must end on the action pose');
});

test('every snack has a distinct complete 96px eating animation', () => {
  assert.ok(manifestPath, 'could not locate the panda animation manifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    frameCountBySprite: Record<string, number>;
    actionSprites: Record<string, string>;
  };
  const assetRoot = resolve(dirname(manifestPath), '../../public/static/panda');
  const snackActions = ['eat-banana', 'eat-carrot', 'eat-fish', 'eat-candy', 'eat-strawberry', 'eat-cookie', 'eat-bamboo'];
  const sprites = snackActions.map(action => manifest.actionSprites[action]);
  assert.equal(new Set(sprites).size, snackActions.length, 'each snack must use a different animation');

  for (const sprite of sprites) {
    assert.equal(manifest.frameCountBySprite[sprite], 7, `${sprite} should have eight generated poses`);
    for (const path of [`${sprite}.png`, ...Array.from({ length: 7 }, (_, i) => `frames/${sprite}-${i + 1}.png`)]) {
      const image = readFileSync(resolve(assetRoot, path));
      assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${path} is a PNG`);
      assert.equal(image.readUInt32BE(16), 96, `${path} keeps the 96px width`);
      assert.equal(image.readUInt32BE(20), 96, `${path} keeps the 96px height`);
      assert.ok(image.length > 1000, `${path} contains real sprite artwork`);
    }
  }
});

test('toy reactions and their transitions have complete distinct 96px frame sequences', () => {
  assert.ok(manifestPath, 'could not locate the panda animation manifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    frameCountBySprite: Record<string, number>;
  };
  const assetRoot = resolve(dirname(manifestPath), '../../public/static/panda');

  for (const sprite of ['toy-teaser', 'toy-laser', 'toy-curious', 'toy-brake', 'toy-wall-dizzy']) {
    const poses = new Set<string>();
    assert.equal(manifest.frameCountBySprite[sprite], 8, `${sprite} should have eight generated poses`);
    for (let frame = 1; frame <= 8; frame += 1) {
      const image = readFileSync(resolve(assetRoot, `frames/${sprite}-${frame}.png`));
      assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${sprite}-${frame} is a PNG`);
      assert.equal(image.readUInt32BE(16), 96, `${sprite}-${frame} keeps the 96px width`);
      assert.equal(image.readUInt32BE(20), 96, `${sprite}-${frame} keeps the 96px height`);
      assert.ok(image.length > 1000, `${sprite}-${frame} contains real sprite artwork`);
      poses.add(image.toString('base64'));
    }
    assert.ok(poses.size >= 5, `${sprite} has at least five genuinely different transition poses`);
  }
});

test('jar-peeking is a distinct animation with a complete 96px sequence and inspector entry', () => {
  assert.ok(manifestPath, 'could not locate the panda animation manifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    frameCountBySprite: Record<string, number>;
  };
  const assetRoot = resolve(dirname(manifestPath), '../../public/static/panda');
  const poses = new Set<string>();
  const files = ['jar-peeking.png', ...Array.from({ length: 8 }, (_, index) => `frames/jar-peeking-${index + 1}.png`)];

  assert.equal(manifest.frameCountBySprite['jar-peeking'], 8, 'jar-peeking should have eight generated poses');
  for (const file of files) {
    const image = readFileSync(resolve(assetRoot, file));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} is a PNG`);
    assert.equal(image.readUInt32BE(16), 96, `${file} keeps the 96px width`);
    assert.equal(image.readUInt32BE(20), 96, `${file} keeps the 96px height`);
    assert.ok(image.length > 1000, `${file} contains real sprite artwork`);
    poses.add(image.toString('base64'));
  }
  assert.ok(poses.size >= 5, 'jar-peeking has at least five genuinely different poses');

  const sourceRoot = resolve(dirname(manifestPath), '..');
  const inspector = readFileSync(resolve(sourceRoot, 'components/CompanionChat.tsx'), 'utf8');
  assert.match(inspector, /event: 'jar-peeking'.*罐子：双爪搭沿四处张望/, 'jar-peeking should be available in animation inspection');
});
