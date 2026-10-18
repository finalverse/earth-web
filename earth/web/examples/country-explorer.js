// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { EarthClient } from '../../sdk.js';
import './example.css';
const client = new EarthClient(location.origin);
document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = document.getElementById('result');
  out.textContent = 'Querying…';
  try {
    const result = await client.query({
      schema_version: 1,
      tool: 'search_features',
      arguments: {
        dataset: 'natural-earth-countries',
        query: document.getElementById('name').value,
        limit: 5,
      },
    });
    out.textContent = JSON.stringify(
      {
        summary: result.summary,
        names: result.data.features.map((f) => f.properties.name),
        provenance: result.provenance,
      },
      null,
      2,
    );
  } catch (error) {
    out.textContent = error.message;
  }
});
