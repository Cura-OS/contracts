// Runtime TypeScript mirror of specs/party-event-envelope.tsp.
//
// THE durable v1 base envelope for party.* domain events. ONE event shape for
// EVERY party topic (registered / updated / deleted / merged / role lifecycle),
// so a strict consumer reads the SAME base fields no matter which party topic it
// subscribes to and deduplicates on ONE key. Authored here in the standalone
// @curaos/contracts style so a hand-written consumer (e.g. personal-crm-service)
// can import the shape without pulling the service-core generator.
//
// snake_case WIRE vocabulary is deliberate: the durable base is `event_id`,
// `tenant_id`, `occurred_at` (+ the topic `type`). `event_id` EQUALS the
// DomainOutbox idempotency key so a consumer dedups exactly-once on it. A
// camelCase drift (`eventId` / `tenantId` / `occurredAt`) is the defect this
// mold exists to reject: the strict CRM consumer accepts ONLY the snake_case
// base and would silently never-dedup a drifted producer.
//
// Pure WIRE shapes: the party ROWS are owned by Party Core's own schema - this is
// only the event contract over them. No PHI rides the envelope; a topic's
// reference fields carry opaque ids, never names or PHI.
//
// Extension seam: a party topic is the durable base INTERSECTED with its own
// reference fields (PartyEvent<Ref>). registered/updated/deleted carry party_id;
// merge carries survivor + absorbed ids; a role change carries role + action.

/**
 * The durable v1 base envelope every party.* event carries. `type` is the topic
 * verb (e.g. 'party.registered'); `event_id` is the exactly-once idempotency key
 * (== the DomainOutbox key a consumer dedups on); `tenant_id` scopes the event;
 * `occurred_at` is when it happened (ISO-8601 UTC). snake_case is the contract -
 * a camelCase producer is a drift the strict consumer rejects.
 */
export interface DomainEventEnvelope {
  type: string;
  /** Exactly-once idempotency key; equals the DomainOutbox key. A consumer dedups on this. */
  event_id: string;
  tenant_id: string;
  /** When the event occurred (ISO-8601 UTC). */
  occurred_at: string;
}

/**
 * A party topic event: the durable base plus that topic's reference fields. `Ref`
 * is the topic-specific extension (the seam that lets a new party topic add its
 * reference fields without re-authoring the base envelope).
 */
export type PartyEvent<Ref extends object> = DomainEventEnvelope & Ref;

/** party.registered / party.updated / party.deleted: reference the ONE party. */
export type PartyLifecycleEvent = PartyEvent<{ party_id: string }>;

/** party.merged / party.unmerged: survivor `party_id` absorbs `merged_party_id`. */
export type PartyMergeEvent = PartyEvent<{ party_id: string; merged_party_id: string }>;

/** party.role.granted / party.role.revoked: a role change on ONE party. */
export type PartyRoleEvent = PartyEvent<{
  party_id: string;
  role: string;
  role_action: 'granted' | 'revoked';
}>;

/**
 * The exact snake_case keys a durable envelope MUST carry. A producer that emits
 * any other spelling (camelCase drift) is missing the contract key.
 */
const BASE_KEYS = ['type', 'event_id', 'tenant_id', 'occurred_at'] as const;

/**
 * Fail-closed validation of the durable base envelope. Throws (never returns a
 * partially-valid event) if a base key is absent or not a non-empty string, or
 * if `occurred_at` is not a parseable ISO-8601 timestamp. This is the guard the
 * strict CRM consumer runs before dedup: a camelCase-drifted producer (`eventId`
 * instead of `event_id`) fails here rather than silently bypassing dedup.
 *
 * `raw` is narrowed to `DomainEventEnvelope` on success (asserts signature) so a
 * consumer can read the base fields with no further checks.
 */
export function assertDurableEnvelope(raw: unknown): asserts raw is DomainEventEnvelope {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError('party event envelope must be an object');
  }
  const rec = raw as Record<string, unknown>;
  for (const key of BASE_KEYS) {
    const v = rec[key];
    if (typeof v !== 'string' || v.length === 0) {
      throw new TypeError(
        `party event envelope missing durable base key '${key}' (snake_case required; camelCase drift is not the contract)`,
      );
    }
  }
  if (Number.isNaN(Date.parse(rec.occurred_at as string))) {
    throw new RangeError(
      `party event 'occurred_at' is not a valid ISO-8601 timestamp: ${String(rec.occurred_at)}`,
    );
  }
}

/**
 * Parse a party lifecycle event (registered / updated / deleted) fail-closed:
 * the durable base MUST be present AND `party_id` MUST be a non-empty string.
 * Returns the typed event or throws. Reference validator for a strict consumer;
 * a DB-backed consumer enforces the same contract at its ingest boundary.
 */
export function parsePartyLifecycleEvent(raw: unknown): PartyLifecycleEvent {
  assertDurableEnvelope(raw);
  const party_id = (raw as DomainEventEnvelope & { party_id?: unknown }).party_id;
  if (typeof party_id !== 'string' || party_id.length === 0) {
    throw new TypeError("party lifecycle event missing 'party_id'");
  }
  return raw as PartyLifecycleEvent;
}
