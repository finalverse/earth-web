// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { bbox } from '@turf/bbox';
import { temporalMetadata } from './time.js';
export function providerMetadata(d) {
  return {
    schema_version: 1,
    id: d.id,
    version: d.version,
    title: d.title,
    category: d.temporal ? 'time-aware-observations' : 'static-vector',
    crs: d.provenance.crs,
    spatial_extent: d.features.length
      ? bbox({ type: 'FeatureCollection', features: d.features })
      : null,
    temporal: temporalMetadata(d),
    license: d.provenance.license,
    attribution: d.provenance.attribution,
    source: d.provenance.source,
    capabilities: [
      'query',
      'inspect',
      'export',
      ...(d.temporal ? ['temporal-query'] : []),
    ],
    rate_limit: { requests_per_minute: 120 },
    errors: ['unavailable', 'invalid-query', 'budget-exceeded'],
    network: 'bundled; no runtime feed access',
  };
}
