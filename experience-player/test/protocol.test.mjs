import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canonical,
  hashValue,
  validatePublication,
  parseEntry,
  verifyAsset,
  LocalMetrics,
  readBounded,
  MAX_ASSET,
} from '../protocol.mjs';
const source = JSON.parse(
  await readFile(
    new URL('./fixtures/publication.json', import.meta.url),
    'utf8',
  ),
);
const entry = {
  id: source.publication.content.experience,
  version: source.publication.version,
};
function copy() {
  return structuredClone(source);
}
async function reseal(r) {
  r.publication.version = await hashValue(r.publication.content);
  return r;
}
test('canonical serialization and accepted EL publication integrity', async () => {
  assert.equal(canonical({ z: 3, a: 1 }), '{"a":1,"z":3}');
  assert.equal(
    (await validatePublication(copy(), entry)).version,
    entry.version,
  );
  assert.throws(() => canonical({ x: 1.5 }));
});
test('unsupported schemas, unknown fields and modified metadata fail closed', async () => {
  const r = copy();
  r.publication.schema_version = 'future/v2';
  await assert.rejects(validatePublication(r));
  const changed = copy();
  changed.publication.content.description = 'Tampered';
  await assert.rejects(validatePublication(changed));
  const extra = copy();
  extra.publication.script = 'arbitrary code';
  await assert.rejects(validatePublication(extra));
});
test('private and unavailable publications cannot become previews', async () => {
  const privateRecord = copy();
  privateRecord.publication.content.visibility = 'private';
  await assert.rejects(validatePublication(await reseal(privateRecord)));
  const gone = copy();
  gone.status = 'unavailable';
  await assert.rejects(validatePublication(gone));
});
test('share links require immutable identity, version and bounded entity context', () => {
  const url = 'http://localhost:1234/x/' + entry.id + '/' + entry.version;
  assert.equal(parseEntry(url).version, entry.version);
  assert.throws(() => parseEntry(url + '?token=private'));
  assert.throws(() => parseEntry(url.replace(entry.version, 'latest')));
  assert.throws(() => parseEntry(url + '?entity=bad'));
  assert.throws(() => parseEntry(url + '#private-session'));
  assert.throws(() =>
    parseEntry(
      url +
        '?entity=0091d810-0a82-5d71-a85a-d76bfa906644&entity=0091d810-0a82-5d71-a85a-d76bfa906644',
    ),
  );
});
test('link resolution refuses another publication version', async () => {
  await assert.rejects(
    validatePublication(copy(), { ...entry, version: '0'.repeat(64) }),
  );
});
test('unknown fallback and asset types are refused', async () => {
  let r = copy();
  r.publication.content.fallback.renderer = 'execute-plugin';
  await assert.rejects(validatePublication(await reseal(r)));
  r = copy();
  Object.values(r.publication.content.assets)[0].media_type =
    'application/javascript';
  await assert.rejects(validatePublication(await reseal(r)));
});
test('unlicensed or oversized assets are rejected before loading', async () => {
  let r = copy();
  Object.values(r.publication.content.assets)[0].provenance[0].license =
    'Unlicensed';
  await assert.rejects(validatePublication(await reseal(r)));
  r = copy();
  Object.values(r.publication.content.assets)[0].byte_length = MAX_ASSET + 1;
  await assert.rejects(validatePublication(await reseal(r)));
});
test('asset bytes, digest and server media type must agree', async () => {
  const b = new TextEncoder().encode('{"approved":"data"}');
  const a = {
    sha256: await hashValue({ approved: 'data' }),
    byte_length: b.length,
    media_type: 'application/vnd.finalverse.web-scene+json',
  };
  await verifyAsset(a, b, a.media_type);
  await assert.rejects(verifyAsset(a, b, 'audio/wav'));
  const bad = b.slice();
  bad[0] ^= 1;
  await assert.rejects(verifyAsset(a, bad, a.media_type));
});
test('bounded streaming aborts oversized content and rejects unavailable assets', async () => {
  await assert.rejects(readBounded(new Response('x'.repeat(100)), 10));
  await assert.rejects(
    readBounded(new Response('private', { status: 404 }), 1024),
  );
  assert.equal((await readBounded(new Response('approved'), 20)).length, 8);
});
test('privacy-conscious counters do not invent return visits or aggregate traction', () => {
  let time = 100;
  const m = new LocalMetrics(() => time);
  time = 143;
  m.meaningful();
  m.event('share_action');
  assert.equal(m.snapshot().first_meaningful_interaction_ms, 43);
  assert.equal(m.snapshot().counts.share_action, 1);
  assert.equal(m.snapshot().counts.return_visit, 0);
  assert.equal(m.snapshot().return_visit_measured, false);
  assert.throws(() => m.event('user_identity'));
});
