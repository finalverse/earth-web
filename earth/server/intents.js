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
        'unsupported',
      ],
    },
    query: { type: 'string' },
    place: { type: 'string' },
    radius_km: { type: 'number' },
    renewable_only: { type: 'boolean' },
  },
  required: ['intent', 'query', 'place', 'radius_km', 'renewable_only'],
  additionalProperties: false,
};
export function planIntent(answer, places = []) {
  if (
    !answer ||
    Object.keys(answer).length !== 5 ||
    Object.keys(answer).some(
      (k) => !Object.hasOwn(intentSchema.properties, k),
    ) ||
    !intentSchema.properties.intent.enum.includes(answer.intent) ||
    typeof answer.query !== 'string' ||
    answer.query.length > 128 ||
    typeof answer.place !== 'string' ||
    answer.place.length > 128 ||
    !Number.isFinite(answer.radius_km) ||
    typeof answer.renewable_only !== 'boolean'
  )
    throw new Error('Invalid model intent.');
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
  if (!['energy_within_distance', 'energy_nearest'].includes(answer.intent))
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
  if (answer.intent === 'energy_within_distance') {
    if (answer.radius_km <= 0 || answer.radius_km > 500)
      throw new Error('Choose a radius above 0 and at most 500 kilometres.');
    args.radius_m = answer.radius_km * 1000;
  }
  return {
    schema_version: 1,
    tool: answer.intent === 'energy_nearest' ? 'nearest' : 'within_distance',
    arguments: args,
  };
}
