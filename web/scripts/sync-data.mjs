import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// copy the pipeline's output into web/public so the site can serve it. data/ stays
// the one real source of truth, so the scheduled job only ever writes to one place
// and the site just picks it up from there.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const src = path.join(repoRoot, 'data');
const dest = path.join(repoRoot, 'web', 'public', 'data');

const FILES = ['jobs.json', 'meta.json'];

await fs.mkdir(dest, { recursive: true });

let copied = 0;
for (const file of FILES) {
  try {
    await fs.copyFile(path.join(src, file), path.join(dest, file));
    copied++;
  } catch (err) {
    if (file === 'jobs.json') {
      // no jobs file means there's nothing to show. write an empty one anyway so
      // the build still works and you get the "run npm run refresh" message
      // instead of a crash.
      await fs.writeFile(
        path.join(dest, 'jobs.json'),
        JSON.stringify({ generatedAt: new Date(0).toISOString(), count: 0, jobs: [] }, null, 2),
      );
      console.warn(`! ${file} missing (${err.code}) — wrote an empty placeholder. Run: npm run refresh`);
    } else {
      console.warn(`! ${file} missing (${err.code}) — skipping`);
    }
  }
}

console.log(`sync-data: copied ${copied}/${FILES.length} file(s) to web/public/data`);
