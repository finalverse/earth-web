// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// Provider-neutral routing. No provider URL, model or credential is accepted from HTTP.
export class PlannerRouter {
  constructor({
    providers,
    preferred = null,
    privacy = 'local-only',
    maxCostPerRequest = 0,
  }) {
    if (
      !Array.isArray(providers) ||
      !providers.length ||
      privacy !== 'local-only' ||
      maxCostPerRequest !== 0
    )
      throw new Error(
        'This preview supports configured local, zero-provider-fee inference only.',
      );
    this.providers = providers;
    this.preferred = preferred;
    this.privacy = privacy;
  }
  async discover({ signal } = {}) {
    const rows = await Promise.all(
      this.providers.map(async (p) => {
        try {
          return await p.discover({ signal });
        } catch {
          return { ...p.describe(), available: false, models: [] };
        }
      }),
    );
    return {
      providers: rows,
      policy: {
        privacy: this.privacy,
        max_provider_cost: 0,
        automatic_cloud_fallback: false,
      },
      streaming: false,
    };
  }
  async proposeWithMetadata(
    question,
    { signal, context = null, requestId } = {},
  ) {
    const discovery = await this.discover({ signal });
    const eligible = discovery.providers.filter(
      (p) =>
        p.available &&
        p.local &&
        p.provider_fee === 0 &&
        Number.isFinite(p.estimated_latency_ms) &&
        p.estimated_latency_ms >= 0 &&
        p.capabilities.includes('spatial-plan') &&
        (!this.preferred || p.id === this.preferred),
    );
    eligible.sort(
      (a, b) =>
        a.estimated_latency_ms - b.estimated_latency_ms ||
        a.id.localeCompare(b.id),
    );
    if (!eligible.length)
      throw new Error(
        'Configured local model unavailable; deterministic tools remain available.',
      );
    const selected = eligible[0],
      provider = this.providers.find((p) => p.describe().id === selected.id),
      started = performance.now();
    const options = { signal, context, requestId };
    const response = provider.proposeDetailed
      ? await provider.proposeDetailed(question, options)
      : { plan: await provider.propose(question, options), usage: null };
    return {
      plan: response.plan,
      provider: selected.id,
      model: selected.model,
      elapsed_ms: performance.now() - started,
      usage: response.usage ?? null,
      streaming: false,
      routing: {
        privacy: this.privacy,
        provider_fee: 0,
        reason: this.preferred
          ? 'operator-preferred available local spatial planner'
          : 'available local spatial planner within zero-provider-fee budget',
      },
    };
  }
  async propose(question, options) {
    return (await this.proposeWithMetadata(question, options)).plan;
  }
}
export function groundedContext(scope, input) {
  if (input === undefined || input === null) return null;
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !['plan', 'selected'].includes(k))
  )
    throw new Error('Invalid planning context.');
  const context = {};
  if (input.plan !== undefined) {
    context.plan = scope.validate(input.plan);
    const id = context.plan.arguments.place_id;
    if (id)
      context.place = scope
        .features('natural-earth-places')
        .data.features.find((f) => f.id === id)?.properties.name;
  }
  if (input.selected !== undefined) {
    const s = input.selected;
    if (
      !s ||
      Object.keys(s).sort().join(',') !== 'dataset,feature_id' ||
      typeof s.feature_id !== 'string' ||
      s.feature_id.length > 160
    )
      throw new Error('Invalid selected feature context.');
    scope.assertDataset(s.dataset);
    const f = scope
      .features(s.dataset)
      .data.features.find((f) => f.id === s.feature_id);
    if (!f) throw new Error('Selected feature unavailable.');
    context.selected = {
      dataset: s.dataset,
      feature_id: f.id,
      name: f.properties.name,
      fuel: f.properties.fuel,
    };
  }
  return context;
}
