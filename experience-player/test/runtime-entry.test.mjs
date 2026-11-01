import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateRuntimeEntry } from '../runtime-protocol.mjs';
const fixture = JSON.parse(
  await readFile(
    new URL('./fixtures/runtime-entry.json', import.meta.url),
    'utf8',
  ),
);
const expected = {
  experience: fixture.publication.content.experience,
  version: fixture.publication.version,
};
test('shared Winter Market entry preserves exact edition, model bindings and source digest', async () => {
  const p = await validateRuntimeEntry(fixture, expected);
  assert.deepEqual(p.reference, expected);
  assert.equal(p.object_ids.length, 167);
  assert.equal(
    p.scene_sha256,
    fixture.publication.content.fallback.scene.sha256,
  );
});
test('runtime entry refuses publication, scene and requested-identity substitution', async () => {
  const bad = structuredClone(fixture);
  bad.publication.content.title = 'Forged';
  await assert.rejects(validateRuntimeEntry(bad, expected));
  await assert.rejects(
    validateRuntimeEntry({ ...fixture, scene: fixture.scene + ' ' }, expected),
  );
  await assert.rejects(
    validateRuntimeEntry(fixture, { ...expected, version: '0'.repeat(64) }),
  );
  await assert.rejects(
    validateRuntimeEntry({ ...fixture, execute: 'publish' }, expected),
  );
});
