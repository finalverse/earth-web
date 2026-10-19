// Portable npm packing excludes OS resource forks and preserves a standard package layout.
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
execFileSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['pack', '--ignore-scripts', '--pack-destination', 'artifacts'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
