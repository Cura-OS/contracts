// TypeSpec conflict-envelope contract for @curaos/contracts.
//
// THE canonical HTTP 409 conflict mold. ONE Conflict response for EVERY service
// that returns 409, so a consumer branches retry-vs-abort on the SAME
// machine-readable `reason` no matter which service raised it (the duplication
// [[curaos-reuse-dry-rule]] forbids). Precedent: identity-service's service-local
// `Conflict { @statusCode statusCode: 409; @body body: ProblemResponse }`, lifted
// here as the shared owner. Authored in the standalone @curaos/contracts style,
// mirroring the generic Conflict envelope the service-core / -personal / -business
// TypeSpec templates emit (tools/codegen .../specs) so a hand-written consumer
// imports the shape without the generator. Runtime mirror: src/conflict-types.ts.
//
// Two truthful conflict reasons a mutation can lose on:
//  - optimistic_concurrency: an expected-state compare-and-swap lost a race; the
//    client MAY re-read `current_version` and retry.
//  - terminal_state: the target is terminal (e.g. a cancelled order) and forbids
//    the mutation; the client MUST NOT retry.
//
// The body is RFC-7807 problem+json with `status` LOCKED to 409 (a Conflict that
// advertised any other status would be a false contract). Only the non-PHI facts
// a client needs to decide ride the machine-readable fields - no leaked internal
// persistence detail.
//
// Procurement (procurement-core-service) binds this Conflict on its five truthful
// 409 operations: approveRequisition, cancelOrder, recordReceipt, recordInvoice,
// matchInvoice. It does NOT claim 409 for operations that cannot return it.
//
// Entity-only contract: no REST operations, so no @route ops here. Compile only
// if a sibling tspconfig pins an emitter (none today).

import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "CuraOS Conflict Envelope" })
namespace CuraOS.Contracts.Conflict;

@doc("Why a mutation lost. optimistic_concurrency = CAS race, retry allowed; terminal_state = target terminal, do not retry.")
union ConflictReason {
  optimisticConcurrency: "optimistic_concurrency",
  terminalState: "terminal_state",
}

@doc("""
RFC-7807 problem+json body for a 409. `type`/`title`/`status`/`detail`/`instance`
are the standard problem members; `reason` is the CuraOS machine-readable
discriminator a client branches on. `expected_version`/`current_version` (CAS)
and `current_state` (terminal) carry only the non-PHI facts a client needs to
decide - never internal persistence detail.
""")
model ProblemResponse {
  @doc("Problem-type URI (or 'about:blank').")
  type: string;

  @doc("Short, human-readable summary of the problem type.")
  title: string;

  @doc("Always 409 for a Conflict.")
  status: 409;

  @doc("Human-readable, instance-specific explanation.")
  detail?: string;

  @doc("URI reference identifying this occurrence.")
  instance?: string;

  @doc("Machine-readable conflict discriminator: retry (CAS) vs abort (terminal).")
  reason: ConflictReason;

  @doc("Optimistic concurrency: the version the caller sent.")
  expected_version?: int64;

  @doc("Optimistic concurrency: the authoritative current version.")
  current_version?: int64;

  @doc("Terminal-state conflict: the current terminal state that forbids the mutation.")
  current_state?: string;
}

@doc("""
The 409 response envelope. Mirrors identity-service's service-local
`Conflict { @statusCode statusCode: 409; @body body: ProblemResponse }`. Bind on
an operation's return union where a 409 is a REAL contract outcome.
""")
@error
model Conflict {
  @statusCode statusCode: 409;

  @body body: ProblemResponse;
}
