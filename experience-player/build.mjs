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
  'guest.js',
  'living.js',
  'intelligence.js',
  'world-creator.js',
  'network.js',
  'world-entry.js',
  'runtime-protocol.mjs',
  'discovery.html',
  'discovery.js',
  'discovery.css',
  'embed.html',
  'embed.js',
  'embed.css',
  'smart-protocol.mjs',
  'presentation.mjs',
  'protocol.mjs',
  'styles.css',
])
  await copyFile(path.join(here, file), path.join(out, file));
await copyFile(
  path.join(here, '../src/data/local_data/natural_earth/countries.json'),
  path.join(out, 'countries.json'),
);
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

await cp(path.join(here, 'network-assets'), path.join(out, 'network-assets'), {
  recursive: true,
});

// The public alpha: its pages, the vendored renderer (see alpha/vendor/VENDOR.md) and a flat
// Earth from Cesium's bundled Natural Earth II tiles (public domain), level 2 as 8 x 4 tiles.
await cp(path.join(here, 'alpha'), path.join(out, 'alpha'), { recursive: true });
await mkdir(path.join(out, 'alpha/earth'), { recursive: true });
const naturalEarth = path.join(deps, 'cesium/Build/Cesium/Assets/Textures/NaturalEarthII/2');
for (let x = 0; x < 8; x++)
  for (let y = 0; y < 4; y++)
    await copyFile(path.join(naturalEarth, String(x), `${y}.jpg`), path.join(out, 'alpha/earth', `${x}-${y}.jpg`));
