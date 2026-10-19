// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
const fail = (message, status = 400) =>
  Object.assign(new Error(message), {
    status,
    code: status === 409 ? 'CONFLICT' : 'INVALID_REQUEST',
  });
export function pageRequest(params) {
  for (const k of params.keys())
    if (!['limit', 'cursor'].includes(k))
      throw fail('Unknown pagination argument.');
  if ([...params.keys()].length !== new Set(params.keys()).size)
    throw fail('Duplicate pagination argument.');
  const raw = params.get('limit') ?? '100';
  if (!/^[1-9][0-9]{0,2}$/.test(raw) || Number(raw) > 100)
    throw fail('Page limit must be 1–100.');
  return { limit: Number(raw), cursor: params.get('cursor') };
}
export function catalogPage(core, id, { limit, cursor }) {
  limit = Math.min(limit, core.capabilities?.().budgets.max_features ?? 100);
  if (id && core.assertDataset) core.assertDataset(id);
  const layers = core.layers(),
    key = id ?? 'catalog',
    snapshot = id
      ? layers.find((d) => d.id === id)?.version
      : createHash('sha256')
          .update(JSON.stringify(layers.map((d) => [d.id, d.version])))
          .digest('hex');
  if (!snapshot) throw fail('Dataset unavailable.', 404);
  let offset = 0;
  if (cursor) {
    if (cursor.length > 512 || !/^[a-zA-Z0-9_-]+$/.test(cursor))
      throw fail('Invalid page cursor.');
    let c;
    try {
      c = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    } catch {
      throw fail('Invalid page cursor.');
    }
    if (
      !c ||
      Object.keys(c).sort().join(',') !== 'dataset,offset,snapshot' ||
      c.dataset !== key ||
      !Number.isInteger(c.offset) ||
      c.offset < 0 ||
      c.offset > 50000
    )
      throw fail('Invalid page cursor.');
    if (c.snapshot !== snapshot)
      throw fail('Dataset snapshot changed; restart pagination.', 409);
    offset = c.offset;
  }
  const r = id ? core.featurePage(id, offset, limit) : null,
    items = id ? r.data.features : layers.slice(offset, offset + limit),
    total = id ? r.total : layers.length;
  const next = offset + items.length;
  return {
    items,
    page: {
      limit,
      next_cursor:
        next < total
          ? Buffer.from(
              JSON.stringify({ dataset: key, snapshot, offset: next }),
            ).toString('base64url')
          : null,
      total,
      snapshot,
    },
    ...(r ? { provenance: r.provenance } : {}),
  };
}
