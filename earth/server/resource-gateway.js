import { SpatialDbResolver } from '@finalverse/earth-core';
/** Forward only the current caller's credential. Never substitute a service/operator token. */
export function createResourceGateway(endpoint) {
  // Validate operator configuration before accepting requests.
  new SpatialDbResolver({ endpoint });
  return async (address, { signal, authorization } = {}) => {
    if (authorization && !/^Bearer [\x21-\x7e]{1,4096}$/.test(authorization))
      throw Error('Invalid caller authorization.');
    const resolver = new SpatialDbResolver({
      endpoint,
      token: async () => authorization?.slice(7),
    });
    return resolver.resolve(address, signal);
  };
}
