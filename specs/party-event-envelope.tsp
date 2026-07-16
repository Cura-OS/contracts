// TypeSpec party-event-envelope contract for @curaos/contracts.
//
// THE durable v1 base envelope for party.* domain events. ONE base shape for
// EVERY party topic (registered / updated / deleted / merged / role lifecycle),
// so a strict consumer reads the SAME base fields (event_id / tenant_id /
// occurred_at + the topic verb) no matter which party topic it subscribes to and
// deduplicates exactly-once on ONE key (the duplication [[curaos-reuse-dry-rule]]
// forbids). Authored here in the standalone @curaos/contracts style, mirroring
// the durable base envelope the service-core derive emitter bundles into
// generated producers (tools/codegen .../service-core/src/events) so a
// hand-written consumer can import the shape without pulling the generator.
//
// snake_case WIRE vocabulary is the contract: `event_id` (== the DomainOutbox
// idempotency key a consumer dedups on), `tenant_id`, `occurred_at`. A camelCase
// producer (`eventId`/`tenantId`/`occurredAt`) is the exact drift this mold
// rejects: the strict personal-crm-service consumer accepts ONLY the snake_case
// base and never-dedups a drifted producer. Runtime mirror: src/party-event-types.ts.
//
// Pure WIRE shapes: the party ROWS are owned by Party Core's own schema - this is
// only the event contract over them. No PHI/PII rides the envelope; a topic's
// reference fields carry opaque ids only.
//
// Extension seam: a party topic model `is` the durable base plus its own
// reference fields (PartyEvent<Ref>), so a new topic adds reference fields
// without re-authoring the base envelope.
//
// Entity-only contract: no REST operations, so no @route ops here. Compile only
// if a sibling tspconfig pins an emitter (none today).

import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "CuraOS Party Event Envelope" })
namespace CuraOS.Contracts.PartyEvent;

@doc("""
The durable v1 base envelope every party.* event carries. `type` is the topic
verb (e.g. 'party.registered'); `event_id` is the exactly-once idempotency key
that EQUALS the DomainOutbox key a consumer dedups on; `tenant_id` scopes the
event; `occurred_at` is when it happened. snake_case is the contract - a
camelCase producer is a drift the strict consumer rejects. A topic model extends
this base with its reference fields via `PartyEvent<Ref>`.
""")
model DomainEventEnvelope {
  @doc("The topic verb (e.g. 'party.registered', 'party.role.granted').")
  type: string;

  @doc("Exactly-once idempotency key; equals the DomainOutbox key. A consumer dedups on this.")
  event_id: string;

  @doc("Tenant the event belongs to. Never used to widen scope on the consumer side.")
  tenant_id: string;

  @doc("When the event occurred.")
  occurred_at: utcDateTime;
}

@doc("""
A party topic event: the durable base plus that topic's reference fields. `Ref`
is the topic-specific extension - the seam that lets a new party topic add its
reference fields without re-authoring the base envelope.
""")
model PartyEvent<Ref> {
  ...DomainEventEnvelope;
  ...Ref;
}

@doc("party.registered / party.updated / party.deleted: reference the ONE party.")
model PartyLifecycleEvent is PartyEvent<{
  @doc("Opaque id of the party the lifecycle event is about.")
  party_id: string;
}>;

@doc("party.merged / party.unmerged: survivor `party_id` absorbs `merged_party_id`.")
model PartyMergeEvent is PartyEvent<{
  @doc("Surviving party id.")
  party_id: string;

  @doc("Absorbed party id (merged into the survivor).")
  merged_party_id: string;
}>;

@doc("party.role.granted / party.role.revoked: a role change on ONE party.")
model PartyRoleEvent is PartyEvent<{
  @doc("Party the role change applies to.")
  party_id: string;

  @doc("The role granted or revoked.")
  role: string;

  @doc("Whether the role was granted or revoked.")
  role_action: "granted" | "revoked";
}>;
