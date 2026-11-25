import fs from 'node:fs';
import path from 'node:path';

export function assertNoAistudioInDist(distDir = path.resolve('dist')) {
  const forbiddenDirs = [
    path.join(distDir, 'assets', 'aistudio'),
    path.join(distDir, 'aistudio'),
  ];
  for (const dir of forbiddenDirs) {
    if (fs.existsSync(dir)) {
      throw new Error(`Aset pribadi terdeteksi di hasil build produksi: ${dir}`);
    }
  }
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  path.basename(process.argv[1]) === 'check-dist.mjs';

if (isMain) {
  assertNoAistudioInDist();
  console.info('Verifikasi dist/ bersih dari assets/aistudio.');
}
