// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export async function pointCatalogs() {
  const lock = JSON.parse(
    await readFile(new URL('./catalog.lock.json', import.meta.url)),
  );
  return Promise.all(
    Object.entries(lock.files).map(async ([file, digest]) => {
      if (!['wri-canada.json', 'places.json'].includes(file))
        throw new Error('Unapproved bundled catalog path.');
      const bytes = await readFile(new URL(file, import.meta.url));
      if (createHash('sha256').update(bytes).digest('hex') !== digest)
        throw new Error('Bundled catalog checksum mismatch.');
      return JSON.parse(bytes);
    }),
  );
}
