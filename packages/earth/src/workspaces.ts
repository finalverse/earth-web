// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import {
  WorkspaceStore,
  validateWorkspace as validateLegacy,
} from './generated/workspace-core.js';
import type { Workspace, StorageAdapter } from './types.js';
export function validateWorkspace(value: unknown): Workspace {
  return validateLegacy(value) as Workspace;
}
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, canonical(x)]),
    );
  return v;
}
export class LocalWorkspaces {
  private readonly store: WorkspaceStore;
  constructor(
    readonly applicationId: string,
    storage: StorageAdapter,
  ) {
    if (
      !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(applicationId) ||
      applicationId.length > 80
    )
      throw new Error('Explicit application ID required.');
    this.store = new WorkspaceStore(
      storage,
      'finalverse-earth-workspaces-v1:' + applicationId,
    );
  }
  private scoped(value: unknown) {
    const w = validateWorkspace(value);
    if (w.application !== this.applicationId)
      throw new Error(
        'Workspace belongs to another application; use explicit legacy migration.',
      );
    return w;
  }
  list(): Workspace[] {
    return (this.store.list() as Workspace[]).map((w) => this.scoped(w));
  }
  save(w: Workspace): Workspace {
    return this.store.save(this.scoped(w)) as Workspace;
  }
  open(id: string): Workspace {
    return this.scoped(this.store.open(id));
  }
  delete(id: string): void {
    this.open(id);
    this.store.delete(id);
  }
  duplicate(id: string, title: string): Workspace {
    this.open(id);
    return this.store.duplicate(id, title) as Workspace;
  }
  export(id: string): string {
    return JSON.stringify(canonical(this.open(id)), null, 2);
  }
  import(text: string): Workspace {
    if (
      typeof text !== 'string' ||
      new TextEncoder().encode(text).length > 1024 * 1024
    )
      throw new Error('Invalid import size.');
    this.scoped(JSON.parse(text));
    return this.store.import(text) as Workspace;
  }
  importLegacy(text: string, from: 'energy' | 'countries' | 'time'): Workspace {
    if (
      typeof text !== 'string' ||
      new TextEncoder().encode(text).length > 1024 * 1024
    )
      throw new Error('Invalid import size.');
    const w = validateWorkspace(JSON.parse(text));
    if (w.application !== from)
      throw new Error('Explicit legacy application does not match.');
    const now = new Date().toISOString();
    return this.save({
      ...w,
      id: crypto.randomUUID(),
      application: this.applicationId,
      created_at: now,
      updated_at: now,
    });
  }
}
