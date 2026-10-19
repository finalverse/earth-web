// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { EarthClient } from './client.js';
import { EarthError } from './errors.js';
import type {
  PlanningContext,
  PlanProposal,
  QueryPlan,
  QueryResult,
  RequestOptions,
} from './types.js';
export interface SessionPayloads {
  'session.started': { protocol_version: 1 };
  'message.delta': {
    role: 'user' | 'system';
    text: string;
    authoritative: false;
  };
  'tool.requested': { plan: QueryPlan };
  'tool.completed': { result: QueryResult };
  'artifact.created': {
    artifact_id: string;
    kind: 'spatial-result';
    result: QueryResult;
  };
  'plan.proposed': { proposal_id: string; proposal: PlanProposal };
  'approval.requested': { proposal_id: string };
  'execution.completed': {
    artifact_id: string;
    receipt: QueryResult['receipt'];
  };
  'session.completed': { reason: 'closed' | 'cancelled' };
  'session.failed': { code: string; request_id: string; message: string };
}
export type SessionEvent = {
  [K in keyof SessionPayloads]: {
    protocol_version: 1;
    session_id: string;
    event_id: string;
    sequence: number;
    at: string;
    request_id: string;
    type: K;
    payload: SessionPayloads[K];
  };
}[keyof SessionPayloads];
// Local event log only. Replaying events never invokes a tool or grants approval.
export class IntelligenceSession {
  readonly id = crypto.randomUUID();
  private sequence = 0;
  private events: SessionEvent[] = [];
  private eventSizes: number[] = [];
  private retainedBytes = 0;
  private pending = new Map<string, PlanProposal>();
  private active: AbortController | null = null;
  private closed = false;
  constructor(
    private client: EarthClient,
    private onEvent?: (event: SessionEvent) => void,
  ) {
    this.emit('session.started', { protocol_version: 1 }, crypto.randomUUID());
  }
  private emit<K extends keyof SessionPayloads>(
    type: K,
    payload: SessionPayloads[K],
    requestId: string,
  ) {
    const event = {
      protocol_version: 1,
      session_id: this.id,
      event_id: crypto.randomUUID(),
      sequence: ++this.sequence,
      at: new Date().toISOString(),
      request_id: requestId,
      type,
      payload: structuredClone(payload),
    } as SessionEvent;
    this.events.push(event);
    const size = new TextEncoder().encode(JSON.stringify(event)).length;
    this.eventSizes.push(size);
    this.retainedBytes += size;
    while (
      this.events.length > 1 &&
      (this.events.length > 128 || this.retainedBytes > 4 * 1024 * 1024)
    ) {
      this.events.shift();
      this.retainedBytes -= this.eventSizes.shift()!;
    }
    try {
      this.onEvent?.(structuredClone(event));
    } catch {
      /* UI listeners cannot change execution outcome. */
    }
  }
  replay(afterSequence = 0) {
    if (
      !Number.isInteger(afterSequence) ||
      afterSequence < 0 ||
      afterSequence > this.sequence
    )
      throw new EarthError('Invalid session cursor.', 'INVALID_REQUEST');
    const first = this.events[0]?.sequence ?? this.sequence;
    return {
      session_id: this.id,
      cursor: this.sequence,
      reset_required: afterSequence < first - 1,
      events: structuredClone(
        this.events.filter((e) => e.sequence > afterSequence),
      ),
    };
  }
  private async operation<T>(
    run: (options: RequestOptions) => Promise<T>,
  ): Promise<T> {
    if (this.closed || this.active)
      throw new EarthError('Session is closed or busy.', 'SESSION_STATE');
    const requestId = crypto.randomUUID(),
      controller = new AbortController();
    this.active = controller;
    try {
      const result = await run({
        signal: controller.signal,
        requestId,
        timeoutMs: 60000,
      });
      if (controller.signal.aborted)
        throw new EarthError('Session cancelled.', 'ABORTED');
      return result;
    } catch (error) {
      this.emit(
        'session.failed',
        {
          code: error instanceof EarthError ? error.code : 'SESSION_ERROR',
          message:
            error instanceof Error ? error.message : 'Session request failed.',
          request_id: requestId,
        },
        requestId,
      );
      throw error;
    } finally {
      this.active = null;
    }
  }
  async propose(question: string, context?: PlanningContext): Promise<string> {
    return this.operation(async (options) => {
      this.pending.clear();
      this.emit(
        'message.delta',
        { role: 'user', text: question.slice(0, 1000), authoritative: false },
        options.requestId!,
      );
      const proposal = await this.client.ai.propose(question, {
        ...options,
        context,
      });
      if (options.signal?.aborted)
        throw new EarthError('Session cancelled.', 'ABORTED');
      const id = crypto.randomUUID();
      this.pending.clear();
      this.pending.set(id, structuredClone(proposal));
      this.emit(
        'plan.proposed',
        { proposal_id: id, proposal },
        options.requestId!,
      );
      this.emit('approval.requested', { proposal_id: id }, options.requestId!);
      return id;
    });
  }
  approve(proposalId: string): Promise<QueryResult> {
    const proposal = this.pending.get(proposalId);
    if (!proposal)
      throw new EarthError(
        'Proposal is missing, expired or already used.',
        'APPROVAL_REQUIRED',
      );
    return this.operation(async (options) => {
      this.pending.delete(proposalId);
      return this.execute(proposal.plan, options);
    });
  }
  run(plan: QueryPlan): Promise<QueryResult> {
    return this.operation((options) => {
      this.pending.clear();
      return this.execute(plan, options);
    });
  }
  private async execute(
    plan: QueryPlan,
    options: RequestOptions,
  ): Promise<QueryResult> {
    this.emit('tool.requested', { plan }, options.requestId!);
    const result = await this.client.query(plan, options);
    if (options.signal?.aborted)
      throw new EarthError('Session cancelled.', 'ABORTED');
    const artifactId = crypto.randomUUID();
    this.emit('tool.completed', { result }, options.requestId!);
    this.emit(
      'artifact.created',
      { artifact_id: artifactId, kind: 'spatial-result', result },
      options.requestId!,
    );
    this.emit(
      'execution.completed',
      { artifact_id: artifactId, receipt: result.receipt },
      options.requestId!,
    );
    return result;
  }
  cancel() {
    this.active?.abort();
    this.pending.clear();
  }
  close() {
    this.cancel();
    if (!this.closed) {
      this.closed = true;
      this.emit('session.completed', { reason: 'closed' }, crypto.randomUUID());
    }
  }
}
