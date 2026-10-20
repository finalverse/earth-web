// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export async function verifyRelease(directory) {
  const root = await realpath(directory);
  const lines = (await readFile(resolve(root, 'FILES.sha256'), 'utf8'))
    .trim()
    .split('\n');
  const seen = new Set();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([a-zA-Z0-9_./@ -]+)$/.exec(line);
    if (!match) throw new Error('Malformed checksum manifest.');
    const [, digest, name] = match;
    const parts = name.split('/');
    if (
      name.startsWith('/') ||
      parts.some((p) => !p || p === '.' || p === '..') ||
      seen.has(name)
    )
      throw new Error('Unsafe/duplicate checksum path.');
    seen.add(name);
    const path = resolve(root, name);
    if (
      !(await lstat(path)).isFile() ||
      !(await realpath(path)).startsWith(root + sep)
    )
      throw new Error('Release files must be regular confined files.');
    const actual = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
    if (actual !== digest)
      throw new Error('Release checksum mismatch: ' + name);
  }
  for (const required of [
    'package.json',
    'npm-shrinkwrap.json',
    'earth/release/serve.mjs',
    'earth/core/version.js',
    'SBOM.cdx.json',
    'RELEASE.json',
  ])
    if (!seen.has(required)) throw new Error('Missing release component.');
  return { files_verified: seen.size };
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(
    JSON.stringify(await verifyRelease(process.argv[2] || process.cwd())),
  );
