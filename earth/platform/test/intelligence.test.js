import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datasets, fixture, renewable, manifest } from './fixtures.mjs';
import { createEarthCore } from '../../core/index.js';
import { dataset, feature } from '../../test/fixtures.js';
import { distance } from '../../core/geo.js';
import { PlannerRouter, groundedContext } from '../../server/intelligence.js';
import { installApplications } from '../applications.js';
import { planIntent, groundRefinement } from '../../server/intents.js';
import {
  EarthClient,
  IntelligenceSession,
} from '../../../packages/earth/dist/index.js';
const spec = JSON.parse(
  await readFile(new URL('../../contracts/openapi.json', import.meta.url)),
);
const validator = new Ajv({ strict: false, allErrors: true });
addFormats(validator);
validator.addSchema({
  $id: 'https://earth.test/session-contract',
  components: spec.components,
});
const validateEvent = validator.compile({
  $ref: 'https://earth.test/session-contract#/components/schemas/SessionEvent',
});
const energyManifest = JSON.parse(
  await readFile(
    new URL('../../../apps/energy-explorer/earth-app.json', import.meta.url),
  ),
);
const plan = {
  schema_version: 1,
  tool: 'cluster_features',
  arguments: { ...renewable, cluster_radius_m: 10000 },
};
test('clustering is complete, deterministic and measured over WGS84 source points', async () => {
  const core = createEarthCore({ datasets }),
    a = await core.execute(plan),
    b = await core.execute(plan);
  assert.equal(a.data.total, 24);
  assert.deepEqual(a.data.clusters, b.data.clusters);
  assert.equal(
    a.data.fuel_groups.reduce((s, g) => s + g.count, 0),
    24,
  );
  const ids = a.data.clusters.flatMap((g) => g.feature_ids);
  assert.equal(new Set(ids).size, 24);
  assert.deepEqual([...ids].sort(), a.data.features.map((f) => f.id).sort());
  for (const group of a.data.clusters) {
    const members = a.data.features.filter((f) =>
        group.feature_ids.includes(f.id),
      ),
      reached = new Set([members[0].id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of members)
        if (
          !reached.has(f.id) &&
          members.some(
            (n) =>
              reached.has(n.id) &&
              distance(n.geometry.coordinates, f.geometry.coordinates) <= 10000,
          )
        ) {
          reached.add(f.id);
          changed = true;
        }
    }
    assert.equal(reached.size, members.length);
  }
  await assert.rejects(
    core.execute({ ...plan, arguments: { ...plan.arguments, limit: 2 } }),
    /complete selection/,
  );
  const city = await core.execute({
    schema_version: 1,
    tool: 'search_features',
    arguments: { dataset: 'natural-earth-places', query: 'Montreal' },
  });
  assert.ok(city.data.features.some((f) => f.id === 'ne-place-1173'));
});
test('ellipsoidal clustering crosses the dateline and obeys the edge threshold', async () => {
  const d = dataset('dateline', [
      feature('a', [179.99, 0]),
      feature('b', [-179.99, 0]),
      feature('c', [179, 0]),
    ]),
    core = createEarthCore({ datasets: [d] });
  const result = await core.execute({
    schema_version: 1,
    tool: 'cluster_features',
    arguments: {
      dataset: d.id,
      point: [180, 0],
      radius_m: 200000,
      cluster_radius_m: 3000,
      limit: 100,
    },
  });
  assert.deepEqual(
    result.data.clusters.map((g) => g.feature_ids),
    [['a', 'b'], ['c']],
  );
});
test('application AI grounds context, validates before review, executes only after approval, rejects replay and invalid plans', async (t) => {
  let calls = 0,
    context;
  const { url, core } = await fixture(t, {
    applications: [
      { manifest: energyManifest, grant: structuredClone(energyManifest) },
    ],
    planner: {
      async propose(q, options) {
        context = options.context;
        return q === 'invalid'
          ? { schema_version: 1, tool: 'execute_sql', arguments: {} }
          : plan;
      },
    },
  });
  const original = core.execute;
  core.execute = async (...args) => {
    calls++;
    return original(...args);
  };
  const client = new EarthClient({
      endpoint: url,
      applicationId: energyManifest.id,
    }),
    session = new IntelligenceSession(client);
  const id = await session.propose('Compare hydro and solar', { plan });
  assert.equal(calls, 0);
  assert.equal(context.place, 'Montréal');
  await new EarthClient({ endpoint: url }).ai.propose(
    'legacy question-only request',
  );
  assert.equal(calls, 0, 'Legacy proposals must not pre-execute either.');
  const before = session.replay();
  assert.ok(before.events.some((e) => e.type === 'approval.requested'));
  assert.equal(session.replay().cursor, before.cursor);
  const result = await session.approve(id);
  assert.equal(calls, 1);
  assert.equal(result.data.total, 24);
  assert.throws(() => session.approve(id), /already used/);
  assert.equal(session.replay().events.at(-1).type, 'execution.completed');
  assert.deepEqual(
    session.replay().events.map((e) => e.sequence),
    Array.from({ length: session.replay().cursor }, (_, i) => i + 1),
  );
  assert.ok(
    session
      .replay()
      .events.filter(
        (e) =>
          e.type === 'tool.completed' ||
          e.type === 'tool.requested' ||
          e.type === 'execution.completed',
      )
      .every((e) => e.request_id === result.request_id),
  );
  await assert.rejects(session.propose('invalid'), (e) => e.status === 403);
  assert.equal(calls, 1);
  await assert.rejects(
    client.ai.propose('x', {
      context: {
        selected: { dataset: 'usgs-ridgecrest-2019', feature_id: 'bad' },
      },
    }),
    (e) => e.status === 403,
  );
  session.close();
  for (const e of session.replay().events)
    assert.ok(validateEvent(e), JSON.stringify(validateEvent.errors));
  await assert.rejects(session.run(plan), /closed/);
});
test('session cancellation and bounded replay never rerun tools', async () => {
  const c = new EarthClient({
      endpoint: 'http://localhost',
      fetch: async (u, options) =>
        new Promise((resolve, reject) =>
          options.signal.addEventListener(
            'abort',
            () => reject(options.signal.reason),
            { once: true },
          ),
        ),
    }),
    s = new IntelligenceSession(c);
  const p = s.propose('test');
  s.cancel();
  await assert.rejects(p, (e) => e.code === 'ABORTED');
  assert.equal(s.replay().events.at(-1).type, 'session.failed');
  const data = { ...(await createEarthCore({ datasets }).execute(plan)) };
  const client = new EarthClient({
      endpoint: 'http://localhost',
      fetch: async () => Response.json(data),
    }),
    long = new IntelligenceSession(client);
  for (let i = 0; i < 33; i++) await long.run(plan);
  assert.equal(long.replay().reset_required, true);
  assert.equal(long.replay().events.length, 128);
  const cursor = long.replay().cursor;
  assert.deepEqual(long.replay(cursor).events, []);
  long.close();
});
test('provider router considers availability, local privacy, zero cost and operator preference', async () => {
  const adapter = {
    describe: () => ({
      id: 'local',
      model: 'test',
      local: true,
      capabilities: ['spatial-plan'],
      estimated_latency_ms: 1,
      provider_fee: 0,
    }),
    discover: async () => ({
      ...adapter.describe(),
      available: true,
      models: ['test'],
    }),
    propose: async () => plan,
  };
  const router = new PlannerRouter({
      providers: [adapter],
      preferred: 'local',
    }),
    proposal = await router.proposeWithMetadata('test');
  assert.deepEqual(proposal.plan, plan);
  assert.equal(proposal.routing.privacy, 'local-only');
  await assert.rejects(
    new PlannerRouter({ providers: [adapter], preferred: 'missing' }).propose(
      'test',
    ),
    /unavailable/,
  );
  assert.throws(
    () => new PlannerRouter({ providers: [adapter], privacy: 'cloud' }),
  );
  const scope = installApplications(createEarthCore({ datasets }), [
    { manifest, grant: manifest },
  ]).get(manifest.id);
  assert.throws(
    () => groundedContext(scope, { endpoint: 'http://internal' }),
    /Invalid/,
  );
  const intent = {
    intent: 'energy_clusters',
    query: '',
    place: 'Montréal',
    radius_km: 100,
    renewable_only: false,
    fuels: ['Hydro', 'Solar'],
  };
  const translated = planIntent(
    intent,
    datasets.find((d) => d.id === 'natural-earth-places').features,
  );
  assert.equal(translated.tool, 'cluster_features');
  assert.deepEqual(translated.arguments.fuels, ['Hydro', 'Solar']);
  assert.throws(
    () => planIntent({ ...intent, fuels: ['invented'] }, []),
    /Invalid/,
  );
});
test('local adapter rejects broadened named fuels and unreviewed public inference configuration', async () => {
  const { OllamaPlanner } = await import('../../server/planner.js');
  const { createEarthServer } = await import('../../server/http.js');
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            intent: 'energy_clusters',
            query: '',
            place: 'Montréal',
            radius_km: 100,
            renewable_only: true,
            fuels: [],
            start: '',
            end: '',
          }),
        },
        prompt_eval_count: 10,
        eval_count: 12,
      });
    const planner = new OllamaPlanner({
      places: datasets.find((d) => d.id === 'natural-earth-places').features,
    });
    await assert.rejects(
      planner.propose('Compare hydro and solar within 100 km of Montréal'),
      /explicitly named fuel/,
    );
    assert.throws(
      () =>
        createEarthServer({
          core: createEarthCore({ datasets }),
          publicOrigin: 'https://earth.example',
          planner,
        }),
      /Public AI/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('narrow follow-ups preserve a canonical source place and radius, never fill a new explicit radius', () => {
  const context = { plan, place: 'Montréal' },
    answer = {
      intent: 'energy_within_distance',
      place: '',
      query: '',
      radius_km: 0,
      renewable_only: false,
      fuels: ['Solar'],
    };
  const refined = planIntent(
    groundRefinement(answer, 'Only solar', context),
    datasets.find((d) => d.id === 'natural-earth-places').features,
  );
  assert.equal(refined.tool, 'cluster_features');
  assert.equal(refined.arguments.radius_m, 100000);
  assert.deepEqual(refined.arguments.fuels, ['Solar']);
  assert.equal(
    groundRefinement(answer, 'Solar within 0 km of Toronto', context),
    answer,
  );
  assert.equal(groundRefinement(answer, 'Only solar', null), answer);
});

test('new failed proposals and manual analysis invalidate stale approvals; unscoped clients cannot call scoped AI methods', async () => {
  let fail = false;
  const client = new EarthClient({
      endpoint: 'http://localhost',
      applicationId: energyManifest.id,
      fetch: async (url) => {
        if (fail)
          return Response.json(
            { error: 'Invalid model intent', code: 'INVALID_REQUEST' },
            { status: 400 },
          );
        return Response.json(
          url.endsWith('/ai/plan')
            ? { plan, requires_review: true, provider: 'fixture' }
            : {
                schema_version: 1,
                plan,
                summary: 'Fixture',
                data: { type: 'FeatureCollection', features: [] },
                receipt: {},
                elapsed_ms: 0,
              },
        );
      },
    }),
    s = new IntelligenceSession(client);
  const id = await s.propose('first');
  fail = true;
  await assert.rejects(s.propose('invalid'));
  assert.throws(() => s.approve(id), /missing/);
  fail = false;
  const next = await s.propose('next');
  await s.run(plan);
  assert.throws(() => s.approve(next), /missing/);
  const unscoped = new EarthClient({ endpoint: 'http://localhost' });
  assert.throws(() => unscoped.ai.providers(), /scope/);
  assert.throws(() => unscoped.ai.propose('x', { context: { plan } }), /scope/);
  s.close();
});
