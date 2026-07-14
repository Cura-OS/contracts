// TypeSpec audit-query contract for @curaos/contracts.
//
// THE canonical audit-log READ mold. ONE audit-query shape for EVERY service
// that exposes its tamper-evident audit trail, so the read vocabulary (actorId /
// action / resourceRef / from / to filter params + the AuditEntry projection) is
// identical fleet-wide and a compliance consumer reads the SAME AuditEntry from
// any service (the duplication [[curaos-reuse-dry-rule]] forbids, per charter §6
// tamper-evident audit). Authored here in the standalone @curaos/contracts style,
// mirroring the codegen envelope mold the derive emitter bundles into generated
// services (tools/codegen .../specs/lib/audit-query.tsp).
//
// Composes the pagination-envelope mold: a consumer's `GET /audit` operation
// binds AuditQueryParams alongside CuraOS.Contracts.Pagination.PageParams and
// returns Page<AuditEntry>. Pure WIRE shapes: the audit ROWS are owned by the
// per-service audit-outbox / audit-chain infra table - this is only the READ
// contract over them. Runtime mirror: src/audit-query-types.ts.
//
// Tenant is NEVER accepted from the wire: the service always scopes an audit
// query to the caller's own tenant server-side. `changes` is a redacted diff
// (PHI stripped at the service boundary - changed field NAMES + non-PHI values
// only) so the read surface stays inside the PHI boundary.
//
// Entity-only contract: no REST operations, so no @route ops here. Compile only
// if a sibling tspconfig pins an emitter (none today).

import "@typespec/http";
import "./pagination-envelope.tsp";

using TypeSpec.Http;

@service(#{ title: "CuraOS Audit Query" })
namespace CuraOS.Contracts.AuditQuery;

@doc("""
Filter params for an audit-log query. All optional: an empty query returns the
tenant's most recent audited actions. A tenant filter is NEVER accepted here (the
service scopes to the caller's tenant server-side). Bind as `@query` params
alongside CuraOS.Contracts.Pagination.PageParams on the list op.
""")
model AuditQueryParams {
  @doc("Filter to actions by ONE principal (the JWT-derived actor id of the doer).")
  actorId?: string;

  @doc("Filter to ONE action verb (e.g. 'task.created', 'consent.revoked').")
  action?: string;

  @doc("Filter to actions against ONE resource (opaque `<type>:<id>` ref).")
  resourceRef?: string;

  @doc("Inclusive lower bound on when the action occurred.")
  from?: utcDateTime;

  @doc("Exclusive upper bound on when the action occurred.")
  to?: utcDateTime;
}

@doc("""
One audit-trail entry projected onto the wire: the tamper-evident record's PUBLIC
projection. The chain-hash fields (prevHash / entryHash) prove integrity to a
verifier without exposing the raw persisted audit columns. `changes` is a
redacted diff (changed field names + non-PHI values only, PHI stripped at the
service boundary).
""")
model AuditEntry {
  @doc("Stable entry id.")
  id: string;

  @doc("The principal who performed the action (JWT-derived, never body-supplied).")
  actorId: string;

  @doc("The action verb (e.g. 'task.created').")
  action: string;

  @doc("Opaque `<type>:<id>` ref of the resource the action touched.")
  resourceRef: string;

  @doc("Redacted change payload: changed field names + non-PHI values only. JSON.")
  changes?: string;

  @doc("The previous entry's hash this one chains from. Null for the first entry in a chain.")
  prevHash?: string;

  @doc("This entry's own hash. A verifier recomputes the chain to prove no gaps or edits.")
  entryHash: string;

  @doc("When the action occurred.")
  occurredAt: utcDateTime;
}

@doc("""
The page of audit entries a query returns: Page<AuditEntry> from the
pagination-envelope mold. Named here so a consumer references ONE result type.
""")
model AuditPage is CuraOS.Contracts.Pagination.Page<AuditEntry>;
