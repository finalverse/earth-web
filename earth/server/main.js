import { createResourceGateway } from './resource-gateway.js';
// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createEarthCore, naturalEarthDataset } from '../core/index.js';
import { createEarthServer } from './http.js';
import { OllamaPlanner } from './planner.js';
import { DatasetRegistry } from '../core/registry.js';
import { temporalCatalogs } from '../data/providers.js';
import { pointCatalogs } from '../data/catalogs.js';
export async function defaultDataset() {
  const bytes = await readFile(
    new URL(
      '../../src/data/local_data/natural_earth/countries.json',
      import.meta.url,
    ),
  );
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (
    digest !==
    'b9f865783a8e539cd39ea6a0fb506c86482f04a5723fb48b6059b1c634456e50'
  )
    throw new Error(
      'Approved dataset hash changed; review provenance and update the allowlist.',
    );
  return naturalEarthDataset(JSON.parse(bytes), digest);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flags = new Set(process.argv.slice(2));
  for (const flag of flags)
    if (!['--ai', '--headless', '--mutsea', '--postgis'].includes(flag))
      throw new Error(`Unknown option: ${flag}`);
  let operatorToken = null,
    backend = null,
    pool = null;
  if (process.env.EARTH_OPERATOR_TOKEN_FILE) {
    const file = process.env.EARTH_OPERATOR_TOKEN_FILE;
    if (process.platform !== 'win32' && (await stat(file)).mode & 0o077)
      throw new Error('Operator token file must be private (0600).');
    operatorToken = (await readFile(file, 'utf8')).trim();
  }
  let datasets = [
    await defaultDataset(),
    ...(await pointCatalogs()),
    ...(await temporalCatalogs()),
  ];
  if (flags.has('--postgis')) {
    const { poolFor, connectionFile, PostGISStore } =
      await import('../db/store.js');
    pool = poolFor(await connectionFile(process.env.EARTH_DATABASE_URL_FILE));
    backend = new PostGISStore(pool);
    await backend.verifyRuntimeRole();
    datasets = await backend.datasets({
      id: operatorToken ? 'earth-operator' : 'anonymous',
    });
    for (const id of [
      'natural-earth-countries',
      'natural-earth-places',
      'wri-canada-power-plants',
      'usgs-ridgecrest-2019',
    ])
      if (!datasets.some((d) => d.id === id))
        throw new Error('Seed the dedicated Earth database before starting.');
  }
  const registry = new DatasetRegistry(datasets);
  const core = createEarthCore({ registry, backend });
  const operatorCore = operatorToken
    ? createEarthCore({
        registry,
        backend,
        principal: { id: 'earth-operator', canRegister: true },
      })
    : null;
  const { publicWorlds } = flags.has('--mutsea')
    ? await import('../adapters/mutsea.js')
    : { publicWorlds: [] };
  const server = createEarthServer({
    resourceResolver: process.env.EARTH_SPATIALDB_ENDPOINT
      ? createResourceGateway(process.env.EARTH_SPATIALDB_ENDPOINT)
      : null,
    core,
    operatorCore,
    operatorToken,
    planner: flags.has('--ai')
      ? new OllamaPlanner({
          places: datasets.find((d) => d.id === 'natural-earth-places')
            .features,
        })
      : null,
    publicOrigin: process.env.EARTH_PUBLIC_ORIGIN || null,
    readyCheck: async () => {
      if (pool) await pool.query('SELECT 1');
      return true;
    },
    logger:
      process.env.EARTH_LOG_JSON === '1'
        ? (entry) => console.log(JSON.stringify(entry))
        : null,
    worlds: publicWorlds,
    webRoot: flags.has('--headless')
      ? null
      : fileURLToPath(new URL('../../dist-earth', import.meta.url)),
  });
  for (const name of ['SIGINT', 'SIGTERM'])
    process.once(name, () => {
      server.close(async () => {
        if (pool) await pool.end();
        process.exit(0);
      });
      server.closeAllConnections();
    });
  server.listen(18640, '127.0.0.1', () =>
    console.log(
      `Finalverse Earth http://127.0.0.1:18640 | local AI ${flags.has('--ai') ? 'enabled' : 'off'} | MutSea ${flags.has('--mutsea') ? 'optional destinations' : 'off'}`,
    ),
  );
}
