// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// Curated fictional destinations. None has an assigned real-world GeoAnchor.
// No network calls, session tokens, user inventory or private worlds are read.
const regions = [
  'Finalverse Harbor',
  'Confluence',
  'Lake House',
  'Conference Center',
  'Autumn Castle',
];
export const publicWorlds = Object.freeze(
  regions.map((name) =>
    Object.freeze({
      id: name.toLowerCase().replaceAll(' ', '-'),
      title: name,
      kind: 'fictional_world',
      geo_anchor: null,
      availability: 'unverified',
      catalog_verified_at: '2026-10-18',
      entry_url: 'https://mutsea.com/account/',
      client_uri: `secondlife://grid.mutsea.com/secondlife/${encodeURIComponent(name)}/128/128/24`,
      requires_world_account: true,
      source: 'MutSea public operator catalog',
      license:
        'Destination reference only; content rights remain package-specific.',
    }),
  ),
);
