// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceStore, validateWorkspace } from '../core/workspace.js';
const w = () => ({
  schema_version: 1,
  id: 'sample',
  title: 'Research view',
  notes: 'Local only',
  application: 'time',
  created_at: '2020-01-01T00:00:00.000Z',
  updated_at: '2020-01-01T00:00:00.000Z',
  camera: {
    longitude: 0,
    latitude: 0,
    height: 100000,
    heading: 0,
    pitch: -1,
    roll: 0,
  },
  layers: [{ id: 'example', version: '1', visible: true }],
  selected_features: [],
  temporal_range: null,
  plan: null,
  receipt: null,
  provenance: [],
  saved_views: [],
});
const storage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
test('local workspace create/open/update/duplicate/export/import/delete survives a new store', () => {
  const data = storage(),
    s = new WorkspaceStore(data);
  s.save(w());
  const next = new WorkspaceStore(data);
  assert.equal(next.open('sample').title, 'Research view');
  const copy = next.duplicate('sample', 'Copy');
  assert.notEqual(copy.id, 'sample');
  next.save({ ...next.open(copy.id), notes: 'Changed' });
  assert.equal(next.open('sample').notes, 'Local only');
  const portable = next.export(copy.id);
  next.delete(copy.id);
  assert.equal(next.list().length, 1);
  next.import(portable);
  assert.equal(next.open(copy.id).notes, 'Changed');
});
test('workspace imports cannot execute code, select URLs or bypass budgets/schema', () => {
  for (const change of [
    (x) => (x.schema_version = 99),
    (x) => (x.camera.longitude = Infinity),
    (x) => (x.layers[0].id = 'https://evil.example'),
    (x) => (x.plan = { tool: 'fetch', arguments: {} }),
    (x) => (x.created_at = 'yesterday'),
    (x) => (x.notes = 'x'.repeat(10001)),
    (x) => (x.extra = 'unrecognized'),
  ]) {
    const x = w();
    change(x);
    assert.throws(() => validateWorkspace(x));
  }
  const s = new WorkspaceStore(storage());
  assert.throws(() => s.import('x'.repeat(1024 * 1024 + 1)));
  for (let i = 0; i < 5; i++) s.save({ ...w(), id: 'w' + i });
  assert.throws(() => s.save({ ...w(), id: 'sixth' }));
});
test('storage quota and corrupt local documents report failures without rewriting existing data', () => {
  const s = new WorkspaceStore({
    getItem: () => '[]',
    setItem: () => {
      throw new Error('QuotaExceeded');
    },
  });
  assert.throws(() => s.save(w()), /Quota/);
  assert.throws(() => new WorkspaceStore({ getItem: () => '{}' }).list());
});
