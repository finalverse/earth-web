// Run inside cua_repl only. CUA performs every browser/native UI action.
// Safari's separate browser storage/process context is Visitor B; no HTTP mocks.
const assert = (v, message) => {
  if (!v) throw Error(message);
};
export async function reviewLiving({ a, safari, url, save }) {
  const steps = [],
    record = (name, evidence = {}) =>
      steps.push({ step: steps.length + 1, name, ...evidence });
  const dom = () =>
    a.playwright.evaluate(() => ({
      living: JSON.parse(document.querySelector('#diagnostics').textContent)
        .living,
      status: document.querySelector('#live-status').textContent,
      response: document.querySelector('#lumi-response').textContent,
      people: document.querySelector('#live-people').textContent,
    }));
  const click = (name) =>
    a.playwright.getByRole('button', { name, exact: true }).click();
  async function until(fn, message) {
    const start = Date.now();
    while (Date.now() - start < 12000) {
      const v = await fn();
      if (v) return v;
    }
    throw Error(message);
  }
  async function nativeButton(name) {
    const t = await safari.getAXState({ emit: false, disableDiffing: true });
    const line = t
      .split('\n')
      .find((l) => l.includes(' button ' + name) && !l.includes('(disabled)'));
    assert(line, 'Safari button missing: ' + name);
    await safari.click(Number(line.trim().match(/^\d+/)[0]));
    await safari.getAXState({ emit: false, disableDiffing: true });
  }
  async function nativeText(text) {
    return until(async () => {
      const s = await safari.getAXState({ emit: false, disableDiffing: true });
      return s.includes(text) ? s : null;
    }, 'Safari state missing: ' + text);
  }
  await a.goto(url);
  await a.playwright
    .getByText(
      'One published experience · standalone here, installed in a persistent MutSea world.',
      { exact: true },
    )
    .waitFor({ state: 'visible', timeoutMs: 30000 });
  record('Open immutable Winter Wonderland');
  await a.playwright
    .getByLabel(
      'Enter the immutable published edition with others. My private edits stay personal.',
      { exact: true },
    )
    .check();
  await click('Enter Montréal Alive ↗');
  await until(async () => (await dom()).living.connected, 'A join failed');
  record('Create live instance');
  const initial = await dom();
  record('Join Visitor A', {
    session_id: initial.living.session_id,
    world_session_id: initial.living.world_session_id,
  });
  const invitation = await a.playwright.evaluate(
    () => document.querySelector('#live-invite').value,
  );
  await safari.pressKey('super+l');
  await safari.paste(invitation);
  await safari.pressKey('Return');
  await safari.pressKey('super+r');
  await safari.getAXState({ emit: false, disableDiffing: true });
  record('Open independent Safari context');
  await nativeText('Join invited experience ↗');
  await nativeButton('Join invited experience ↗');
  record('Join Visitor B');
  await until(
    async () => (await dom()).living.participants.length === 2,
    'Two participants missing',
  );
  await nativeText('2 exploring');
  record('Observe both participants');
  await a.playwright
    .getByText('Explore places & source details', { exact: true })
    .click();
  const source = await a.playwright.evaluate(
    () =>
      Array.from(document.querySelector('#entity').options).find((o) =>
        o.textContent.startsWith('building'),
      ).value,
  );
  await a.playwright
    .getByLabel('Choose a place', { exact: true })
    .selectOption(source);
  await a.getAXState({ emit: false, disableDiffing: true });
  record('Select source-backed building', { source });
  await click('What is this place?');
  await a.getAXState({ emit: false, disableDiffing: true });
  record('Ask Lumi about the building');
  const grounded = await until(async () => {
    const d = await dom();
    return d.response.includes(source) ? d : null;
  }, 'Ungrounded character response');
  record('Verify source-grounded offline response', {
    response: grounded.response,
  });
  await click('Show me around');
  await a.getAXState({ emit: false, disableDiffing: true });
  record('Request guided focus');
  await nativeText('Visitor is exploring');
  record('Visitor B observes permitted selection');
  await click('Make it more magical');
  await a.playwright
    .getByRole('button', {
      name: 'Approve shared festival beacon',
      exact: true,
    })
    .waitFor({ state: 'visible', timeoutMs: 10000 });
  record('Propose approved shared beacon');
  await click('Approve shared festival beacon');
  const changed = await until(async () => {
    const d = await dom();
    return d.living.measurements.find(
      (m) =>
        m.action === 'authoritative_beacon' &&
        m.result.receipt?.outcome.status === 'applied',
    )
      ? d
      : null;
  }, 'No MutSea receipt');
  const action = changed.living.measurements.find(
    (m) =>
      m.action === 'authoritative_beacon' &&
      m.result.receipt?.outcome.status === 'applied',
  );
  assert(
    action.result.authorization.status === 'succeeded',
    'EK authorization missing',
  );
  record('Evaluate EK authorization', {
    request_id: action.result.authorization.request_id,
  });
  record('Verify authoritative MutSea receipt', {
    receipt: action.result.receipt,
  });
  await nativeText(changed.people);
  record('Both clients observe the authoritative beacon', {
    people: changed.people,
  });
  await a.playwright
    .getByText('Connection & permissions', { exact: true })
    .click();
  await click('Revoke my shared action permission');
  await click('Make it more magical');
  await click('Approve shared festival beacon');
  await a.getAXState({ emit: false, disableDiffing: true });
  const denied = await until(async () => {
    const d = await dom();
    return d.living.measurements.find(
      (m) =>
        m.action === 'authoritative_beacon' &&
        m.result.authorization.status === 'rejected',
    )
      ? d
      : null;
  }, 'Revoked action was not refused');
  assert(
    denied.living.measurements.at(-1).result.receipt === null,
    'Denied action reached authority',
  );
  record('Reject unauthorized action');
  let state = await safari.getAXState({ emit: false, disableDiffing: true });
  let line = state
    .split('\n')
    .find((l) => l.includes('summary Connection & permissions'));
  assert(line, 'Missing Safari connection disclosure');
  await safari.click(Number(line.trim().match(/^\d+/)[0]));
  await safari.getAXState({ emit: false, disableDiffing: true });
  await nativeButton('Disconnect');
  await until(
    async () => (await dom()).living.participants.length === 1,
    'Disconnected presence retained',
  );
  record('Disconnect Visitor B');
  await nativeButton('Reconnect');
  await until(
    async () => (await dom()).living.participants.length === 2,
    'Reconnect missing',
  );
  record('Reconnect Visitor B');
  record('Capture WorldLine correlation for durable replay', {
    command_id: action.result.receipt.command_id,
  });
  const beforeEnd = await dom();
  await a.playwright.getByLabel('Still views', { exact: true }).check();
  await click('District');
  await click('Explore ↗');
  await a.getAXState({ emit: false, disableDiffing: true });
  if (save) await save('two-visitors', await a.screenshot({ fullPage: false }));
  await click('End live instance');
  await a.getAXState({ emit: false, disableDiffing: true });
  const ended = await until(async () => {
    const d = await dom();
    return d.status.includes('instance ended') ? d : null;
  }, 'Instance did not end');
  assert(
    !ended.living.connected &&
      !ended.living.timer_active &&
      ended.living.markers === 0,
    'Owned UI resources retained',
  );
  await nativeText('expired or unavailable');
  record('End and verify owned resource cleanup');
  return {
    schema: 'finalverse.m6-browser-acceptance/v1',
    browser_contexts: [
      'IAB Chromium',
      'Safari (separate browser storage/process)',
    ],
    steps,
    beforeEnd,
    afterEnd: ended,
    publication: url,
    credentials_written: false,
  };
}
