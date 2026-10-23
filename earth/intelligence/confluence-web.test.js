// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { emptySession, projectPage } from './web/confluence-model.js';
const id = 'synthetic-session';
const page = (events) => ({
  protocol_version: '1.0',
  session: { id, title: 'Synthetic fixture', status: 'running' },
  events,
  cursor: events.at(-1)?.sequence ?? 0,
  artifacts: [],
});
const event = (sequence, type, data) => ({
  protocol_version: '1.0',
  session_id: id,
  request_id: 'fixture-request',
  sequence,
  type,
  data,
});
test('stream projection preserves sequence, identity and deltas without executing content', () => {
  const original = emptySession();
  const state = projectPage(
    original,
    page([
      event(1, 'message.started', {
        model: 'fixture-model',
        user_text: '<script>untrusted</script>',
      }),
      event(2, 'message.delta', { text: 'fixture response' }),
      event(3, 'confluence.participant_message', {
        agent_id: 'native-fixture-avatar',
      }),
    ]),
  );
  assert.equal(state.messages[1].text, 'fixture response');
  assert.equal(state.messages[0].participant, 'native-fixture-avatar');
  assert.equal(original.cursor, 0);
  assert.throws(
    () =>
      projectPage(
        state,
        page([event(3, 'message.delta', { text: 'duplicate' })]),
      ),
    /Noncontiguous/,
  );
  assert.throws(
    () => projectPage(state, { ...page([]), session: { id: 'different' } }),
    /Session changed/,
  );
  assert.throws(
    () =>
      projectPage(
        emptySession(),
        page([event(2, 'message.delta', { text: 'gap' })]),
      ),
    /Noncontiguous/,
  );
});
test('projection bounds UI history without altering authoritative receipts', () => {
  let state = emptySession();
  let seq = 0;
  for (let i = 0; i < 100; i++) {
    const events = [
      event(++seq, 'message.started', {
        model: 'fixture',
        user_text: 'x'.repeat(4000),
      }),
      event(++seq, 'message.delta', { text: 'y'.repeat(4000) }),
    ];
    state = projectPage(state, page(events));
  }
  assert.ok(state.messages.length <= 128);
  assert.ok(JSON.stringify(state.messages).length <= 64000);
  assert.equal(state.cursor, 200);
});
test('session disconnect clears the opened artifact and disables export', async () => {
  const elements = new Map(),
    handlers = new Map();
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        textContent: '',
        disabled: true,
        replaceChildren() {
          this.textContent = '';
        },
      });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: element },
    window: {
      addEventListener: (name, handler) => handlers.set(name, handler),
    },
  });
  vm.runInContext(
    await readFile(new URL('./web/app.js', import.meta.url), 'utf8'),
    context,
  );
  const receipt = { execution_id: 'synthetic-source' };
  handlers.get('confluence-workspace')({
    detail: {
      schema_version: 1,
      application: 'finalverse.energy-explorer',
      title: 'Synthetic authorized source',
      receipt,
      provenance: {},
      application_state: {
        result: { data: { features: [], total: 0 }, receipt },
      },
    },
  });
  assert.equal(element('title').textContent, 'Synthetic authorized source');
  assert.equal(element('export').disabled, false);
  handlers.get('confluence-disconnected')();
  assert.equal(element('title').textContent, 'No shared workspace open');
  assert.equal(element('export').disabled, true);
  assert.equal(element('evidence').textContent, '');
});
