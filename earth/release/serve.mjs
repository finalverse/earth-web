// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// Extracted-bundle entry point. No npm/dev server or checkout paths required.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createEarthCore } from '../core/index.js';
import { createEarthServer } from '../server/http.js';
import { defaultDataset } from '../server/main.js';
import { pointCatalogs } from '../data/catalogs.js';
import { temporalCatalogs } from '../data/providers.js';
import { VERSION } from '../core/version.js';

const options = { surface: 'energy', port: 18648 };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--surface', '--port'].includes(key) || !process.argv[i + 1])
    throw new Error('Use --surface energy|globe --port <local port>.');
  options[key.slice(2)] = process.argv[i + 1];
}
const port = Number(options.port);
if (
  !['energy', 'globe'].includes(options.surface) ||
  !Number.isInteger(port) ||
  port < 0 ||
  port > 65535
)
  throw new Error('Invalid release server options.');
let datasets = [
  await defaultDataset(),
  ...(await pointCatalogs()),
  ...(await temporalCatalogs()),
];
let backend = null,
  pool = null;
if (process.env.EARTH_DATABASE_URL_FILE) {
  const { connectionFile, poolFor, PostGISStore } =
    await import('../db/store.js');
  pool = poolFor(await connectionFile(process.env.EARTH_DATABASE_URL_FILE));
  backend = new PostGISStore(pool);
  await backend.verifyRuntimeRole();
  datasets = await backend.datasets({ id: 'anonymous' });
  for (const id of [
    'natural-earth-countries',
    'natural-earth-places',
    'wri-canada-power-plants',
    'usgs-ridgecrest-2019',
  ])
    if (!datasets.some((d) => d.id === id))
      throw new Error(
        'Seed all four approved datasets before release startup.',
      );
}
const manifest = JSON.parse(
  await readFile(
    new URL('../../apps/energy-explorer/earth-app.json', import.meta.url),
  ),
);
const grant = JSON.parse(
  await readFile(
    new URL('../platform/dev-grants/energy-explorer.json', import.meta.url),
  ),
);
const server = createEarthServer({
  core: createEarthCore({ datasets, backend }),
  applications: [{ manifest, grant }],
  openapi: JSON.parse(
    await readFile(new URL('../contracts/openapi.json', import.meta.url)),
  ),
  webRoot: fileURLToPath(
    new URL(
      options.surface === 'energy'
        ? '../../apps/energy-explorer/dist/'
        : '../../dist-earth/',
      import.meta.url,
    ),
  ),
  publicOrigin: process.env.EARTH_PUBLIC_ORIGIN || null,
  readyCheck: async () => {
    if (pool) await pool.query('SELECT 1');
    return true;
  },
  // Public preview artifacts have no inference or operator credential handler.
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    JSON.stringify({
      event: 'release_ready',
      version: VERSION,
      surface: options.surface,
      url: 'http://127.0.0.1:' + server.address().port,
      ai_enabled: false,
    }),
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    server.close(async () => {
      if (pool) await pool.end();
      process.exit(0);
    });
    server.closeAllConnections();
  });
