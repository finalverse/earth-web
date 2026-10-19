// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
export class EarthError extends Error {
  readonly name = 'EarthError';
  constructor(
    message: string,
    readonly code: string,
    readonly status: number = 0,
    readonly requestId: string | null = null,
    readonly retryAfterMs: number | null = null,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}
