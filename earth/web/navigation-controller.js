import {
  parseDestination,
  planNavigation,
  validateResource,
  NavigationHistory,
  serializeDestination,
} from '@finalverse/earth-core';
export const WEB_CAPABILITIES = Object.freeze({
  schema_version: 'earth.client-capabilities/v1',
  representation_types: [],
  publication_kinds: [],
  world_authorities: [],
});
/** A renderer adapter: no custom globe, publication loader or world admission implementation. */
export function createNavigationController({ resolve, render }) {
  const history = new NavigationHistory();
  let active;
  async function navigate(input, { record = true } = {}) {
    active?.abort();
    const controller = new AbortController();
    active = controller;
    const destination =
      typeof input === 'string' ? parseDestination(input) : input;
    const resource =
      destination.kind === 'entity'
        ? await resolve(destination.address, controller.signal)
        : undefined;
    const result = planNavigation(destination, resource, WEB_CAPABILITIES);
    controller.signal.throwIfAborted();
    await render(result, controller.signal);
    controller.signal.throwIfAborted();
    if (record) history.push(result.destination);
    return result;
  }
  return {
    navigate,
    async back() {
      const d = history.back();
      return d ? navigate(d, { record: false }) : undefined;
    },
    cancel() {
      active?.abort();
    },
    serialize() {
      return history.serialize();
    },
    restore(text) {
      history.restore(text);
    },
  };
}
export async function resolveWebResource(
  address,
  signal,
  { fetch: request = fetch } = {},
) {
  const destination = parseDestination(address);
  if (destination.kind !== 'entity')
    throw Error('An entity address is required.');
  const id = address.slice(address.lastIndexOf('/') + 1);
  // The server maps authorities; users cannot supply arbitrary asset/service URLs.
  if (!address.startsWith('usap://spatialdb/'))
    throw Error('This entity authority is not configured.');
  const response = await request(`/v1/earth-core/entities/${id}`, {
    signal,
    redirect: 'error',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Error(
      response.status === 503
        ? 'Place details are not connected yet. Geographic navigation is available.'
        : 'This place is unavailable for your session.',
    );
  }
  if (!response.headers.get('content-type')?.startsWith('application/json')) {
    await response.body?.cancel();
    throw Error('Invalid place response.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('Empty place response.');
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1048576) throw Error('Place response exceeds its budget.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return validateResource(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    address,
  );
}
export function destinationLabel(result) {
  return (
    result.resource?.label ??
    `Place at ${result.anchor.latitude_degrees.toFixed(5)}, ${result.anchor.longitude_degrees.toFixed(5)}`
  );
}
export { serializeDestination };
