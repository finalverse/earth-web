import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hashValue } from '../protocol.mjs';
import {
  validateEdition,
  validateDraft,
  deviceProfile,
  QUICK_ACTIONS,
  TEMPLATE_IDS,
} from '../smart-protocol.mjs';
const edition = JSON.parse(
  await readFile(
    new URL('./fixtures/m5-edition.json', import.meta.url),
    'utf8',
  ),
);
const copy = () => structuredClone(edition);
const at = edition.content.created_at + 1;
async function seal(e) {
  e.version = await hashValue(e.content);
  return e;
}
test('actual M5 guest edition reopens through the existing immutable publication contract', async () => {
  const e = await validateEdition(copy(), at);
  assert.equal(
    e.publication.content.authored.version.proposal_hash,
    await hashValue(e.publication.content.authored.proposal),
  );
  assert.equal(Object.keys(e.publication.content.assets).length, 143);
  assert.equal(e.edition.content.template.id, 'winter-wonderland');
});
test('tampered template and content cannot hide behind an old edition hash', async () => {
  const e = copy();
  e.content.template.composition.visual.snow_milli = 0;
  await assert.rejects(validateEdition(e, at), /integrity/);
});
test('expired temporary links fail closed', async () => {
  await assert.rejects(
    validateEdition(copy(), edition.content.expires_at),
    /expired/,
  );
});
test('guest template extraction and durable policy escalation are rejected', async () => {
  const e = copy();
  e.content.template_extraction_permitted = true;
  await assert.rejects(validateEdition(await seal(e), at), /policy/);
});
test('simulated context cannot masquerade as observed environmental data', async () => {
  const e = copy();
  e.content.environment.simulated.weather_mode = 'observed_terra';
  await assert.rejects(validateEdition(await seal(e), at), /environment/);
});
test('recipient lineage must match the immutable publication parent', async () => {
  const e = copy();
  e.content.lineage.at(-1).version = '0'.repeat(64);
  await assert.rejects(validateEdition(await seal(e), at), /lineage/);
});
test('untrusted camera programs and out-of-budget guide timing are rejected', async () => {
  const e = copy();
  e.content.composition.camera = 'execute_script';
  await assert.rejects(validateEdition(await seal(e), at), /camera/);
});
test('mobile/reduced-motion hints only reduce presentation budgets', () => {
  assert.deepEqual(
    deviceProfile({ width: 390, reducedMotion: true, audio: false }),
    { quality: 'low', reduced_motion: true, webgl: true, audio: false },
  );
  assert.equal(deviceProfile({ width: 1440 }).quality, 'balanced');
  assert.equal(TEMPLATE_IDS.length, 6);
  assert.equal(Object.keys(QUICK_ACTIONS).length, 8);
});
test('draft integrity preserves source spatial bindings', async () => {
  const p = copy().content.publication.publication.content.authored;
  const draft = {
    schema_version: 'finalverse.guest-draft/v1',
    proposal: p.proposal,
    proposal_hash: p.version.proposal_hash,
    candidate: p.version.document,
    template: edition.content.template,
    context: edition.content.environment,
  };
  await validateDraft(draft, draft.candidate.package.manifest.spatial);
  draft.proposal.preview.label = 'Unapproved change';
  await assert.rejects(
    validateDraft(draft, draft.candidate.package.manifest.spatial),
    /integrity/,
  );
});
test('template assets keep their approved provenance even with a resealed envelope', async () => {
  const e = copy();
  Object.values(e.content.template.approved_assets)[0].provenance.attribution =
    'Relicensed without consent';
  await assert.rejects(validateEdition(await seal(e), at), /provenance/);
});
test('declarative templates reject script fields and expanded parameter authority', async () => {
  const e = copy();
  e.content.template.script = 'execute arbitrary code';
  await assert.rejects(validateEdition(await seal(e), at), /template fields/);
  const v = copy();
  v.content.template.parameters.maximum_audio_milli = 1000;
  await assert.rejects(validateEdition(await seal(v), at), /parameter ranges/);
});
test('a real recipient derivative reopens with an inherited approved light and no new placement', async () => {
  const e = JSON.parse(
    await readFile(
      new URL('./fixtures/m5-derivative.json', import.meta.url),
      'utf8',
    ),
  );
  const result = await validateEdition(e, e.content.created_at + 1);
  assert.equal(result.edition.content.lineage.length, 2);
  assert.equal(
    result.publication.content.authored.proposal.modifications.some(
      (m) => m.operation === 'place',
    ),
    false,
  );
});
