// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { connectionFile, poolFor, migrate, PostGISStore } from './store.js';
import { defaultDataset } from '../server/main.js';
import { temporalCatalogs } from '../data/providers.js';
import { pointCatalogs } from '../data/catalogs.js';
const [operation] = process.argv.slice(2);
const path =
  process.env[
    operation === 'migrate'
      ? 'EARTH_DATABASE_ADMIN_URL_FILE'
      : 'EARTH_DATABASE_URL_FILE'
  ];
if (!path)
  throw new Error(
    'Set the dedicated Earth database URL file for this operation.',
  );
const pool = poolFor(await connectionFile(path));
try {
  if (operation === 'migrate') await migrate(pool);
  else if (operation === 'seed')
    await new PostGISStore(pool).seed([
      await defaultDataset(),
      ...(await pointCatalogs()),
      ...(await temporalCatalogs()),
    ]);
  else throw new Error('Usage: db/cli.mjs migrate | seed');
  console.log(`Earth database ${operation} complete.`);
} finally {
  await pool.end();
}
