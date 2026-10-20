// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { validateManifest, toolCapability } from './manifest.js';
import { VERSION } from '../core/version.js';
export class CapabilityError extends Error {
  constructor(message = 'Application capability denied.') {
    super(message);
    this.status = 403;
    this.code = 'CAPABILITY_DENIED';
  }
}
// Operator-owned installations. Never populated from HTTP manifests or model output.
export function installApplications(core, installations = []) {
  if (!Array.isArray(installations) || installations.length > 16)
    throw new Error('Application installation budget exceeded.');
  const apps = new Map(),
    known = new Set(core.definitions().map((t) => t.name));
  for (const installation of installations) {
    const m = validateManifest(installation.manifest),
      g = validateManifest(installation.grant);
    if (m.id !== g.id || m.version !== g.version || apps.has(m.id))
      throw new Error('Invalid/duplicate application installation.');
    if (m.tools.some((t) => !known.has(t)))
      throw new Error('Unknown application tool.');
    for (const k of ['datasets', 'tools', 'capabilities'])
      if (g[k].some((v) => !m[k].includes(v)))
        throw new Error('Grant exceeds manifest request.');
    if (
      g.budgets.max_features > m.budgets.max_features ||
      g.budgets.max_radius_m > m.budgets.max_radius_m
    )
      throw new Error('Grant exceeds requested budget.');
    const scope = {
      manifest: Object.freeze(m),
      capabilities: () => ({
        api_version: '1',
        platform_version: VERSION,
        application_id: m.id,
        application_version: m.version,
        runtime: m.runtime,
        capabilities: [...g.capabilities],
        tools: g.tools.filter((t) =>
          g.capabilities.includes(toolCapability(t)),
        ),
        datasets: core
          .layers()
          .filter((d) => g.datasets.includes(d.id))
          .map((d) => d.id),
        budgets: { ...g.budgets },
        ai_enabled: false,
        workspace_storage: 'client-local; trusted same-origin only',
      }),
      layers: () => {
        if (!g.capabilities.includes('earth.datasets.read'))
          throw new CapabilityError();
        return core.layers().filter((d) => g.datasets.includes(d.id));
      },
      providers: () => {
        if (!g.capabilities.includes('earth.datasets.read'))
          throw new CapabilityError();
        return core.providers().filter((d) => g.datasets.includes(d.id));
      },
      definitions: () =>
        core
          .definitions()
          .filter(
            (d) =>
              g.tools.includes(d.name) &&
              g.capabilities.includes(toolCapability(d.name)),
          ),
      features(id) {
        scope.assertDataset(id);
        return core.features(id);
      },
      featurePage(id, offset, limit) {
        scope.assertDataset(id);
        return core.featurePage(
          id,
          offset,
          Math.min(limit, g.budgets.max_features),
        );
      },
      assertDataset(id) {
        if (
          !g.capabilities.includes('earth.datasets.read') ||
          !g.datasets.includes(id)
        )
          throw new CapabilityError();
      },
      validate(plan) {
        if (
          !plan ||
          !g.tools.includes(plan.tool) ||
          !g.capabilities.includes(toolCapability(plan.tool))
        )
          throw new CapabilityError();
        const p = structuredClone(plan),
          a = p.arguments;
        if (!a || typeof a !== 'object' || Array.isArray(a))
          throw new Error('Invalid arguments.');
        for (const key of ['dataset', 'left', 'right', 'comparison_dataset'])
          if (a[key] !== undefined) scope.assertDataset(a[key]);
        if (a.place_id !== undefined)
          scope.assertDataset('natural-earth-places');
        if (a.limit !== undefined && a.limit > g.budgets.max_features)
          throw new CapabilityError('Application result budget exceeded.');
        if (
          [a.radius_m, a.cluster_radius_m].some(
            (v) => v !== undefined && v > g.budgets.max_radius_m,
          )
        )
          throw new CapabilityError('Application radius budget exceeded.');
        const definition = core.definitions().find((t) => t.name === p.tool);
        if (definition?.inputSchema.properties.limit)
          a.limit ??= g.budgets.max_features;
        if (['nearest', 'nearest_at_time'].includes(p.tool))
          a.radius_m ??= g.budgets.max_radius_m;
        return core.validate(p);
      },
      async execute(plan, options) {
        const p = scope.validate(plan),
          r = await core.execute(p, options);
        if (p.tool === 'list_layers') r.data.layers = scope.layers();
        return r;
      },
    };
    apps.set(m.id, scope);
  }
  return {
    get(id) {
      const app = apps.get(id);
      if (!app) throw new CapabilityError('Application is not installed.');
      return app;
    },
    list: () => [...apps.values()].map((a) => a.manifest.id),
  };
}
