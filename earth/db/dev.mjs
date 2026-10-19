// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// Isolated, loopback-only development database. Stop preserves its volume.
import { execFile as exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { poolFor, migrate, PostGISStore, connectionFile } from './store.js';
import { defaultDataset } from '../server/main.js';
import { pointCatalogs } from '../data/catalogs.js';
const execFile = promisify(exec),
  name = 'finalverse-earth-postgis-dev',
  volume = 'finalverse-earth-postgis-v02',
  label = 'com.finalverse.earth';
const images = [
  'postgis/postgis@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6',
  'postgis/postgis@sha256:67af57f41a1e7896e8710a6e9eda88e9a9fd889f954dc042401a55ddc8573009',
];
// Second digest is the OCI manifest produced by Docker Desktop's verified save/load conversion.
let image;
for (const candidate of images) {
  try {
    await execFile('docker', ['image', 'inspect', candidate]);
    image = candidate;
    break;
  } catch {}
}
if (!image)
  throw new Error(
    'Pull the pinned postgis/postgis image first; see docs/earth/database.md.',
  );
const directory = join(homedir(), '.local/share/finalverse-earth/postgis-dev');
async function docker(...args) {
  return (
    await execFile('docker', args, { maxBuffer: 1024 * 1024 })
  ).stdout.trim();
}
async function container() {
  try {
    const c = JSON.parse(await docker('inspect', name))[0];
    if (
      c.Config.Labels?.[label] !== 'dev-v02' ||
      (!images.some((pin) => pin.endsWith(c.Image.slice(7))) &&
        c.Image !==
          'sha256:2ed748fc602dd3031c6724db8cb289e1578c2deb552a4f6e291f6f7e5e6e4f69')
    )
      throw new Error(
        'Existing container is not the pinned Earth development instance.',
      );
    return c;
  } catch (e) {
    if (/no such object/i.test(e.stderr || '')) return null;
    throw e;
  }
}
if (!['start', 'stop'].includes(process.argv[2]))
  throw new Error('Use dev.mjs start|stop. No volumes are removed.');
let c = await container();
if (process.argv[2] === 'stop') {
  if (c) await docker('stop', name);
  console.log('Earth development database stopped; data retained.');
} else {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await stat(directory)).mode & 0o077)
    throw new Error('Earth secret directory must be private.');
  async function secret(file, make) {
    const path = join(directory, file);
    try {
      return (await readFile(path, 'utf8')).trim();
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const value = make();
      await writeFile(path, value + '\n', { mode: 0o600, flag: 'wx' });
      return value;
    }
  }
  const admin = await secret('postgres-password', () =>
    randomBytes(32).toString('hex'),
  );
  const runtime = await secret('runtime-password', () =>
    randomBytes(32).toString('hex'),
  );
  if (!/^[a-f0-9]{64}$/.test(admin) || !/^[a-f0-9]{64}$/.test(runtime))
    throw new Error('Invalid local development secret format.');
  await secret(
    'admin-url',
    () => `postgres://earth_admin:${admin}@127.0.0.1:18643/earth_dev`,
  );
  await secret(
    'runtime-url',
    () => `postgres://earth_runtime:${runtime}@127.0.0.1:18643/earth_dev`,
  );
  if (!c) {
    await docker('image', 'inspect', image);
    await docker('volume', 'create', '--label', `${label}=dev-v02`, volume);
    await docker(
      'run',
      '-d',
      '--name',
      name,
      '--label',
      `${label}=dev-v02`,
      '--pull=never',
      '--platform',
      'linux/amd64',
      '--memory',
      '768m',
      '--cpus',
      '1.5',
      '-p',
      '127.0.0.1:18643:5432',
      '-e',
      'POSTGRES_USER=earth_admin',
      '-e',
      'POSTGRES_DB=earth_dev',
      '-e',
      'POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password',
      '-v',
      `${directory}/postgres-password:/run/secrets/postgres-password:ro`,
      '-v',
      `${volume}:/var/lib/postgresql/data`,
      image,
    );
  } else if (!c.State.Running) await docker('start', name);
  const pool = poolFor(await connectionFile(join(directory, 'admin-url')));
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        await pool.query('SELECT 1');
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!ready)
      throw new Error('Earth development database did not become ready.');
    await migrate(pool);
    const role = await pool.query(
      "SELECT 1 FROM pg_roles WHERE rolname='earth_runtime'",
    );
    if (!role.rowCount)
      await pool.query(
        `CREATE ROLE earth_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${runtime}'`,
      );
    await pool.query('GRANT earth_app TO earth_runtime');
  } finally {
    await pool.end();
  }
  const app = poolFor(await connectionFile(join(directory, 'runtime-url')));
  try {
    await new PostGISStore(app).seed([
      await defaultDataset(),
      ...(await pointCatalogs()),
    ]);
  } finally {
    await app.end();
  }
  console.log(
    `Earth development database ready on 127.0.0.1:18643 (amd64 emulation on Apple Silicon).\nPrivate URL files: ${directory}/admin-url and runtime-url`,
  );
}
