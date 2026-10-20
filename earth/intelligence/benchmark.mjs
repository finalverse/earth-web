// Local read-only measurements; never sends inference or executes proposals.
import { readFile } from 'node:fs/promises';
import { homedir, cpus, platform, arch, totalmem } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
const path =
  process.argv[2] ??
  join(homedir(), '.local/share/finalverse-earth/intelligence-dev/config.json');
const config = JSON.parse(await readFile(path, 'utf8'));
if (!/^127\.0\.0\.1:\d+$/.test(config.bind))
  throw new Error('Benchmark requires a literal local development listener.');
const token = (await readFile(config.token_files[0], 'utf8')).trim();
const origin = 'http://' + config.bind;
async function measure(path, count, concurrency) {
  let next = 0;
  const samples = [];
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next++ < count) {
        const t = performance.now();
        const response = await fetch(origin + path, {
          headers: { Authorization: 'Bearer ' + token },
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('Local benchmark request failed.');
        await response.arrayBuffer();
        samples.push(performance.now() - t);
      }
    }),
  );
  samples.sort((a, b) => a - b);
  return {
    requests: count,
    concurrency,
    total_ms: performance.now() - start,
    median_ms: samples[Math.floor(samples.length / 2)],
    observed_p95_ms: samples[Math.ceil(samples.length * 0.95) - 1],
  };
}
console.log(
  JSON.stringify(
    {
      measured_at: new Date().toISOString(),
      scope: 'local read-only development sample; not a production SLA',
      host: {
        platform: platform(),
        architecture: arch(),
        cpu: cpus()[0].model,
        cores: cpus().length,
        memory_bytes: totalmem(),
      },
      health: await measure('/healthz', 10, 1),
      sessions_serial: await measure('/v1/sessions', 10, 1),
      sessions_concurrent: await measure('/v1/sessions', 20, 4),
    },
    null,
    2,
  ),
);
