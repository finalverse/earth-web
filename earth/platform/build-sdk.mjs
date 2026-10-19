// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import { mkdir, copyFile, rm, readFile } from 'node:fs/promises';
import '../contracts/build.mjs';
await rm('packages/earth/dist', { recursive: true, force: true });
execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'packages/earth/tsconfig.json'],
  { stdio: 'inherit' },
);
await copyFile('earth/contracts/openapi.json', 'packages/earth/openapi.json');
await mkdir('artifacts', { recursive: true });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(
  npm,
  [
    'pack',
    './packages/earth',
    '--pack-destination',
    'artifacts',
    '--ignore-scripts',
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
const pkg = JSON.parse(await readFile('packages/earth/package.json'));
if (pkg.dependencies || pkg.peerDependencies)
  throw new Error('Core SDK must have no runtime dependencies.');
