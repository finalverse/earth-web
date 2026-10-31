import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntry } from '../protocol.mjs';
const version = 'a'.repeat(64),
  base = 'http://127.0.0.1/x/market-alice/' + version;
test('one immutable edition admits standalone and Earth destination contexts', () => {
  for (const mode of ['standalone', 'earth', 'mutsea']) {
    const p = parseEntry(
      base +
        '?destination=' +
        mode +
        '&placement=' +
        mode +
        '-' +
        version.slice(0, 24),
    );
    assert.equal(p.version, version);
    assert.equal(p.id, 'market-alice');
  }
});
test('destination navigation rejects substitution, duplicate keys and malformed pairs', () => {
  for (const q of [
    'destination=earth',
    'placement=earth-' + version.slice(0, 24),
    'destination=script&placement=earth-' + version.slice(0, 24),
    'destination=earth&placement=standalone-' + version.slice(0, 24),
    'destination=earth&destination=earth&placement=earth-' +
      version.slice(0, 24),
    'redirect=https://evil.invalid',
    'destination=earth&placement=../../private',
  ])
    assert.throws(() => parseEntry(base + '?' + q));
});
