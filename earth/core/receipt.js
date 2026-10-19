// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export async function executionReceipt(plan) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(canonical(plan))),
  );
  return {
    execution_id: crypto.randomUUID(),
    plan_sha256: [...new Uint8Array(digest)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join(''),
    executed_at: new Date().toISOString(),
    core_version: '0.3.0',
    access: 'read-only',
  };
}
