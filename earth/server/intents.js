import { instant } from '../core/time.js';
// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { RENEWABLE_FUELS } from '../core/spatial.js';
const fold = (value) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
export const intentSchema = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: [
        'country_search',
        'energy_within_distance',
        'energy_nearest',
        'discover_datasets',
        'temporal_interval',
        'temporal_compare',
        'energy_reporting_comparison',
        'unsupported',
      ],
    },
    query: { type: 'string' },
    place: { type: 'string' },
    radius_km: { type: 'number' },
    renewable_only: { type: 'boolean' },
    start: { type: 'string' },
    end: { type: 'string' },
  },
  required: [
    'intent',
    'query',
    'place',
    'radius_km',
    'renewable_only',
    'start',
    'end',
  ],
  additionalProperties: false,
};
export function planIntent(answer, places = []) {
  if (
    !answer ||
    Object.keys(answer).length < 5 ||
    Object.keys(answer).length > 7 ||
    Object.keys(answer).some(
      (k) => !Object.hasOwn(intentSchema.properties, k),
    ) ||
    !intentSchema.properties.intent.enum.includes(answer.intent) ||
    typeof answer.query !== 'string' ||
    answer.query.length > 128 ||
    typeof answer.place !== 'string' ||
    answer.place.length > 128 ||
    ['start', 'end'].some(
      (k) =>
        answer[k] !== undefined &&
        (typeof answer[k] !== 'string' || answer[k].length > 24),
    ) ||
    !Number.isFinite(answer.radius_km) ||
    typeof answer.renewable_only !== 'boolean'
  )
    throw new Error('Invalid model intent.');
  if (answer.intent === 'discover_datasets')
    return { schema_version: 1, tool: 'list_layers', arguments: {} };
  if (['temporal_interval', 'temporal_compare'].includes(answer.intent)) {
    if (
      !['ridgecrest', 'usgs', 'usgs-ridgecrest-2019'].includes(
        fold(answer.query),
      )
    )
      throw new Error('Use the approved Ridgecrest archive.');
    instant(answer.start);
    instant(answer.end);
    if (instant(answer.start) >= instant(answer.end))
      throw new Error('Choose an explicit time interval.');
    return {
      schema_version: 1,
      tool:
        answer.intent === 'temporal_compare'
          ? 'compare_snapshots'
          : 'features_during_interval',
      arguments: {
        dataset: 'usgs-ridgecrest-2019',
        ...(answer.intent === 'temporal_compare'
          ? {
              before: answer.start,
              after: answer.end,
              window_start: '2019-07-04T00:00:00.000Z',
            }
          : { start: answer.start, end: answer.end }),
        limit: 100,
      },
    };
  }
  if (answer.intent === 'country_search') {
    if (!answer.query.trim()) throw new Error('Country name required.');
    return {
      schema_version: 1,
      tool: 'search_features',
      arguments: {
        dataset: 'natural-earth-countries',
        query: answer.query.trim(),
        limit: 20,
      },
    };
  }
  if (
    ![
      'energy_within_distance',
      'energy_nearest',
      'energy_reporting_comparison',
    ].includes(answer.intent)
  )
    throw new Error('Ask a supported country or facility-distance question.');
  const matches = places.filter(
    (f) =>
      f.properties.country === 'CAN' &&
      [f.properties.name, ...(f.properties.aliases || [])].some(
        (n) => fold(n) === fold(answer.place),
      ),
  );
  if (matches.length !== 1)
    throw new Error(
      'Use one unambiguous Canadian place from the published catalog.',
    );
  const args = {
    dataset: 'wri-canada-power-plants',
    place_id: matches[0].id,
    limit: 100,
  };
  if (answer.renewable_only) args.fuels = [...RENEWABLE_FUELS];
  if (
    ['energy_within_distance', 'energy_reporting_comparison'].includes(
      answer.intent,
    )
  ) {
    if (answer.radius_km <= 0 || answer.radius_km > 500)
      throw new Error('Choose a radius above 0 and at most 500 kilometres.');
    args.radius_m = answer.radius_km * 1000;
  }
  if (answer.intent === 'energy_reporting_comparison')
    return {
      schema_version: 1,
      tool: 'aggregate_over_time',
      arguments: {
        ...args,
        start: '2013-01-01T00:00:00.000Z',
        end: '2020-01-01T00:00:00.000Z',
        aggregation: 'count',
      },
    };
  return {
    schema_version: 1,
    tool: answer.intent === 'energy_nearest' ? 'nearest' : 'within_distance',
    arguments: args,
  };
}
