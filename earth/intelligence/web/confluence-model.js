// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// Ephemeral projection of the canonical session event stream, never AI memory.
export function projectPage(state, page) {
  if (
    page?.protocol_version !== '1.0' ||
    !page.session?.id ||
    !Array.isArray(page.events) ||
    page.events.length > 32
  )
    throw new Error('Incompatible session replay.');
  if (state.id && state.id !== page.session.id)
    throw new Error('Session changed; reconnect explicitly.');
  const next = structuredClone(state);
  next.id = page.session.id;
  next.title = page.session.title;
  next.status = page.session.status;
  next.artifacts = page.artifacts;
  for (const event of page.events) {
    if (
      event.session_id !== next.id ||
      event.sequence !== next.cursor + 1 ||
      event.protocol_version !== '1.0'
    )
      throw new Error('Noncontiguous session event; reconnect and replay.');
    next.cursor = event.sequence;
    if (event.type === 'message.started') {
      next.messages.push({
        request: event.request_id,
        role: 'Human',
        text: event.data.user_text,
      });
      next.messages.push({
        request: event.request_id,
        role: event.data.model,
        text: '',
      });
    } else if (event.type === 'message.delta') {
      const answer = next.messages.findLast(
        (m) => m.request === event.request_id && m.role !== 'Human',
      );
      if (answer)
        answer.text = (answer.text + String(event.data.text)).slice(0, 32000);
    } else if (event.type === 'confluence.participant_message') {
      const human = next.messages.find(
        (m) => m.request === event.request_id && m.role === 'Human',
      );
      if (human) human.participant = event.data.agent_id;
    } else if (
      !['session.started', 'message.completed', 'session.completed'].includes(
        event.type,
      )
    ) {
      next.activity.push({
        sequence: event.sequence,
        type: event.type,
        data: event.data,
      });
    }
  }
  if (next.cursor !== page.cursor) throw new Error('Incorrect replay cursor.');
  next.messages = next.messages.slice(-128);
  while (JSON.stringify(next.messages).length > 64000) next.messages.shift();
  next.activity = next.activity.slice(-64);
  return next;
}
export function emptySession() {
  return { id: null, cursor: 0, messages: [], activity: [], artifacts: [] };
}
