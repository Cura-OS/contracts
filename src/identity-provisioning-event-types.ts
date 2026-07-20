// Runtime TypeScript mirror of specs/identity-provisioning-event-envelope.tsp.
//
// THE typed wire shape for the identity.* SCIM provisioning events
// identity-service emits (src/auth/scim/scim-provisioning-events.ts, merged
// main bbb3c24): identity.user.provisioned / identity.user.deprovisioned /
// identity.group.provisioned / identity.group.membership.changed. Downstream
// consumers (org membership, notification welcome-email, rbac projection)
// share ONE contract instead of each re-deriving the inline shape the
// producer emits today.
//
// Deliberately does NOT reuse DomainEventEnvelope (party-event-types.ts):
// identity-service's ScimProvisioningPublisher does not carry event_id or
// occurred_at on the wire today - there is no exactly-once dedup key yet. This
// contract types what identity-service ACTUALLY emits; it does not invent
// fields the producer does not send. `observedBy` is emitted camelCase by the
// producer's own header-enrichment interceptor - that is the real wire key,
// not a drift to correct here.
//
// PHI/PII BOUNDARY (AGENTS.md §3): NEUTRAL. user_name / display_name are SCIM
// directory attributes (not clinical PHI); member ids are opaque references.

/** The 4 identity.* SCIM provisioning event topics identity-service emits. */
export const IDENTITY_PROVISIONING_EVENT_TYPES = [
  'identity.user.provisioned',
  'identity.user.deprovisioned',
  'identity.group.provisioned',
  'identity.group.membership.changed',
] as const;

export type IdentityProvisioningEventType = (typeof IDENTITY_PROVISIONING_EVENT_TYPES)[number];

/** Fields every identity.* provisioning event carries. */
export interface IdentityProvisioningEventBase {
  type: IdentityProvisioningEventType;
  tenant_id: string;
  resource_id: string;
  /** Set by the emitting service's header-enrichment interceptor. */
  observedBy?: string;
}

/** identity.user.provisioned / identity.user.deprovisioned. */
export interface IdentityUserProvisioningEvent extends IdentityProvisioningEventBase {
  type: 'identity.user.provisioned' | 'identity.user.deprovisioned';
  user_name: string;
  external_id?: string;
}

/** identity.group.provisioned. */
export interface IdentityGroupProvisionedEvent extends IdentityProvisioningEventBase {
  type: 'identity.group.provisioned';
  display_name: string;
  external_id?: string;
}

/** identity.group.membership.changed: added/removed member deltas on ONE group. */
export interface IdentityGroupMembershipChangedEvent extends IdentityProvisioningEventBase {
  type: 'identity.group.membership.changed';
  display_name: string;
  added_members: readonly string[];
  removed_members: readonly string[];
  mapped_role?: string;
}

export type IdentityProvisioningEvent =
  | IdentityUserProvisioningEvent
  | IdentityGroupProvisionedEvent
  | IdentityGroupMembershipChangedEvent;

const PROVISIONING_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  IDENTITY_PROVISIONING_EVENT_TYPES,
);

/**
 * Fail-closed validation of the base fields (`type` is a known topic, `tenant_id`
 * and `resource_id` are non-empty strings). Throws rather than returning a
 * partially-valid event.
 */
export function assertIdentityProvisioningEnvelope(
  raw: unknown,
): asserts raw is IdentityProvisioningEventBase {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError('identity provisioning event must be an object');
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.type !== 'string' || !PROVISIONING_EVENT_TYPE_SET.has(rec.type)) {
    throw new TypeError(
      `identity provisioning event has unknown 'type': ${String(rec.type)} (expected one of ${IDENTITY_PROVISIONING_EVENT_TYPES.join(', ')})`,
    );
  }
  for (const key of ['tenant_id', 'resource_id'] as const) {
    const v = rec[key];
    if (typeof v !== 'string' || v.length === 0) {
      throw new TypeError(`identity provisioning event missing '${key}'`);
    }
  }
}

/**
 * Parse + narrow an identity.* provisioning event fail-closed: the base fields
 * MUST be present AND that topic's required fields MUST be present. Returns the
 * typed event or throws.
 */
export function parseIdentityProvisioningEvent(raw: unknown): IdentityProvisioningEvent {
  assertIdentityProvisioningEnvelope(raw);
  const rec = raw as unknown as Record<string, unknown>;

  switch (rec.type) {
    case 'identity.user.provisioned':
    case 'identity.user.deprovisioned': {
      if (typeof rec.user_name !== 'string' || rec.user_name.length === 0) {
        throw new TypeError(`identity provisioning event (${rec.type}) missing 'user_name'`);
      }
      return raw as IdentityUserProvisioningEvent;
    }
    case 'identity.group.provisioned': {
      if (typeof rec.display_name !== 'string' || rec.display_name.length === 0) {
        throw new TypeError(`identity provisioning event (${rec.type}) missing 'display_name'`);
      }
      return raw as IdentityGroupProvisionedEvent;
    }
    case 'identity.group.membership.changed': {
      if (typeof rec.display_name !== 'string' || rec.display_name.length === 0) {
        throw new TypeError(`identity provisioning event (${rec.type}) missing 'display_name'`);
      }
      if (!Array.isArray(rec.added_members) || !Array.isArray(rec.removed_members)) {
        throw new TypeError(
          `identity provisioning event (${rec.type}) missing 'added_members'/'removed_members'`,
        );
      }
      return raw as IdentityGroupMembershipChangedEvent;
    }
    default:
      // Unreachable: assertIdentityProvisioningEnvelope already rejected any
      // 'type' outside IDENTITY_PROVISIONING_EVENT_TYPES.
      throw new TypeError(`identity provisioning event has unhandled type: ${String(rec.type)}`);
  }
}
