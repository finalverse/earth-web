// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// Local documents, not authority to run a plan or contact a remote service.
import { instant, interval } from './time.js';
const key = 'finalverse-earth-workspaces-v1';
const maxBytes = 1024 * 1024;
const finite = (v, min, max) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validateWorkspace(input) {
  const raw = JSON.stringify(input);
  if (!raw || new TextEncoder().encode(raw).length > maxBytes)
    throw new Error('Workspace exceeds 1 MiB budget.');
  const w = JSON.parse(raw);
  if (
    w?.schema_version !== 1 ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(w.id) ||
    typeof w.title !== 'string' ||
    !w.title.trim() ||
    w.title.length > 120 ||
    typeof w.notes !== 'string' ||
    w.notes.length > 10000 ||
    !(
      ['countries', 'energy', 'time'].includes(w.application) ||
      (typeof w.application === 'string' &&
        /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(w.application) &&
        w.application.length <= 80)
    )
  )
    throw new Error('Invalid workspace identity.');
  const known = [
    'schema_version',
    'id',
    'title',
    'notes',
    'application',
    'created_at',
    'updated_at',
    'camera',
    'layers',
    'selected_features',
    'temporal_range',
    'plan',
    'receipt',
    'provenance',
    'saved_views',
    'application_state',
  ];
  if (Object.keys(w).some((k) => !known.includes(k)))
    throw new Error('Unknown workspace field.');
  instant(w.created_at);
  instant(w.updated_at);
  const camera = (c) =>
    c &&
    Object.keys(c).sort().join(',') ===
      'heading,height,latitude,longitude,pitch,roll' &&
    finite(c.longitude, -180, 180) &&
    finite(c.latitude, -90, 90) &&
    finite(c.height, 0, 1e9) &&
    finite(c.heading, -Math.PI * 2, Math.PI * 2) &&
    finite(c.pitch, -Math.PI / 2, Math.PI / 2) &&
    finite(c.roll, -Math.PI * 2, Math.PI * 2);
  if (!camera(w.camera)) throw new Error('Invalid saved camera.');
  if (
    !Array.isArray(w.layers) ||
    w.layers.length > 16 ||
    w.layers.some(
      (l) =>
        !l ||
        !/^[-a-z0-9]{1,80}$/.test(l.id) ||
        typeof l.version !== 'string' ||
        l.version.length > 128 ||
        typeof l.visible !== 'boolean',
    )
  )
    throw new Error('Invalid saved layer references.');
  if (
    !Array.isArray(w.selected_features) ||
    w.selected_features.length > 100 ||
    w.selected_features.some((f) => typeof f !== 'string' || f.length > 160)
  )
    throw new Error('Invalid selection.');
  if (w.temporal_range !== null) interval(w.temporal_range);
  if (
    w.plan !== null &&
    (w.plan?.schema_version !== 1 ||
      typeof w.plan.tool !== 'string' ||
      !w.plan.arguments ||
      typeof w.plan.arguments !== 'object' ||
      Array.isArray(w.plan.arguments) ||
      Object.keys(w.plan).some(
        (k) => !['schema_version', 'tool', 'arguments'].includes(k),
      ))
  )
    throw new Error('Invalid saved query.');
  if (
    !Array.isArray(w.provenance) ||
    w.provenance.length > 16 ||
    !Array.isArray(w.saved_views) ||
    w.saved_views.length > 12 ||
    w.saved_views.some(
      (v) =>
        !v ||
        typeof v.title !== 'string' ||
        v.title.length > 120 ||
        !camera(v.camera),
    )
  )
    throw new Error('Invalid workspace evidence or saved views.');
  if (w.application_state !== undefined) {
    if (
      !w.application_state ||
      Array.isArray(w.application_state) ||
      typeof w.application_state !== 'object' ||
      new TextEncoder().encode(JSON.stringify(w.application_state)).length >
        65536
    )
      throw new Error('Invalid application state.');
    const visit = (v, depth = 0) => {
      if (depth > 8)
        throw new Error('Application state nesting budget exceeded.');
      if (v && typeof v === 'object')
        for (const [k, child] of Object.entries(v)) {
          if (
            /token|password|secret|authorization|api[_-]?key|cookie|credential|^__proto__$|^constructor$/i.test(
              k,
            )
          )
            throw new Error('Credentials are not workspace state.');
          visit(child, depth + 1);
        }
    };
    visit(w.application_state);
  }
  return w;
}
export class WorkspaceStore {
  constructor(storage, namespace = key) {
    if (typeof namespace !== 'string' || namespace.length > 200)
      throw new Error('Invalid storage namespace.');
    this.storage = storage;
    this.key = namespace;
  }
  list() {
    const raw = this.storage.getItem(this.key) || '[]';
    if (new TextEncoder().encode(raw).length > 5 * maxBytes)
      throw new Error('Workspace storage budget exceeded.');
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length > 5)
      throw new Error('Invalid local storage.');
    return rows.map(validateWorkspace);
  }
  save(input) {
    const w = validateWorkspace(input),
      rows = this.list().filter((x) => x.id !== w.id);
    if (rows.length >= 5)
      throw new Error('Export/delete a workspace before adding a sixth.');
    rows.push(w);
    this.storage.setItem(this.key, JSON.stringify(rows));
    return w;
  }
  open(id) {
    const w = this.list().find((x) => x.id === id);
    if (!w) throw new Error('Workspace unavailable.');
    return w;
  }
  delete(id) {
    this.storage.setItem(
      this.key,
      JSON.stringify(this.list().filter((w) => w.id !== id)),
    );
  }
  duplicate(id, title) {
    const w = this.open(id),
      now = new Date().toISOString();
    return this.save({
      ...w,
      id: crypto.randomUUID(),
      title,
      created_at: now,
      updated_at: now,
    });
  }
  import(text) {
    if (
      typeof text !== 'string' ||
      new TextEncoder().encode(text).length > maxBytes
    )
      throw new Error('Invalid workspace import size.');
    let w = validateWorkspace(JSON.parse(text));
    if (this.list().some((existing) => existing.id === w.id)) {
      const now = new Date().toISOString();
      w = {
        ...w,
        id: crypto.randomUUID(),
        title: w.title.slice(0, 109) + ' (imported)',
        created_at: now,
        updated_at: now,
      };
    }
    return this.save(w);
  }
  export(id) {
    return JSON.stringify(this.open(id), null, 2);
  }
}
