// Runtime TypeScript mirror of specs/conflict-envelope.tsp.
//
// THE canonical HTTP 409 conflict mold. ONE Conflict response shape for EVERY
// service that returns 409, so a consumer branches retry-vs-abort on the SAME
// machine-readable `reason` no matter which service raised it (the duplication
// [[curaos-reuse-dry-rule]] forbids). Precedent: identity-service's service-local
// `Conflict { statusCode: 409; body: ProblemResponse }`, lifted here as the
// shared owner. Authored in the standalone @curaos/contracts style so a
// hand-written consumer (procurement-core-service) imports the shape without the
// service-core generator. Runtime mirror consumed by procurement transaction APIs.
//
// Two truthful conflict reasons a mutation can lose on:
//  - optimistic_concurrency: an expected-state compare-and-swap lost a race (the
//    row moved under the caller). The client MAY re-read and retry.
//  - terminal_state: the target is in a terminal state that forbids the mutation
//    (e.g. a cancelled order). The client MUST NOT retry; it must abort.
//
// The body is RFC-7807 problem+json. `status` is LOCKED to 409 (a Conflict that
// advertised any other status would be a false contract). The persistence detail
// a client needs to decide (expected/current version for CAS; current terminal
// state) rides machine-readable fields, never a leaked internal error string.

/**
 * Why a mutation lost. `optimistic_concurrency` = CAS race, retry allowed;
 * `terminal_state` = target is terminal, do not retry.
 */
export type ConflictReason = 'optimistic_concurrency' | 'terminal_state';

/**
 * RFC-7807 problem+json body for a 409. `type`/`title`/`status`/`detail`/
 * `instance` are the standard problem members; `reason` is the CuraOS
 * machine-readable discriminator a client branches on. The optional
 * `expected_version`/`current_version` (CAS) and `current_state` (terminal)
 * carry only the non-PHI facts a client needs to decide - never internal
 * persistence details.
 */
export interface ProblemResponse {
  /** Problem-type URI (or 'about:blank'). */
  type: string;
  /** Short, human-readable summary of the problem type. */
  title: string;
  /** Always 409 for a Conflict. */
  status: 409;
  /** Human-readable, instance-specific explanation. */
  detail?: string;
  /** URI reference identifying this occurrence. */
  instance?: string;
  /** Machine-readable conflict discriminator: retry (CAS) vs abort (terminal). */
  reason: ConflictReason;
  /** Optimistic concurrency: the version the caller sent. */
  expected_version?: number;
  /** Optimistic concurrency: the authoritative current version. */
  current_version?: number;
  /** Terminal-state conflict: the current terminal state that forbids the mutation. */
  current_state?: string;
}

/**
 * The 409 response envelope. Mirrors identity-service's
 * `Conflict { @statusCode statusCode: 409; @body body: ProblemResponse }`.
 */
export interface Conflict {
  statusCode: 409;
  body: ProblemResponse;
}

/**
 * Build an optimistic-concurrency 409 (CAS lost a race). `status` is always 409
 * and `reason` always `optimistic_concurrency` so the contract cannot be
 * mis-stated at a call site. The caller MAY re-read `current_version` and retry.
 */
export function optimisticConflict(args: {
  expectedVersion: number;
  currentVersion: number;
  detail?: string;
  instance?: string;
}): Conflict {
  return {
    statusCode: 409,
    body: {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      reason: 'optimistic_concurrency',
      expected_version: args.expectedVersion,
      current_version: args.currentVersion,
      ...(args.detail !== undefined ? { detail: args.detail } : {}),
      ...(args.instance !== undefined ? { instance: args.instance } : {}),
    },
  };
}

/**
 * Build a terminal-state 409 (mutation on a terminal target). `status` is always
 * 409 and `reason` always `terminal_state`. The caller MUST NOT retry.
 */
export function terminalStateConflict(args: {
  currentState: string;
  detail?: string;
  instance?: string;
}): Conflict {
  return {
    statusCode: 409,
    body: {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      reason: 'terminal_state',
      current_state: args.currentState,
      ...(args.detail !== undefined ? { detail: args.detail } : {}),
      ...(args.instance !== undefined ? { instance: args.instance } : {}),
    },
  };
}

/** Is this conflict retryable (a CAS race) rather than a terminal abort? */
export function isRetryableConflict(body: ProblemResponse): boolean {
  return body.reason === 'optimistic_concurrency';
}
