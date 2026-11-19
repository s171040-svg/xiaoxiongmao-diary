import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Keep the puppy and paws, not the extra container baked into the generation.
// Alpha-only masks preserve the canvas, pet position, palette and original pixels.
const root = 'artifacts/panda-journal/public/static/xiaobai';
const masks = {
  main: 'rectangle 0,0 95,57 rectangle 26,58 43,62 rectangle 60,58 75,62 polygon 0,58 25,58 25,65 22,68 20,70 0,70',
  entering4: 'rectangle 0,0 95,57 rectangle 31,58 47,64 rectangle 64,58 75,62 polygon 0,58 22,58 22,74 0,74',
  entering5: 'rectangle 0,0 95,57 rectangle 62,58 74,59 polygon 0,58 24,58 24,71 22,74 0,74',
};
const files = [
  ['jar.png', 'main'],
  ...Array.from({ length: 8 }, (_, i) => [`loops/jar/${i + 1}.png`, 'main']),
  ['transitions/to-jar/4.png', 'entering4'],
  ['transitions/to-jar/5.png', 'entering5'],
  ['transitions/to-jar/6.png', 'main'],
];
const temp = mkdtempSync(join(tmpdir(), 'xiaobai-jar-'));
try {
  for (const [key, draw] of Object.entries(masks)) {
    execFileSync('magick', ['-size', '96x96', 'xc:none', '-fill', 'white', '-draw', draw, join(temp, `${key}.png`)]);
  }
  for (const [file, mask] of files) {
    execFileSync('magick', [join(root, file), join(temp, `${mask}.png`),
      '-compose', 'DstIn', '-composite', join(root, file)]);
  }
  console.log(`Removed the extra jar from ${files.length} Xiaobai images.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
