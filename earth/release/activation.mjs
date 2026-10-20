// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// Local operator primitive; callbacks control only the operator's owned process.
import {
  mkdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyRelease } from './verify.mjs';
export async function activateRelease({ root, id, start, stop, ready }) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id) ||
    id === '.' ||
    id === '..'
  )
    throw new Error('Invalid release identifier.');
  root = await realpath(root);
  const candidate = resolve(root, 'releases', id);
  if ((await realpath(candidate)) !== candidate)
    throw new Error('Symlinked release refused.');
  await verifyRelease(candidate);
  const lock = resolve(root, 'activation.lock');
  await mkdir(lock); // Refuse concurrent activation; never steal another lock.
  let previous;
  const switchTo = async (target) => {
    const next = resolve(root, 'current.next');
    await symlink(target, next, 'dir');
    await rename(next, resolve(root, 'current'));
  };
  try {
    previous = await readlink(resolve(root, 'current'));
    if (
      !previous.startsWith(resolve(root, 'releases') + '/') ||
      (await realpath(previous)) !== previous
    )
      throw new Error('Expected a verified previous release.');
    await verifyRelease(previous);
    if (candidate === previous) return { changed: false };
    await stop();
    await switchTo(candidate);
    try {
      await start(candidate);
      await ready();
    } catch {
      await stop();
      await switchTo(previous);
      await start(previous);
      await ready();
      throw new Error(
        'Candidate failed readiness; verified previous release restored.',
      );
    }
    await writeFile(resolve(root, 'previous'), previous + '\n');
    return { changed: true, release: id };
  } finally {
    await rm(lock, { recursive: true });
  }
}
