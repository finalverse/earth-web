// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createEarthCore, naturalEarthDataset } from '../core/index.js';
import { createEarthServer } from './http.js';
import { OllamaPlanner } from './planner.js';
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
    if (!['--ai', '--headless', '--mutsea'].includes(flag))
      throw new Error(`Unknown option: ${flag}`);
  const core = createEarthCore({ datasets: [await defaultDataset()] });
  const { publicWorlds } = flags.has('--mutsea')
    ? await import('../adapters/mutsea.js')
    : { publicWorlds: [] };
  const server = createEarthServer({
    core,
    planner: flags.has('--ai') ? new OllamaPlanner() : null,
    worlds: publicWorlds,
    webRoot: flags.has('--headless')
      ? null
      : fileURLToPath(new URL('../../dist-earth', import.meta.url)),
  });
  server.listen(18640, '127.0.0.1', () =>
    console.log(
      `Finalverse Earth http://127.0.0.1:18640 | local AI ${flags.has('--ai') ? 'enabled' : 'off'} | MutSea ${flags.has('--mutsea') ? 'optional destinations' : 'off'}`,
    ),
  );
}
