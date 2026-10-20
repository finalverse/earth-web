// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readlink,
  symlink,
  cp,
  rm,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { VERSION } from '../core/version.js';
import { activateRelease } from './activation.mjs';
import { verifyRelease } from './verify.mjs';
const artifact = resolve(
  process.argv[2] ||
    `artifacts/release/finalverse-earth-runtime-${VERSION}.tgz`,
);
const output = resolve(process.argv[3] || 'artifacts/release/staging.json');
const root = await realpath(await mkdtemp(join(tmpdir(), 'earth-rc-stage-')));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let child, url;
const report = {
  version: VERSION,
  measured_at: new Date().toISOString(),
  artifact_sha256: createHash('sha256')
    .update(await readFile(artifact))
    .digest('hex'),
  isolated_loopback: true,
  public_deployment: false,
  scenarios: {},
};
async function stop() {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([
      once(child, 'exit'),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Owned process failed to stop.')),
          5000,
        );
        timer.unref();
      }),
    ]);
  }
  child = null;
}
async function start(directory, surface = 'energy') {
  child = spawn(
    process.execPath,
    ['earth/release/serve.mjs', '--port', '0', '--surface', surface],
    {
      cwd: directory,
      env: {
        ...process.env,
        EARTH_DATABASE_URL_FILE: '',
        EARTH_PUBLIC_ORIGIN: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Staging startup deadline.')),
      10000,
    );
    timer.unref();
    let buffer = '';
    child.once('error', reject);
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Staging exited before startup.'));
    });
    child.stdout.on('data', (b) => {
      buffer += b;
      for (const line of buffer.split('\n').slice(0, -1)) {
        try {
          const message = JSON.parse(line);
          if (message.event === 'release_ready') {
            clearTimeout(timer);
            resolveUrl(message.url);
          }
        } catch {
          /* Not a readiness message. */
        }
      }
    });
    child.stderr.resume();
  });
}
async function ready() {
  const response = await fetch(url + '/readyz', {
    signal: AbortSignal.timeout(2000),
  });
  assert.equal(response.status, 200);
}
try {
  const names = execFileSync('tar', ['-tzf', artifact], { encoding: 'utf8' })
    .trim()
    .split('\n');
  assert.ok(
    names.every(
      (name) =>
        name.startsWith('package/') &&
        !name.split('/').includes('..') &&
        !name.includes('._') &&
        !name.endsWith('.DS_Store'),
    ),
  );
  const unpack = resolve(root, 'unpack');
  await mkdir(unpack);
  execFileSync('tar', ['-xzf', artifact, '-C', unpack]);
  const candidate = resolve(root, 'releases', 'rc');
  await mkdir(resolve(root, 'releases'));
  await cp(resolve(unpack, 'package'), candidate, { recursive: true });
  report.scenarios.package_verification = await verifyRelease(candidate);
  execFileSync(
    npm,
    ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: candidate, stdio: 'pipe', shell: process.platform === 'win32' },
  );
  await start(candidate);
  await ready();
  const status = await (await fetch(url + '/v1/status')).json();
  assert.equal(status.version, VERSION);
  assert.equal(status.ai_enabled, false);
  assert.equal((await fetch(url + '/')).status, 200);
  assert.equal((await fetch(url + '/earth-app.json')).status, 200);
  assert.equal((await fetch(url + '/v1/openapi.json')).status, 200);
  report.scenarios.fresh_energy_start = 'PASS';
  const consumer = resolve(root, 'consumer');
  await mkdir(consumer);
  await writeFile(
    resolve(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: {
        '@finalverse/earth': pathToFileURL(
          resolve(candidate, `distributions/finalverse-earth-${VERSION}.tgz`),
        ).href,
      },
    }),
  );
  execFileSync(
    npm,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: consumer, stdio: 'pipe', shell: process.platform === 'win32' },
  );
  await cp(
    resolve(candidate, 'earth/release/consumer.mjs'),
    resolve(consumer, 'consumer.mjs'),
  );
  const { stdout, code } = await new Promise((r, reject) => {
    const process = spawn(globalThis.process.execPath, ['consumer.mjs', url], {
      cwd: consumer,
    });
    let stdout = '';
    process.stdout.on('data', (b) => {
      stdout += b;
    });
    process.stderr.resume();
    process.once('error', reject);
    process.once('exit', (code) => r({ stdout, code }));
  });
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout).total, 18);
  report.scenarios.independent_sdk_consumer = 'PASS';
  const denied = await fetch(
    url + '/v1/apps/finalverse.energy-explorer/query',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: 1,
        tool: 'execute_sql',
        arguments: {},
      }),
    },
  );
  assert.equal(denied.status, 403);
  assert.equal(
    (
      await fetch(url + '/v1/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"question":"test"}',
      })
    ).status,
    503,
  );
  report.scenarios.capability_and_disabled_inference = 'PASS';
  await stop();
  await start(candidate, 'globe');
  await ready();
  for (const path of [
    '/',
    '/energy.html',
    '/time.html',
    '/notices/upstream-MIT.txt',
  ])
    assert.equal((await fetch(url + path)).status, 200);
  report.scenarios.fresh_globe_start = 'PASS';
  // Previous is a separately extracted copy of this verified RC, not a claim
  // to have upgraded or restarted the actual public v0.3 service.
  const previous = resolve(root, 'releases', 'previous');
  await cp(candidate, previous, {
    recursive: true,
    filter: (source) => source !== resolve(candidate, 'node_modules'),
  });
  await symlink(
    resolve(candidate, 'node_modules'),
    resolve(previous, 'node_modules'),
    'dir',
  );
  await stop();
  await symlink(previous, resolve(root, 'current'), 'dir');
  await start(previous);
  await activateRelease({ root, id: 'rc', start, stop, ready });
  assert.equal(await readlink(resolve(root, 'current')), candidate);
  report.scenarios.valid_activation = 'PASS';
  await activateRelease({ root, id: 'previous', start, stop, ready });
  assert.equal(await readlink(resolve(root, 'current')), previous);
  let rejectCandidate = true;
  await assert.rejects(
    activateRelease({
      root,
      id: 'rc',
      start,
      stop,
      ready: async () => {
        if (rejectCandidate) {
          rejectCandidate = false;
          throw new Error('Injected readiness failure');
        }
        await ready();
      },
    }),
    /previous release restored/,
  );
  assert.equal(await readlink(resolve(root, 'current')), previous);
  await ready();
  report.scenarios.failed_readiness_rollback = 'PASS';
  const checksum = resolve(candidate, 'earth/core/version.js');
  const bytes = await readFile(checksum);
  await writeFile(checksum, 'corrupt');
  await assert.rejects(
    activateRelease({ root, id: 'rc', start, stop, ready }),
    /checksum mismatch/,
  );
  assert.equal(await readlink(resolve(root, 'current')), previous);
  await writeFile(checksum, bytes);
  report.scenarios.corruption_refused_before_activation = 'PASS';
  report.rollback_scope =
    'Actual extracted Node processes, checksum verification and atomic local activation. Previous uses identical RC bits; production v0.3/systemd and database migrations are not changed or rehearsed.';
  report.passed = true;
} finally {
  await stop();
  await rm(root, { recursive: true, force: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
