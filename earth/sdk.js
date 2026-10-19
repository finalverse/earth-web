// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
export class EarthClient {
  constructor(base = 'http://127.0.0.1:18640', { token = null } = {}) {
    const u = new URL(base);
    if (
      !['http:', 'https:'].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw new Error(
        'Explicit HTTP(S) Earth URL without credentials required.',
      );
    this.base = base.replace(/\/$/, '');
    this.token = token;
  }
  async request(path, body, { signal } = {}) {
    const response = await fetch(this.base + path, {
      signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      ...(body
        ? {
            method: 'POST',
            body: JSON.stringify(body),
          }
        : {}),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Earth request failed.');
    return value;
  }
  layers(options) {
    return this.request('/v1/layers', null, options);
  }
  query(plan, options) {
    return this.request('/v1/query', plan, options);
  }
  propose(question, options) {
    return this.request('/v1/ai/plan', { question }, options);
  }
  listLayers(options) {
    return this.layers(options);
  }
  registerDataset(dataset, options) {
    return this.request('/v1/datasets', dataset, options);
  }
  executeSpatialPlan(plan, options) {
    return this.query(plan, options);
  }
  spatialQuery(tool, args, options) {
    return this.query({ schema_version: 1, tool, arguments: args }, options);
  }
  queryFeatures(dataset, filters = {}, options) {
    return this.spatialQuery(
      'query_features',
      { ...filters, dataset },
      options,
    );
  }
  inspectFeature(dataset, feature_id, options) {
    return this.spatialQuery(
      'inspect_feature',
      { dataset, feature_id },
      options,
    );
  }
  getProvenance(dataset, options) {
    return this.spatialQuery('get_provenance', { dataset }, options);
  }
}
