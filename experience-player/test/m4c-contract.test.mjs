import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePublication, hashValue } from '../protocol.mjs';
const fixture = JSON.parse(
  await readFile(
    new URL('./fixtures/m4c-publication.json', import.meta.url),
    'utf8',
  ),
);
const copy = () => structuredClone(fixture);
async function seal(r) {
  const a = r.publication.content.authored,
    v = a.version;
  v.proposal_hash = await hashValue(a.proposal);
  v.version_hash = await hashValue([
    v.schema_version,
    v.parent,
    v.proposal_hash,
    v.creation_provenance,
    v.document,
  ]);
  r.publication.version = await hashValue(r.publication.content);
  return r;
}
test('new visual and ordered-step publication reopens through the existing protocol', async () => {
  const p = await validatePublication(copy());
  assert.equal(p.content.authored.version.document.visual.snow_milli, 260);
  assert.equal(
    p.content.authored.proposal.steps.length,
    p.content.authored.proposal.modifications.length,
  );
  assert.equal(
    Object.keys(p.content.authored.version.document.waypoints).length,
    2,
  );
});
test('changed step inputs cannot hide behind resealed outer hashes', async () => {
  const r = copy();
  r.publication.content.authored.proposal.steps[0].parameters = {
    operation: 'lighting',
    preset: 'daylight',
  };
  await assert.rejects(
    validatePublication(await seal(r)),
    /Creative step integrity/,
  );
});
test('invalid PBR and effect bounds fail closed on a rehashed edition', async () => {
  const r = copy();
  r.publication.content.authored.version.document.visual.metallic_milli = 999;
  await assert.rejects(validatePublication(await seal(r)), /material settings/);
});
test('cyclic or reordered creative dependencies are rejected', async () => {
  const r = copy();
  r.publication.content.authored.proposal.steps[0].dependencies = ['step-02'];
  await assert.rejects(
    validatePublication(await seal(r)),
    /Creative step integrity/,
  );
});
