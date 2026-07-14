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
  if (q.from !== undefined && at < Date.parse(q.from)) return false;
  if (q.to !== undefined && at >= Date.parse(q.to)) return false;
  return true;
}
