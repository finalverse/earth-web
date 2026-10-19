// Optional real local-model acceptance. No production host, cloud or paid API.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import {
  EarthClient,
  IntelligenceSession,
} from '../../packages/earth/dist/index.js';
const endpoint = process.argv[2] ?? 'http://127.0.0.1:18644';
const u = new URL(endpoint);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))
  throw new Error('Local acceptance endpoint required.');
const client = new EarthClient({
    endpoint,
    applicationId: 'finalverse.energy-explorer',
    timeoutMs: 60000,
  }),
  session = new IntelligenceSession(client);
const runs = [];
let previous;
for (const [question, count, fuels] of [
  [
    'Compare hydro and solar facilities within 100 km of Montréal and identify clusters.',
    18,
    ['Hydro', 'Solar'],
  ],
  ['Only solar', 5, ['Solar']],
]) {
  const start = performance.now(),
    id = await session.propose(
      question,
      previous ? { plan: previous.plan } : undefined,
    ),
    event = session.replay().events.findLast((e) => e.type === 'plan.proposed'),
    proposal = event.payload.proposal;
  assert.equal(proposal.requires_review, true);
  assert.deepEqual(
    [...proposal.plan.arguments.fuels].sort(),
    [...fuels].sort(),
  );
  assert.equal(proposal.plan.arguments.place_id, 'ne-place-1173');
  assert.equal(proposal.plan.arguments.radius_m, 100000);
  const result = await session.approve(id);
  assert.equal(result.data.total, count);
  previous = result;
  runs.push({
    question,
    provider: proposal.provider,
    model: proposal.model,
    planning_ms: proposal.elapsed_ms,
    usage: proposal.usage,
    result_count: result.data.total,
    clusters: result.data.clusters?.length ?? null,
    engine_ms: result.elapsed_ms,
    roundtrip_ms: performance.now() - start,
    receipt: result.receipt,
  });
}
session.close();
const report = {
  measured_at: new Date().toISOString(),
  local_model_only: true,
  public_deployment: false,
  runs,
  event_types: [...new Set(session.replay().events.map((e) => e.type))],
};
await writeFile(
  'docs/earth/platform/local-ai-v04b.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
