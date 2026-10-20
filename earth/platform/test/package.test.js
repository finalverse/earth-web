import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { fixture, manifest } from './fixtures.mjs';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
test('independent application lock pins the exact freshly built SDK artifact', async () => {
  const pkg = JSON.parse(await readFile('packages/earth/package.json'));
  const lock = JSON.parse(
    await readFile('apps/energy-explorer/package-lock.json'),
  );
  const locked = lock.packages['node_modules/@finalverse/earth'];
  const artifact = `artifacts/finalverse-earth-${pkg.version}.tgz`;
  assert.equal(locked.version, pkg.version);
  assert.equal(locked.resolved, 'file:../../' + artifact);
  assert.equal(
    locked.integrity,
    'sha512-' +
      createHash('sha512')
        .update(await readFile(artifact))
        .digest('base64'),
    'Rebuild the SDK after shared-source edits and refresh the owned package integrity before npm ci.',
  );
});
test('clean SDK tarball installs independently, typechecks strict consumers and queries real data', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'earth-sdk-consumer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifact = resolve('artifacts/finalverse-earth-0.4.0-rc.1.tgz');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      type: 'module',
      private: true,
      dependencies: { '@finalverse/earth': pathToFileURL(artifact).href },
    }),
  );
  execFileSync(
    npm,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: root, stdio: 'pipe', shell: process.platform === 'win32' },
  );
  const pkg = JSON.parse(
    await readFile(join(root, 'node_modules/@finalverse/earth/package.json')),
  );
  assert.equal(pkg.name, '@finalverse/earth');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
  const top = await readdir(join(root, 'node_modules'));
  assert.deepEqual(
    top.filter((x) => !x.startsWith('.')),
    ['@finalverse'],
  );
  const source = `import {EarthClient, type Position, type Workspace} from '@finalverse/earth';
const c=new EarthClient({endpoint:'http://127.0.0.1:18641'});
const p:Position=[-73.5,45.5];
c.spatial.withinRadius({dataset:'wri-canada-power-plants',point:p,radius_m:100000}).then(r=>{const n:number=r.data.features.length;const s:string=r.receipt.plan_sha256;console.log(n,s);});
c.temporal.query('features_at_time',{dataset:'usgs-ridgecrest-2019',at:'2019-07-05T00:00:00Z'});
c.spatial.query('get_provenance',{dataset:'wri-canada-power-plants'}).then(r=>{
 const id:string=r.data.dataset_id;
 // @ts-expect-error provenance results are not feature collections
 r.data.features;
});
c.spatial.query('spatial_join',{left:'a',right:'b',predicate:'contains'}).then(r=>{const ids:string[]=r.data.matches.map(m=>m.left_id);});
// @ts-expect-error no invented kilometre argument
c.spatial.withinRadius({dataset:'wri-canada-power-plants',radius_km:100});
// @ts-expect-error unsupported executable tool
c.query({schema_version:1,tool:'execute_sql',arguments:{sql:'select *'}});
// @ts-expect-error temporal tools require UTC argument field
c.temporal.query('features_at_time',{dataset:'usgs-ridgecrest-2019'});
`;
  await writeFile(join(root, 'consumer.ts'), source);
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2022',
        module: 'NodeNext',
        lib: ['ES2023', 'DOM'],
      },
      include: ['consumer.ts'],
    }),
  );
  execFileSync(
    process.execPath,
    [
      resolve('node_modules/typescript/bin/tsc'),
      '-p',
      join(root, 'tsconfig.json'),
    ],
    { stdio: 'inherit' },
  );
  const { url } = await fixture(t);
  await writeFile(
    join(root, 'run.mjs'),
    `import {EarthClient} from '@finalverse/earth';const c=new EarthClient({endpoint:process.argv[2],applicationId:'${manifest.id}'});const r=await c.places.search('Montréal');if(r.data.features.length!==1)throw new Error('Source place mismatch.');console.log(r.data.features[0].id);`,
  );
  // Do not block this process's HTTP event loop while the clean consumer queries it.
  const { spawn } = await import('node:child_process');
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'run.mjs'), url], {
      cwd: root,
    });
    let text = '';
    child.stdout.on('data', (b) => (text += b));
    child.stderr.on('data', (b) => (text += b));
    child.once('error', reject);
    child.once('exit', (code) =>
      code ? reject(new Error(text)) : resolve(text),
    );
  });
  assert.match(output, /ne-place-1173/);
  const modules = join(root, 'node_modules/@finalverse/earth/dist');
  async function scan(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const f = join(dir, e.name);
      if (e.isDirectory()) await scan(f);
      else if (e.name.endsWith('.js')) {
        const text = await readFile(f, 'utf8');
        assert.ok(!/from ['"](?:react|cesium|node:)|require\(['"]/.test(text));
        assert.ok(!/\b(?:document|window|localStorage)\./.test(text));
      }
    }
  }
  await scan(modules);
});
