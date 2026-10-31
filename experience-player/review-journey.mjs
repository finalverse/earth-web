// Run in the Codex cua_repl runtime with an owned, loopback-only browser tab.
// All interaction uses the supplied CUA tab API; there is no browser back door,
// inference, credential input, paid service or telemetry in this journey.
export async function runM5Journey({
  origin,
  newTab,
  record = async () => {},
}) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
    throw new Error('Owned loopback origin required');
  const started = Date.now(),
    records = [],
    tabs = [];
  const observe = async (tab, stage) => {
    await tab.getAXState({ emit: false });
    const diagnostics = await tab.playwright.evaluate(() =>
      JSON.parse(document.querySelector('#diagnostics').textContent),
    );
    const row = { stage, elapsed_ms: Date.now() - started, diagnostics };
    records.push(row);
    await record(tab, row);
    return diagnostics;
  };
  const click = async (tab, selector) => {
    await tab.playwright.locator(selector).click();
    await tab.getAXState({ emit: false });
  };
  const share = async (tab) => {
    await click(tab, '#guest-share');
    await tab.playwright.locator('#guest-confirm').check();
    await click(tab, '#guest-share-submit');
    await tab.playwright.locator('#share-panel').waitFor({ state: 'visible' });
    return tab.playwright.locator('#share-link').evaluate((e) => e.value);
  };
  const parent = await newTab(origin);
  tabs.push(parent);
  await parent.playwright
    .locator('[data-template="winter-wonderland"]')
    .waitFor({ state: 'visible' });
  await parent.playwright
    .getByText('139 source identities · verified geometry', { exact: true })
    .waitFor({ state: 'visible' });
  await observe(parent, 'initial_preview');
  await click(parent, '[data-template="winter-wonderland"]');
  await click(parent, '#guest-explore');
  await parent.playwright
    .getByRole('button', { name: '1 · City stop 1', exact: true })
    .click();
  await parent.getAXState({ emit: false });
  await observe(parent, 'source_selected');
  await click(parent, '#make-mine');
  await click(parent, '[data-quick="more_magical"]');
  await click(parent, '#guest-save');
  const firstLink = await share(parent);
  await observe(parent, 'guest_shared');
  const recipient = await newTab(firstLink);
  tabs.push(recipient);
  await recipient.playwright
    .locator('#make-mine')
    .waitFor({ state: 'visible' });
  await recipient.playwright
    .getByRole('button', { name: 'Make Your Own', exact: true })
    .waitFor({ state: 'visible' });
  const fresh = await observe(recipient, 'fresh_recipient');
  if (
    fresh.smart_experience.session_active ||
    fresh.smart_experience.draft_active ||
    fresh.resources.audio_sources !== 0
  )
    throw new Error('Recipient inherited guest authority or audio');
  await click(recipient, '#make-mine');
  await click(recipient, '[data-quick="warmer"]');
  const derivativeLink = await share(recipient);
  await observe(recipient, 'recipient_derivative_shared');
  const elapsed = Date.now() - started;
  for (const [index, tab] of tabs.entries()) {
    await click(tab, '#share-close');
    await click(tab, '#close');
    await tab.playwright
      .getByText(
        'Preview closed · audio, geometry and requests released. Reload to reopen.',
        { exact: true },
      )
      .waitFor({ state: 'visible' });
    await observe(tab, index === 0 ? 'creator_cleanup' : 'recipient_cleanup');
  }
  return {
    schema: 'finalverse.m5-automated-journey/v1',
    duration_ms: elapsed,
    target_ms: 180000,
    within_target: elapsed < 180000,
    model_inference: false,
    credential_entry: false,
    first_link: firstLink,
    derivative_link: derivativeLink,
    records,
    tabs,
  };
}
