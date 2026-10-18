// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
export class EarthClient {
  constructor(base = 'http://127.0.0.1:18640') {
    this.base = base.replace(/\/$/, '');
  }
  async request(path, body, { signal } = {}) {
    const response = await fetch(this.base + path, {
      signal,
      ...(body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
}
