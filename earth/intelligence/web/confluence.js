// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { emptySession, projectPage } from '/confluence-model.js';
const $ = (id) => document.getElementById(id);
let credential = '',
  state = emptySession(),
  generation = 0,
  controllers = new Set(),
  timer = null,
  artifactSignature = '';
function disconnect(reason) {
  generation++;
  credential = '';
  state = emptySession();
  artifactSignature = '';
  clearTimeout(timer);
  for (const controller of controllers) controller.abort();
  controllers.clear();
  $('confluence-key').value = '';
  $('confluence-messages').textContent = '';
  $('confluence-artifacts').replaceChildren();
  $('confluence-status').textContent = reason;
  window.dispatchEvent(new CustomEvent('confluence-disconnected'));
}
async function read(path, revision) {
  const controller = new AbortController();
  controllers.add(controller);
  const deadline = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, {
      headers: { Authorization: 'Bearer ' + credential },
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error('Access unavailable, expired or revoked.');
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024)
      throw new Error('Response budget exceeded.');
    if (revision !== generation) throw new Error('Connection superseded.');
    return JSON.parse(text);
  } finally {
    clearTimeout(deadline);
    controllers.delete(controller);
  }
}
async function poll(revision) {
  if (revision !== generation || !credential) return;
  if (document.hidden && state.id) {
    timer = setTimeout(() => poll(revision), 1000);
    return;
  }
  try {
    const page = await read(
      '/v1/browser/confluence?after=' + state.cursor,
      revision,
    );
    state = projectPage(state, page);
    $('confluence-status').textContent =
      state.title + ' · ' + state.status + ' · read-only · ' + state.cursor;
    const transcript = $('confluence-messages'),
      text = state.messages
        .map(
          (m) =>
            (m.participant ? m.role + ' · ' + m.participant : m.role) +
            '\n' +
            m.text,
        )
        .join('\n\n');
    if (transcript.textContent !== text) {
      const follow =
        transcript.scrollHeight -
          transcript.scrollTop -
          transcript.clientHeight <
        20;
      transcript.textContent = text;
      if (follow) transcript.scrollTop = transcript.scrollHeight;
    }
    const signature = state.artifacts
      .map((a) => a.artifact_id + ':' + a.content_sha256)
      .join('|');
    if (signature !== artifactSignature) {
      artifactSignature = signature;
      $('confluence-artifacts').replaceChildren();
      for (const artifact of state.artifacts) {
        const button = document.createElement('button');
        button.textContent = artifact.title || artifact.kind;
        button.onclick = async () => {
          try {
            const body = await read(
              '/v1/browser/confluence/artifacts/' +
                encodeURIComponent(artifact.artifact_id),
              revision,
            );
            if (revision === generation)
              window.dispatchEvent(
                new CustomEvent('confluence-workspace', { detail: body }),
              );
          } catch (error) {
            if (revision === generation)
              disconnect(
                error.name === 'AbortError'
                  ? 'Connection timed out. Reconnect to replay without retrying any action.'
                  : error.message,
              );
          }
        };
        $('confluence-artifacts').append(button);
      }
    }
    timer = setTimeout(
      () => poll(revision),
      page.cursor < page.session.cursor ? 100 : 1000,
    );
  } catch (error) {
    if (revision === generation)
      disconnect(
        error.name === 'AbortError'
          ? 'Connection timed out. Reconnect to replay without retrying any action.'
          : error.message,
      );
  }
}
$('confluence-connect').onsubmit = (event) => {
  event.preventDefault();
  const key = $('confluence-key').value.trim();
  disconnect('Connecting…');
  if (!/^[a-fA-F0-9]{64}$/.test(key)) {
    disconnect('Paste a valid scoped session key.');
    return;
  }
  credential = key;
  poll(generation);
};
$('confluence-disconnect').onclick = () =>
  disconnect('Disconnected. Revoke server access in Earth CLI if needed.');
window.addEventListener('pagehide', () => disconnect('Disconnected.'));
