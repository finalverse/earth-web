// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// UTC instants and half-open intervals. No date rollover, local zones or interpolation.
export function instant(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
  )
    throw new Error('Explicit UTC instant required.');
  const ms = Date.parse(value);
  if (
    !Number.isFinite(ms) ||
    new Date(ms).toISOString() !==
      value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z')
  )
    throw new Error('Invalid calendar instant.');
  return ms;
}
export function interval(value) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !== 'end,start' ||
    instant(value.start) >= instant(value.end)
  )
    throw new Error('Nonempty half-open interval required.');
  return [instant(value.start), instant(value.end)];
}
export function validateTemporal(dataset) {
  const t = dataset.temporal;
  if (!t) return;
  if (
    t.schema_version !== 1 ||
    ![
      'historical_observation',
      'live_observation',
      'simulation',
      'hypothesis',
    ].includes(t.kind) ||
    !Array.isArray(t.observations) ||
    t.observations.length > 50000 ||
    !Array.isArray(t.fields) ||
    t.fields.length > 16 ||
    !['event_time', 'observation_time', 'valid_time'].includes(t.time_basis)
  )
    throw new Error('Invalid temporal contract or budget.');
  const features = new Set(dataset.features.map((f) => f.id));
  const fields = new Map();
  for (const f of t.fields) {
    if (
      !/^[-a-z0-9_]{1,80}$/.test(f.id) ||
      fields.has(f.id) ||
      typeof f.units !== 'string' ||
      f.units.length > 80
    )
      throw new Error('Invalid temporal field.');
    fields.set(f.id, f);
  }
  const ids = new Set();
  for (const o of t.observations) {
    if (
      typeof o.id !== 'string' ||
      o.id.length > 200 ||
      !o.id ||
      ids.has(o.id) ||
      !features.has(o.feature_id) ||
      !fields.has(o.field) ||
      !Number.isFinite(o.value) ||
      typeof o.source !== 'string' ||
      !o.source.startsWith('https://')
    )
      throw new Error('Invalid temporal observation.');
    ids.add(o.id);
    interval(o.interval);
    instant(o.ingested_at);
    for (const k of ['event_at', 'observed_at'])
      if (o[k] !== null) instant(o[k]);
    if (o.valid_interval !== null) interval(o.valid_interval);
    const key = t.time_basis === 'event_time' ? 'event_at' : 'observed_at';
    if (
      t.time_basis !== 'valid_time' &&
      (o[key] === null ||
        instant(o[key]) < instant(o.interval.start) ||
        instant(o[key]) >= instant(o.interval.end))
    )
      throw new Error('Time basis must match the source interval.');
    if (
      t.time_basis === 'valid_time' &&
      (!o.valid_interval ||
        JSON.stringify(o.valid_interval) !== JSON.stringify(o.interval))
    )
      throw new Error('Valid time is unavailable.');
  }
  // Multiple versions of a measurement require a separate immutable dataset version.
  const groups = new Map();
  for (const o of t.observations) {
    const k = JSON.stringify([o.feature_id, o.field]);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o.interval);
  }
  for (const rows of groups.values()) {
    rows.sort((a, b) => instant(a.start) - instant(b.start));
    for (let i = 1; i < rows.length; i++)
      if (instant(rows[i].start) < instant(rows[i - 1].end))
        throw new Error('Ambiguous overlapping observations.');
  }
}
export function temporalMetadata(dataset) {
  const t = dataset.temporal;
  if (!t)
    return {
      schema_version: 1,
      kind: 'static_reference',
      observation_count: 0,
      fields: [],
      extent: null,
      explanation: 'No temporal observations supplied.',
    };
  const starts = t.observations.map((o) => instant(o.interval.start)),
    ends = t.observations.map((o) => instant(o.interval.end));
  return {
    schema_version: 1,
    kind: t.kind,
    time_basis: t.time_basis,
    fields: structuredClone(t.fields),
    observation_count: t.observations.length,
    extent: starts.length
      ? {
          start: new Date(Math.min(...starts)).toISOString(),
          end: new Date(Math.max(...ends)).toISOString(),
        }
      : null,
    explanation:
      t.explanation || 'Immutable source observations; no interpolation.',
    license: dataset.provenance.license,
  };
}
