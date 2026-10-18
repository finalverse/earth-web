// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('dist-earth');
let files = 0,
  bytes = 0;
async function visit(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name),
      name = relative(root, file).replaceAll('\\', '/');
    assert.ok(
      /^(assets|cesium|examples|notices)(\/|$)/.test(name) || name === 'index.html',
      'Unexpected build path: ' + name,
    );
    assert.ok(
      !/(^|\/)(events|models|local_data|\.env)(\/|$)/.test(name),
      'Unapproved asset path: ' + name,
    );
    if (entry.isDirectory()) await visit(file);
    else {
      files++;
      bytes += (await stat(file)).size;
    }
  }
}
await visit(root);
const example = await readFile(
  join(root, 'examples/country-explorer.html'),
  'utf8',
);
assert.ok(
  !example.includes('/cesium/'),
  'SDK example must not load the globe runtime',
);
for (const name of [
  'upstream-MIT.txt',
  'Finalverse-MIT.txt',
  'Cesium.txt',
  'Proj4js.txt',
  'GeographicLib.txt',
  'third-party.md',
])
  assert.ok((await readFile(join(root, 'notices', name))).length > 100);
console.log(
  JSON.stringify(
    {
      files,
      bytes,
      approved_roots: ['assets', 'cesium', 'examples', 'notices'],
      sdk_example_requires_cesium: false,
      license_files: 6,
      scope:
        'Build-path/notice audit; not a complete legal or vulnerability assessment.',
    },
    null,
    2,
  ),
);
