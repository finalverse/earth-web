// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { EarthClient } from '../sdk.js';
const earth = new EarthClient(),
  result = await earth.spatialQuery('within_distance', {
    dataset: 'wri-canada-power-plants',
    place_id: 'ne-place-1173',
    radius_m: 100000,
    fuels: [
      'Biomass',
      'Geothermal',
      'Hydro',
      'Solar',
      'Wave and Tidal',
      'Wind',
    ],
    limit: 100,
  });
console.log(
  JSON.stringify(
    {
      total: result.data.total,
      facilities: result.data.features.map((f) => ({
        id: f.id,
        ...f.properties,
        distance_m: result.data.measurements.find((m) => m.feature_id === f.id)
          .distance_m,
      })),
      provenance: result.provenance,
      receipt: result.receipt,
    },
    null,
    2,
  ),
);
