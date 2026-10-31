import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { validatePublication } from '../protocol.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const fixture = JSON.parse(
  await readFile(
    new URL('./fixtures/m8-publication.json', import.meta.url),
    'utf8',
  ),
);
test('a generated immutable edition preserves original source pins and independently identified GLBs', async () => {
  await validatePublication({ status: 'published', publication: fixture });
  assert.equal(fixture.content.generated.objects.length, 28);
  assert.equal(
    new Set(fixture.content.generated.objects.map((o) => o.id)).size,
    28,
  );
  assert.equal(
    new Set(fixture.content.generated.objects.map((o) => o.model.sha256)).size,
    7,
  );
  assert.ok(
    fixture.content.generated.objects.every(
      (o) => o.provenance.classification === 'procedurally_generated',
    ),
  );
});
test('published geometry identity or transform tampering cannot retain the original immutable hash', async () => {
  for (const mutate of [
    (p) => p.content.generated.objects[0].translation_mm[0]++,
    (p) =>
      (p.content.generated.objects[0].id =
        '00000000-0000-0000-0000-000000000000'),
  ]) {
    const p = structuredClone(fixture);
    mutate(p);
    await assert.rejects(
      () => validatePublication({ status: 'published', publication: p }),
      /integrity/,
    );
  }
});
