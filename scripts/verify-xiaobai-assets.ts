import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { characterAsset } from '../artifacts/panda-journal/src/lib/pet-character-assets';

const publicDir = 'artifacts/panda-journal/public';
const pandaDir = join(publicDir, 'static/panda');
const files = readdirSync(pandaDir, { recursive: true }).filter((file): file is string =>
  typeof file === 'string' && /\.(png|svg)$/.test(file));
let mapped = 0;
for (const file of files) {
  const source = `/static/panda/${file}?v=source`;
  assert.equal(characterAsset(source, 'panda').src, source);
  const resolved = characterAsset(source, 'xiaobai');
  assert(existsSync(join(publicDir, resolved.src.split('?')[0])), `Missing mapped asset: ${file} → ${resolved.src}`);
  if (!['snack.png', 'captured-time-portal.svg', 'captured-time-portal.png'].includes(file)) {
    assert(resolved.src.includes('/static/xiaobai/'), `Panda body leaked: ${file}`);
    mapped++;
  }
}
const transitionDir = join(publicDir, 'static/xiaobai/transitions');
for (const name of readdirSync(transitionDir)) {
  const frames = readdirSync(join(transitionDir, name)).filter(f => f.endsWith('.png'));
  assert(frames.length >= 5, `${name} needs at least five intermediate frames`);
  const signatures = frames.map(frame => execFileSync('magick', [
    join(transitionDir, name, frame), '-format', '%#', 'info:',
  ], { encoding: 'utf8' }));
  assert(new Set(signatures).size >= 5, `${name} has duplicated intermediate poses`);
}
console.log(`PASS: ${mapped} character sources resolve to Xiaobai; panda originals unchanged; all pose transitions contain ≥5 distinct images.`);
