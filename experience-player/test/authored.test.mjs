import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePublication, hashValue } from '../protocol.mjs';
const fixture = JSON.parse(
  await readFile(
    new URL('./fixtures/winter-publication.json', import.meta.url),
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
test('real published winter contract opens with approved proposal and authored version intact', async () => {
  const p = await validatePublication(copy());
  assert.equal(p.content.authored.version.document.atmosphere, 'snow');
  assert.equal(Object.keys(p.content.assets).length, 143);
  assert.equal(
    p.content.parent.version,
    '16f19110720a52c4a0a02567c2f070286b88e022de90a3ad66470287eb63ebea',
  );
});
test('tampered nested proposal cannot hide behind a resealed publication', async () => {
  const r = copy();
  r.publication.content.authored.proposal.modifications[0].preset = 'daylight';
  r.publication.version = await hashValue(r.publication.content);
  await assert.rejects(validatePublication(r), /proposal or version changed/);
});
test('unknown environmental effects and unapproved visual references fail closed', async () => {
  for (const change of [
    (r) =>
      (r.publication.content.authored.version.document.atmosphere =
        'remote_script'),
    (r) =>
      (Object.values(
        r.publication.content.authored.version.document.objects,
      )[0].asset = 'untrusted:mesh'),
  ]) {
    const r = copy();
    change(r);
    await assert.rejects(validatePublication(await seal(r)));
  }
});
test('a rehashed authored package must still match the delivered package', async () => {
  const r = copy();
  r.publication.content.authored.version.document.package.manifest.experience.presentation.title =
    'Changed';
  await assert.rejects(validatePublication(await seal(r)));
});
