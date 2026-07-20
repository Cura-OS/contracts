// TypeSpec identity-provisioning-event-envelope contract for @curaos/contracts.
//
// THE typed wire shape for the identity.* SCIM provisioning events
// identity-service emits (src/auth/scim/scim-provisioning-events.ts, merged
// main bbb3c24): identity.user.provisioned / identity.user.deprovisioned /
// identity.group.provisioned / identity.group.membership.changed. Downstream
// consumers (org membership, notification welcome-email, rbac projection)
// share ONE contract instead of each re-deriving the inline shape.
//
// Deliberately does NOT reuse the party.* DomainEventEnvelope
// (party-event-envelope.tsp): identity-service's producer does not carry
// event_id or occurred_at on the wire today - no exactly-once dedup key yet.
// This spec types what identity-service ACTUALLY emits. Runtime mirror:
// src/identity-provisioning-event-types.ts.
//
// PHI/PII BOUNDARY: NEUTRAL. user_name / display_name are SCIM directory
// attributes (not clinical PHI); member ids are opaque references.
//
// Entity-only contract: no REST operations, so no @route ops here.

@service(#{ title: "CuraOS Identity Provisioning Event Envelope" })
namespace CuraOS.Contracts.IdentityProvisioningEvent;

@doc("Fields every identity.* provisioning event carries.")
model IdentityProvisioningEventBase {
  @doc("The topic verb.")
  type:
    | "identity.user.provisioned"
    | "identity.user.deprovisioned"
    | "identity.group.provisioned"
    | "identity.group.membership.changed";

  @doc("Tenant the event belongs to.")
  tenant_id: string;

  @doc("Opaque id of the SCIM resource (user or group) the event is about.")
  resource_id: string;

  @doc("Set by the emitting service's header-enrichment interceptor.")
  observedBy?: string;
}

@doc("identity.user.provisioned / identity.user.deprovisioned.")
model IdentityUserProvisioningEvent {
  ...IdentityProvisioningEventBase;

  @doc("SCIM userName.")
  user_name: string;

  @doc("External IdP id for the user, when the IdP supplied one.")
  external_id?: string;
}

@doc("identity.group.provisioned.")
model IdentityGroupProvisionedEvent {
  ...IdentityProvisioningEventBase;

  @doc("SCIM group displayName.")
  display_name: string;

  @doc("External IdP id for the group, when the IdP supplied one.")
  external_id?: string;
}

@doc("identity.group.membership.changed: added/removed member deltas on ONE group.")
model IdentityGroupMembershipChangedEvent {
  ...IdentityProvisioningEventBase;

  @doc("SCIM group displayName.")
  display_name: string;

  @doc("Member ids added in this SCIM PATCH/PUT.")
  added_members: string[];

  @doc("Member ids removed in this SCIM PATCH/PUT.")
  removed_members: string[];

  @doc("Role mapped from this group, when a mapping applies.")
  mapped_role?: string;
}
