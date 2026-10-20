import { createEarthCore } from '../../core/index.js';
import { defaultDataset } from '../../server/main.js';
import { pointCatalogs } from '../../data/catalogs.js';
import { temporalCatalogs } from '../../data/providers.js';
import { createEarthServer } from '../../server/http.js';
import { readFile } from 'node:fs/promises';
export const datasets = [
  await defaultDataset(),
  ...(await pointCatalogs()),
  ...(await temporalCatalogs()),
];
export const manifest = {
  manifest_version: '1.0',
  id: 'finalverse.sdk-example',
  name: 'SDK example',
  version: '0.4.0-rc.1',
  api_version: '1',
  entry: './index.html',
  runtime: 'trusted-same-origin',
  capabilities: [
    'earth.datasets.read',
    'earth.spatial.query',
    'earth.temporal.query',
    'earth.workspace.local.read',
    'earth.workspace.local.write',
    'earth.ai.plan',
  ],
  datasets: datasets.map((d) => d.id),
  tools: createEarthCore()
    .definitions()
    .map((t) => t.name),
  budgets: { max_features: 100, max_radius_m: 500000 },
};
export const renewable = {
  dataset: 'wri-canada-power-plants',
  place_id: 'ne-place-1173',
  radius_m: 100000,
  fuels: ['Biomass', 'Geothermal', 'Hydro', 'Solar', 'Wave and Tidal', 'Wind'],
  limit: 100,
};
export async function fixture(t, options = {}) {
  const core = createEarthCore({ datasets }),
    server = createEarthServer({
      core,
      openapi: JSON.parse(
        await readFile(
          new URL('../../contracts/openapi.json', import.meta.url),
        ),
      ),
      applications: [{ manifest, grant: structuredClone(manifest) }],
      ...options,
    });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(
    () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  );
  return { core, server, url: 'http://127.0.0.1:' + server.address().port };
}
