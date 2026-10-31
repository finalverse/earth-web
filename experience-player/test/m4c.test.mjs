import test from 'node:test';
import assert from 'node:assert/strict';
import {
  intervals,
  paletteColor,
  PALETTES,
  QUALITY,
} from '../presentation.mjs';
test('frame statistics distinguish median and 95th percentile on known samples', () => {
  const v = intervals([100, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(v.p50_ms, 6);
  assert.equal(v.p95_ms, 10);
  assert.equal(v.samples, 11);
  assert.deepEqual(intervals([]), { samples: 0 });
});
test('material assignment is stable per original identity and restricted to reviewed palettes', () => {
  for (const key of Object.keys(PALETTES)) {
    const id = '0448039a-cd33-5938-a8d1-ff09b01a7b0c';
    const color = paletteColor(key, id);
    assert.equal(paletteColor(key, id), color);
    assert.ok(PALETTES[key].includes(color));
  }
  assert.equal(
    paletteColor('unknown', 'a'),
    paletteColor('heritage_stone', 'a'),
  );
});
test('lower quality reduces pixel, particle and decoration budgets', () => {
  assert.ok(QUALITY.low.scale < QUALITY.balanced.scale);
  assert.ok(QUALITY.balanced.scale <= QUALITY.high.scale);
  assert.ok(QUALITY.low.particles < QUALITY.high.particles);
  assert.ok(QUALITY.low.lamps < QUALITY.high.lamps);
  assert.equal(QUALITY.low.bloom, false);
  assert.equal(QUALITY.low.fps, 30);
  assert.equal(QUALITY.high.fps, 60);
});
