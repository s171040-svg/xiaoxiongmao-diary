import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
const jobs = JSON.parse(await readFile('generated-artifacts/xiaobai-generation-receipts.json', 'utf8'));
const root = 'artifacts/panda-journal/public/static/xiaobai';
const items = [];
for (const job of jobs) {
  if (!job.jobId) continue;
  if (job.kind === 'pose') {
    if (job.name === 'grab') continue; // Both drafts were rejected, use the cleaned dangling pose.
    items.push({ ...job, index: 0, path: `${job.name === 'grab-clean' ? 'grab' : job.name}.png` });
  } else {
    for (let n = 1; n <= job.count; n++) {
      items.push({ ...job, index: n, path: `${job.kind === 'loop' ? 'loops' : 'transitions'}/${job.name}/${n}.png` });
    }
  }
}
let failures = 0;
let completed = 0;
const queue = [...items];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const item = queue.shift();
    const path = join(root, item.path);
    try { if ((await stat(path)).size > 100) { completed++; continue; } } catch {}
    await mkdir(dirname(path), { recursive: true });
    const response = await fetch(`https://api.pixellab.ai/mcp/images/${item.jobId}/download?index=${item.index}`);
    if (!response.ok) {
      console.error(`${response.status} ${item.path}`);
      failures++;
      continue;
    }
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
    completed++;
  }
}));
console.log(JSON.stringify({ completed, pendingOrFailed: failures, total: items.length }));
if (failures) process.exitCode = 1;
