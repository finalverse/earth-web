// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { readFile, mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createEarthCore } from '../core/index.js';
import { createEarthServer } from '../server/http.js';
import { defaultDataset } from '../server/main.js';
import { pointCatalogs } from '../data/catalogs.js';
import { temporalCatalogs } from '../data/providers.js';
import { PlannerRouter } from '../server/intelligence.js';
import { OllamaPlanner } from '../server/planner.js';
const args = process.argv.slice(2);
const flags = new Map();
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--ai' || k === '--sdk-demo') {
    flags.set(k, true);
    continue;
  }
  if (
    !['--port', '--manifest', '--grant', '--web-root'].includes(k) ||
    !args[i + 1]
  )
    throw new Error('Unknown/missing development option.');
  flags.set(k, args[++i]);
}
const root = fileURLToPath(new URL('../../', import.meta.url)),
  demo = flags.has('--sdk-demo'),
  port = Number(flags.get('--port') ?? 18641);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid local port.');
const datasets = [
    await defaultDataset(),
    ...(await pointCatalogs()),
    ...(await temporalCatalogs()),
  ],
  core = createEarthCore({ datasets });
let manifest, grant, webRoot;
if (demo) {
  manifest = JSON.parse(
    await readFile(new URL('./dev-grants/sdk-example.json', import.meta.url)),
  );
  grant = structuredClone(manifest);
  webRoot = resolve(root, 'artifacts/sdk-browser');
  await mkdir(webRoot, { recursive: true });
  await cp(resolve(root, 'packages/earth/dist'), resolve(webRoot, 'sdk'), {
    recursive: true,
  });
  for (const f of ['index.html', 'example.js', 'style.css'])
    await copyFile(
      new URL('./example/' + f, import.meta.url),
      resolve(webRoot, f),
    );
  await copyFile(
    new URL('./dev-grants/sdk-example.json', import.meta.url),
    resolve(webRoot, 'manifest.json'),
  );
} else {
  if (
    !flags.has('--manifest') ||
    !flags.has('--grant') ||
    !flags.has('--web-root')
  )
    throw new Error(
      'Provide separately reviewed --manifest, --grant and --web-root.',
    );
  manifest = JSON.parse(await readFile(resolve(flags.get('--manifest'))));
  grant = JSON.parse(await readFile(resolve(flags.get('--grant'))));
  webRoot = resolve(flags.get('--web-root'));
}
const server = createEarthServer({
  development: true,
  core,
  applications: [{ manifest, grant }],
  openapi: JSON.parse(
    await readFile(new URL('../contracts/openapi.json', import.meta.url)),
  ),
  webRoot,
  planner: flags.has('--ai')
    ? new PlannerRouter({
        providers: [
          new OllamaPlanner({
            places: datasets.find((d) => d.id === 'natural-earth-places')
              .features,
          }),
        ],
      })
    : null,
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    JSON.stringify({
      event: 'local_platform_ready',
      url: 'http://127.0.0.1:' + port,
      application: manifest.id,
      ai_enabled: flags.has('--ai'),
      public_deployment: false,
    }),
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
