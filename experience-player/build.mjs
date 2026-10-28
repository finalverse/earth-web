// Local, buildless player; reuse Earth Web's installed/pinned Cesium distribution.
import { cp, mkdir, readFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const deps = path.resolve(
  process.env.FEN_EARTH_DEPENDENCIES || path.join(here, '../node_modules'),
);
const cesium = JSON.parse(
  await readFile(path.join(deps, 'cesium/package.json'), 'utf8'),
);
if (cesium.version !== '1.138.0')
  throw new Error(
    'Review a Cesium version change before rebuilding the player',
  );
const out = path.join(here, 'dist');
await mkdir(out, { recursive: true });
for (const file of [
  'index.html',
  'player.js',
  'creator.js',
  'protocol.mjs',
  'styles.css',
])
  await copyFile(path.join(here, file), path.join(out, file));
await cp(path.join(deps, 'cesium/Build/Cesium'), path.join(out, 'cesium'), {
  recursive: true,
});
await copyFile(
  path.join(deps, 'cesium/LICENSE.md'),
  path.join(out, 'cesium/LICENSE.md'),
);
await copyFile(
  path.join(here, '../earth/web/brand/wordmark-dark.svg'),
  path.join(out, 'logo.svg'),
);
await copyFile(
  path.join(here, '../LICENSE.finalverse'),
  path.join(out, 'LICENSE.txt'),
);
console.log(
  JSON.stringify({
    output: out,
    cesium: cesium.version,
    network_dependencies: false,
  }),
);
