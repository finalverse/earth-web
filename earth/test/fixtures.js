// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
export const feature = (id, coordinates) => ({
  type: 'Feature',
  id,
  properties: { name: id },
  geometry: { type: 'Point', coordinates },
});
export const dataset = (id, features, extra = {}) => ({
  id,
  title: id,
  version: '1',
  visibility: 'public',
  features,
  provenance: {
    crs: 'OGC:CRS84',
    license: 'CC0-1.0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'https://example.org/test-fixture',
    content_sha256: '0'.repeat(64),
    quality: 'Synthetic test fixture; not a real observation',
  },
  ...extra,
});
