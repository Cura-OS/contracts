// Runtime TypeScript mirror of specs/audit-query.tsp.
//
// THE canonical audit-log READ shape: ONE query + entry projection for every
// service that exposes its tamper-evident audit trail, so a compliance consumer
// reads the SAME AuditEntry from any service. Composes the pagination envelope
// (src/pagination-types.ts): an audit query returns Page<AuditEntry>. Pure wire
// shapes; the audit rows are owned by the per-service audit-outbox infra table.
//
// Tenant is NEVER a wire filter (the service scopes to the caller's tenant). The
// from/to bounds are half-open: `from` inclusive, `to` exclusive.
//
// PHI boundary: `changes` carries changed field NAMES + non-PHI values only. The
// redaction is enforced service-side BEFORE an entry becomes an AuditEntry, and
// it MUST NOT be a single-format value scan (e.g. an SSN-shaped regex): a scan
// that only recognizes one PHI format is dead under any payload that does not
// match that format and leaks every other identifier (MRN, DOB, free-text). The
// contract's guarantee is field-level allow-listing at the source, not a format
// heuristic; this projection assumes that has already happened.

import type { Page } from './pagination-types';

/**
 * Filter params for an audit-log query. All optional: an empty query matches the
 * tenant's most recent audited actions. Timestamps are ISO-8601 UTC strings.
 */
export interface AuditQueryParams {
  actorId?: string;
  action?: string;
  resourceRef?: string;
  /** Inclusive lower bound on occurredAt (ISO-8601 UTC). */
  from?: string;
  /** Exclusive upper bound on occurredAt (ISO-8601 UTC). */
  to?: string;
}

/**
 * One audit-trail entry's PUBLIC projection. The chain-hash fields (prevHash /
 * entryHash) prove integrity without exposing the raw persisted columns. `changes`
 * is a redacted diff (changed field names + non-PHI values only).
 */
export interface AuditEntry {
  id: string;
  /** JWT-derived actor id, never body-supplied. */
  actorId: string;
  /** The action verb (e.g. 'task.created'). */
  action: string;
  /** Opaque `<type>:<id>` ref of the touched resource. */
  resourceRef: string;
  /** Redacted change payload (JSON): changed field names + non-PHI values only. */
  changes?: string;
  /** Previous entry's hash; null for the first entry in a chain. */
  prevHash?: string;
  /** This entry's own hash; a verifier recomputes the chain from it. */
  entryHash: string;
  /** When the action occurred (ISO-8601 UTC). */
  occurredAt: string;
}

/** The page of audit entries a query returns. */
export type AuditPage = Page<AuditEntry>;

/**
 * Does one entry satisfy the query filters? Exact-match on actorId / action /
 * resourceRef; half-open time window (`from` inclusive, `to` exclusive). An empty
 * param set matches everything. Reference predicate for a service that filters in
 * memory; a DB-backed service pushes the same semantics into its WHERE clause.
 */
export function matchesQuery(entry: AuditEntry, q: AuditQueryParams): boolean {
  if (q.actorId !== undefined && entry.actorId !== q.actorId) return false;
  if (q.action !== undefined && entry.action !== q.action) return false;
  if (q.resourceRef !== undefined && entry.resourceRef !== q.resourceRef) {
    return false;
  }
  const at = Date.parse(entry.occurredAt);
  // Validate the caller-supplied bounds at the boundary. Date.parse returns NaN
  // for an unparseable string, and every NaN comparison is false, so an invalid
  // `from`/`to` would silently drop the window bound and leak records outside it.
  // Fail loud instead of returning a wrong result.
  if (q.from !== undefined) {
    const from = Date.parse(q.from);
    if (Number.isNaN(from)) {
      throw new RangeError(`audit query 'from' is not a valid ISO-8601 timestamp: ${q.from}`);
    }
    if (at < from) return false;
  }
  if (q.to !== undefined) {
    const to = Date.parse(q.to);
    if (Number.isNaN(to)) {
      throw new RangeError(`audit query 'to' is not a valid ISO-8601 timestamp: ${q.to}`);
    }
    if (at >= to) return false;
  }
  return true;
}
