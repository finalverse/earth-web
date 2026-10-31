import test from 'node:test';
import assert from 'node:assert/strict';
import { mountNetwork } from '../network.js';

const turn = () => new Promise((resolve) => setImmediate(resolve));
function setup() {
  const prior = { document: globalThis.document, fetch: globalThis.fetch };
  const nodes = new Map();
  class Node extends EventTarget {
    value = '';
    disabled = true;
    append() {}
  }
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, new Node());
    return nodes.get(id);
  };
  globalThis.document = { getElementById: node };
  const pending = [];
  globalThis.fetch = async (path) => {
    if (path.endsWith('/login'))
      return {
        ok: true,
        json: () => new Promise((resolve) => pending.push(resolve)),
      };
    return {
      ok: true,
      json: async () => ({ owner: 'alice', destinations: [] }),
    };
  };
  let identityChanges = 0;
  const panel = mountNetwork({
    publication: () => ({
      version: 'edition',
      content: { experience: 'market', creator: { attribution: 'fixture' } },
    }),
    identityChanged: async () => {
      identityChanges++;
    },
  });
  return {
    panel,
    node,
    pending,
    changes: () => identityChanges,
    restore: () => {
      panel.dispose();
      Object.assign(globalThis, prior);
    },
  };
}

test('a login finishing after Close cannot restore identity or live controls', async () => {
  const h = setup();
  try {
    assert.equal(h.node('network-login').disabled, false);
    h.node('network-key').value = 'fixture-key';
    h.node('network-login').dispatchEvent(new Event('click'));
    await turn();
    h.panel.dispose();
    h.pending[0]({ creator: 'alice', token: 'fixture-session' });
    await turn();
    assert.equal(h.panel.credential(), '');
    assert.equal(h.panel.snapshot().creator, null);
    assert.equal(h.changes(), 0);
    assert.equal(h.node('network-login').disabled, true);
    assert.equal(h.node('network-key').value, '');
  } finally {
    h.restore();
  }
});

test('out-of-order login responses retain only the latest chosen identity', async () => {
  const h = setup();
  try {
    h.node('network-key').value = 'first-fixture-key';
    h.node('network-login').dispatchEvent(new Event('click'));
    await turn();
    h.node('network-key').value = 'second-fixture-key';
    h.node('network-login').dispatchEvent(new Event('click'));
    await turn();
    h.pending[1]({ creator: 'bob', token: 'bob-fixture-session' });
    await turn();
    h.pending[0]({ creator: 'alice', token: 'alice-fixture-session' });
    await turn();
    assert.equal(h.panel.snapshot().creator, 'bob');
    assert.equal(h.panel.credential(), 'bob-fixture-session');
    assert.equal(h.changes(), 1);
  } finally {
    h.restore();
  }
});
