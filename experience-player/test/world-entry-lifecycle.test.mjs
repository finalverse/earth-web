import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mountWorldEntry } from '../world-entry.js';
const entry = JSON.parse(
  await readFile(new URL('./fixtures/runtime-entry.json', import.meta.url)),
);
const turn = () => new Promise((resolve) => setImmediate(resolve));
const settle = async () => {
  for (let i = 0; i < 8; i++) await turn();
};
function setup({ deferOpen = false, deferGuide = false } = {}) {
  const prior = { document: globalThis.document, fetch: globalThis.fetch };
  const nodes = new Map();
  class Element extends EventTarget {
    value = '';
    checked = false;
    disabled = true;
    hidden = false;
    children = [];
    append(o) {
      this.children.push(o);
      if (!this.value) this.value = o.value;
    }
  }
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  globalThis.document = {
    getElementById: node,
    createElement: () => new Element(),
  };
  const reference = {
    experience: entry.publication.content.experience,
    version: entry.publication.version,
  };
  const objects = entry.publication.content.generated.objects;
  const calls = [];
  let identity = '',
    resolveOpen,
    resolveGuide;
  globalThis.fetch = async (path, options = {}) => {
    const action = path.split('/').at(-1);
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ action, body, headers: options.headers });
    let result = {};
    if (action === 'entry') result = entry;
    if (action === 'open')
      result = deferOpen
        ? await new Promise((resolve) => {
            resolveOpen = resolve;
          })
        : { token: 'world-fixture' };
    if (action === 'snapshot')
      result = {
        definition: reference.version,
        revision: 1,
        participants: [{}],
        objects: objects.map((o) => ({
          object_id: o.id,
          revision: 1,
          translation_mm: o.translation_mm,
        })),
      };
    if (action === 'lumi')
      result = deferGuide
        ? await new Promise((resolve) => {
            resolveGuide = () => resolve(proposal(body.selected));
          })
        : proposal(body.selected);
    if (action === 'move-object')
      result = { receipt: { outcome: { status: 'applied' } } };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  function proposal(id) {
    return {
      response: 'A bounded idea',
      proposal: {
        schema_version: 'finalverse.world-object-proposal/v1',
        reference,
        object_id: id,
        raised: true,
        applied: false,
        expected_revision: 1,
      },
    };
  }
  const applied = [];
  const panel = mountWorldEntry({
    publication: () => entry.publication,
    credential: () => identity,
    applyObjects: (o) => {
      applied.push(o);
      return true;
    },
    diagnostics: () => {},
  });
  return {
    panel,
    node,
    calls,
    applied,
    identity: (v) => {
      identity = v;
    },
    open: () => resolveOpen({ token: 'late-world-fixture' }),
    guide: () => resolveGuide(),
    click: async (id) => {
      node(id).dispatchEvent(new Event('click'));
      await settle();
    },
    restore: async () => {
      await panel.dispose();
      Object.assign(globalThis, prior);
    },
  };
}
test('a shared proposal cannot write before current creator authorization and explicit consent', async () => {
  const h = setup();
  try {
    await h.click('persistent-join');
    await h.click('persistent-guide');
    assert.equal(h.node('persistent-approve').disabled, true);
    assert.equal(
      h.calls.some((c) => c.action === 'move-object'),
      false,
    );
    h.identity('creator-fixture');
    h.node('persistent-consent').checked = true;
    h.node('persistent-consent').dispatchEvent(new Event('change'));
    assert.equal(h.node('persistent-approve').disabled, false);
    await h.click('persistent-approve');
    const move = h.calls.find((c) => c.action === 'move-object');
    assert.equal(move.body.approve, true);
    assert.equal(move.body.expected_revision, 1);
    assert.equal(
      move.headers['X-Finalverse-Creator-Session'],
      'creator-fixture',
    );
    assert.equal(h.node('persistent-consent').checked, false);
    await h.panel.dispose();
    assert.equal(h.panel.snapshot().active, false);
    assert.equal(h.panel.snapshot().interval, false);
    assert.equal(h.applied.at(-1), null);
  } finally {
    await h.restore();
  }
});
test('closing during entry releases a late attachment without restoring shared rendering', async () => {
  const h = setup({ deferOpen: true });
  try {
    await h.click('persistent-join');
    const closing = h.panel.dispose();
    h.open();
    await closing;
    assert.equal(h.panel.snapshot().active, false);
    assert.equal(h.calls.filter((c) => c.action === 'leave').length, 1);
    assert.equal(h.applied.some(Boolean), false);
  } finally {
    await h.restore();
  }
});
test('a proposal finishing after object selection changes cannot restore stale approval', async () => {
  const h = setup({ deferGuide: true });
  try {
    await h.click('persistent-join');
    await h.click('persistent-guide');
    h.node('persistent-object').value = 'different-object';
    h.node('persistent-object').dispatchEvent(new Event('change'));
    h.guide();
    await settle();
    assert.equal(h.panel.snapshot().proposal_pending, false);
    assert.equal(h.node('persistent-approve').disabled, true);
  } finally {
    await h.restore();
  }
});
