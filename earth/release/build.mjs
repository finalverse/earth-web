// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// Run after SDK, application and globe builds. npm pack supplies portable tar.
import { execFileSync } from 'node:child_process';
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir,
  lstat,
  rm,
} from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { VERSION } from '../core/version.js';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const output = resolve('artifacts/release');
const stage = resolve(output, 'stage');
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
async function copy(source, destination = source) {
  if (!(await lstat(source)).isFile())
    throw new Error('Only regular source files can be packaged.');
  await mkdir(dirname(resolve(stage, destination)), { recursive: true });
  await copyFile(source, resolve(stage, destination));
}
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
// New release tooling is included before its coherent local commit too.
const releaseFiles = (await readdir('earth/release'))
  .filter((f) => /\.(mjs|md)$/.test(f))
  .map((f) => 'earth/release/' + f);
for (const path of [...new Set([...tracked, ...releaseFiles])].sort()) {
  if (!(
    path.startsWith('earth/') ||
    path.startsWith('src/') ||
    [
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'package.json',
      'apps/energy-explorer/earth-app.json',
    ].includes(path)
  ))
    continue;
  if (
    /\.(?:test\.(?:mjs|js)|log)$/.test(path) ||
    /\/(?:test|test-fixtures)\//.test(path)
  )
    continue;
  if (/(^|\/)\.(?:env|ssh)|AGENTS\.md/.test(path))
    throw new Error('Private file refused.');
  await copy(path);
}
async function tree(source) {
  for (const item of await readdir(source, { withFileTypes: true })) {
    const path = source + '/' + item.name;
    if (item.isDirectory()) await tree(path);
    else await copy(path);
  }
}
await tree('dist-earth');
await tree('apps/energy-explorer/dist');
await copy('earth/release/README.md', 'README.md');
await copy(
  `artifacts/finalverse-earth-${VERSION}.tgz`,
  `distributions/finalverse-earth-${VERSION}.tgz`,
);
await copy(
  `apps/energy-explorer/artifacts/finalverse-energy-explorer-${VERSION}.tgz`,
  `distributions/finalverse-energy-explorer-${VERSION}.tgz`,
);
const pkg = JSON.parse(await readFile('package.json'));
pkg.name = 'finalverse-earth-runtime';
pkg.version = VERSION;
pkg.private = true;
pkg.scripts = { start: 'node earth/release/serve.mjs' };
delete pkg.exports;
const lock = JSON.parse(await readFile('package-lock.json'));
lock.name = pkg.name;
lock.version = VERSION;
lock.packages[''].name = pkg.name;
lock.packages[''].version = VERSION;
await writeFile(
  resolve(stage, 'package.json'),
  JSON.stringify(pkg, null, 2) + '\n',
);
await writeFile(
  resolve(stage, 'npm-shrinkwrap.json'),
  JSON.stringify(lock, null, 2) + '\n',
);
const components = [],
  licenseIndex = [];
for (const [scope, directory] of [
  ['runtime', '.'],
  ['energy', 'apps/energy-explorer'],
]) {
  const source = JSON.parse(
    await readFile(resolve(directory, 'package-lock.json')),
  );
  for (const [path, value] of Object.entries(source.packages)) {
    if (!path) continue;
    const name = path.split('node_modules/').at(-1);
    const ref = scope + ':' + path;
    const component = {
      type: 'library',
      'bom-ref': ref,
      name,
      version: value.version,
      scope: value.dev ? 'optional' : 'required',
      properties: [
        { name: 'earth:lockfile', value: directory + '/package-lock.json' },
      ],
    };
    if (value.license)
      component.licenses = [{ license: { name: value.license } }];
    if (value.integrity?.startsWith('sha512-'))
      component.hashes = [
        {
          alg: 'SHA-512',
          content: Buffer.from(value.integrity.slice(7), 'base64').toString(
            'hex',
          ),
        },
      ];
    components.push(component);
    const installed = resolve(directory, path);
    const files = (await readdir(installed).catch(() => [])).filter((f) =>
      /^(LICENSE|LICENCE|COPYING|NOTICE)([.-]|$)/i.test(f),
    );
    const destinations = [];
    for (const file of files) {
      if (!(await lstat(resolve(installed, file))).isFile()) continue;
      const destination = `licenses/${scope}/${path.replaceAll('node_modules/', 'dependencies/')}/${file}`;
      await copy(resolve(installed, file), destination);
      destinations.push(destination);
    }
    licenseIndex.push({
      component: ref,
      declared_license: value.license ?? null,
      notice_files: destinations,
    });
  }
}
await writeFile(
  resolve(stage, 'SBOM.cdx.json'),
  JSON.stringify(
    {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      metadata: {
        component: { type: 'application', name: pkg.name, version: VERSION },
      },
      components,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  resolve(stage, 'licenses/index.json'),
  JSON.stringify(licenseIndex, null, 2) + '\n',
);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
await writeFile(
  resolve(stage, 'RELEASE.json'),
  JSON.stringify(
    {
      version: VERSION,
      source_commit: commit,
      includes_uncommitted_changes:
        execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
        }).trim().length > 0,
      upstream: JSON.parse(await readFile('earth/globe.lock.json')),
      ai_enabled: false,
    },
    null,
    2,
  ) + '\n',
);
const checksums = [];
async function hashTree(directory, prefix = '') {
  for (const name of (await readdir(directory)).sort()) {
    const path = resolve(directory, name),
      relative = prefix + name;
    if ((await lstat(path)).isDirectory()) await hashTree(path, relative + '/');
    else
      checksums.push(
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex') +
          '  ' +
          relative,
      );
  }
}
await hashTree(stage);
await writeFile(resolve(stage, 'FILES.sha256'), checksums.join('\n') + '\n');
execFileSync(npm, ['pack', '--ignore-scripts', '--pack-destination', output], {
  cwd: stage,
  stdio: 'pipe',
  shell: process.platform === 'win32',
});
const artifacts = [
  [resolve(output, `${pkg.name}-${VERSION}.tgz`), `${pkg.name}-${VERSION}.tgz`],
  [
    resolve(`artifacts/finalverse-earth-${VERSION}.tgz`),
    `finalverse-earth-${VERSION}.tgz`,
  ],
  [
    resolve(
      `apps/energy-explorer/artifacts/finalverse-energy-explorer-${VERSION}.tgz`,
    ),
    `finalverse-energy-explorer-${VERSION}.tgz`,
  ],
];
const report = [];
for (const [source, name] of artifacts) {
  if (source !== resolve(output, name))
    await copyFile(source, resolve(output, name));
  const bytes = await readFile(source);
  report.push({
    name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await writeFile(
  resolve(output, 'SHA256SUMS'),
  report.map((r) => r.sha256 + '  ' + r.name).join('\n') + '\n',
);
await writeFile(
  resolve(output, 'artifacts.json'),
  JSON.stringify({ version: VERSION, artifacts: report }, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    version: VERSION,
    output,
    components: components.length,
    files: checksums.length,
    artifacts: report,
  }),
);
