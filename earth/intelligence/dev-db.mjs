// Dedicated local development database; no application or production DB reset.
import pg from 'pg';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { connectionFile } from '../db/store.js';
execFileSync(process.execPath, ['earth/db/dev.mjs', 'start'], {
  stdio: 'pipe',
});
const directory = join(
  homedir(),
  '.local/share/finalverse-earth/intelligence-dev',
);
await mkdir(directory, { recursive: true, mode: 0o700 });
if ((await stat(directory)).mode & 0o077)
  throw new Error('Private development directory required.');
const adminURL = new URL(
  await connectionFile(
    join(homedir(), '.local/share/finalverse-earth/postgis-dev/admin-url'),
  ),
);
const control = new pg.Client({ connectionString: adminURL.href });
await control.connect();
let target;
try {
  const testing = process.argv[2] === '--test';
  const database = testing
      ? 'earth_intelligence_test'
      : 'earth_intelligence_dev',
    role = testing
      ? 'earth_intelligence_test_runtime'
      : 'earth_intelligence_runtime';
  const passwordFile = join(
    directory,
    testing ? 'test-runtime-password' : 'runtime-password',
  );
  let password = await readFile(passwordFile, 'utf8').catch(() => null);
  const exists = await control.query(
    'SELECT 1 FROM pg_roles WHERE rolname=$1',
    [role],
  );
  if (exists.rowCount && !password)
    throw new Error(
      'Existing role has no recorded private credential; refusing rotation.',
    );
  if (!password) {
    password = randomBytes(32).toString('hex');
    await writeFile(passwordFile, password, { mode: 0o600, flag: 'wx' });
  }
  if (!exists.rowCount) {
    const query = await control.query(
      "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',$1::text,$2::text)",
      [role, password],
    );
    await control.query(query.rows[0].format);
  }
  const found = await control.query(
    'SELECT 1 FROM pg_database WHERE datname=$1',
    [database],
  );
  if (!found.rowCount) await control.query('CREATE DATABASE ' + database);
  adminURL.pathname = '/' + database;
  target = new pg.Client({ connectionString: adminURL.href });
  await target.connect();
  await target.query('BEGIN');
  await target.query('SELECT pg_advisory_xact_lock(72640806)');
  await target.query(
    await readFile(
      new URL('./migrations/001_sessions.sql', import.meta.url),
      'utf8',
    ),
  );
  await target.query('GRANT USAGE ON SCHEMA earth_intelligence TO ' + role);
  await target.query(
    'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA earth_intelligence TO ' +
      role,
  );
  await target.query('COMMIT');
  adminURL.username = role;
  adminURL.password = password;
  const urlFile = join(directory, testing ? 'test-runtime-url' : 'runtime-url');
  await writeFile(urlFile, adminURL.href, { mode: 0o600 });
  console.log(
    JSON.stringify({
      database,
      credential_file: urlFile,
      reset: false,
      production: false,
    }),
  );
} finally {
  if (target) await target.end();
  await control.end();
}
