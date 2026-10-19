// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { validateManifest } from './generated/manifest-core.js';
import type {
  ApplicationManifest,
  StorageAdapter,
  Capabilities,
} from './types.js';
import type { EarthClient } from './client.js';
import { LocalWorkspaces } from './workspaces.js';
export function validateApplicationManifest(
  value: unknown,
): ApplicationManifest {
  return validateManifest(value) as ApplicationManifest;
}
export function createApplicationRuntime(
  input: unknown,
  {
    client,
    storage,
    onError = () => {},
  }: {
    client: EarthClient;
    storage: StorageAdapter;
    onError?: (e: unknown) => void;
  },
) {
  const manifest = validateApplicationManifest(input);
  let grants: Capabilities | null = null;
  let stopped = false;
  return {
    manifest,
    get state() {
      return stopped ? 'stopped' : grants ? 'ready' : 'created';
    },
    async start() {
      if (stopped) throw new Error('Runtime stopped.');
      try {
        const c = await client.capabilities.get();
        if (
          c.api_version !== '1' ||
          c.application_id !== manifest.id ||
          c.application_version !== manifest.version ||
          c.runtime !== manifest.runtime
        )
          throw new Error('Application installation/version is incompatible.');
        for (const key of ['capabilities', 'tools', 'datasets'] as const)
          if (
            manifest[key].some(
              (v) => !(c[key] as readonly string[]).includes(v),
            )
          )
            throw new Error(
              'Required application permissions are not approved.',
            );
        grants = c;
        return c;
      } catch (e) {
        onError(e);
        throw e;
      }
    },
    workspaces() {
      if (
        !grants ||
        stopped ||
        !['earth.workspace.local.read', 'earth.workspace.local.write'].every(
          (c) =>
            grants!.capabilities.includes(c as 'earth.workspace.local.read'),
        )
      )
        throw new Error('Local workspace grant required.');
      return new LocalWorkspaces(manifest.id, storage);
    },
    stop() {
      stopped = true;
      grants = null;
    },
  };
}
