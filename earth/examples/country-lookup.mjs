// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { EarthClient } from '../sdk.js';
const result = await new EarthClient().query({
  schema_version: 1,
  tool: 'search_features',
  arguments: {
    dataset: 'natural-earth-countries',
    query: process.argv[2] || 'Canada',
    limit: 5,
  },
});
console.log(
  JSON.stringify(
    {
      summary: result.summary,
      features: result.data.features.map((f) => ({
        id: f.id,
        ...f.properties,
      })),
      provenance: result.provenance,
    },
    null,
    2,
  ),
);
