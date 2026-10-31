import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntry } from './protocol.mjs';
const base = 'http://localhost/x/montreal-after-dark/' + 'a'.repeat(64);
test('immutable invitation entry preserves publication identity', () => {
  const p = parseEntry(
    base + '#live=instance-' + '1'.repeat(32) + ':' + '2'.repeat(64),
  );
  assert.deepEqual(p, {
    id: 'montreal-after-dark',
    version: 'a'.repeat(64),
    entity: null,
  });
});
test('invitations reject unknown schemes, injected context and malformed grants', () => {
  for (const fragment of [
    '#live=admin:x',
    '#live=instance-' + '1'.repeat(32) + ':short',
    '#live=instance-' + '1'.repeat(32) + ':' + '2'.repeat(64) + '&admin=true',
    '#script=alert(1)',
  ])
    assert.throws(() => parseEntry(base + fragment));
});
test('invitation grants never replace an immutable publication hash', () => {
  assert.throws(() =>
    parseEntry(
      'http://localhost/x/montreal-after-dark/latest#live=instance-' +
        '1'.repeat(32) +
        ':' +
        '2'.repeat(64),
    ),
  );
});
test('ordinary immutable and spatial moment entry remain compatible', () => {
  assert.equal(parseEntry(base).version, 'a'.repeat(64));
  assert.equal(
    parseEntry(base + '?entity=0091d810-0a82-5d71-a85a-d76bfa906644').entity,
    '0091d810-0a82-5d71-a85a-d76bfa906644',
  );
});
