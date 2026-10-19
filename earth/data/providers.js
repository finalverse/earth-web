// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// LayerProvider v1: explicit reviewed modules, never executable remote plugins.
export async function temporalCatalogs() {
  const lock = JSON.parse(
    await readFile(new URL('./temporal.lock.json', import.meta.url)),
  );
  const file = 'usgs-ridgecrest.json',
    bytes = await readFile(new URL(file, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== lock.files[file])
    throw new Error('Temporal provider checksum mismatch.');
  return [JSON.parse(bytes)];
}
