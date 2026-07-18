// Runtime TypeScript mirror of specs/manufacturing-event-envelope.tsp.
//
// THE versioned durable domain events a neutral manufacturing-core-service emits
// over the MRP lifecycle, so a downstream consumer (inventory reservation +
// consumption, procurement replenishment, accounting WIP/finished-goods
// valuation, or a shop-floor dashboard) subscribes to a STABLE contract and
// deduplicates exactly-once on ONE key. Promotes the inventory-core
// manufacturing-LIGHT scaffold (which emitted only kit assemble/disassemble
// stock movements) to the full MO / work-order / material / production event set.
//
// REUSE (curaos_reuse_dry_rule): every event is the SHARED durable base envelope
// (`DomainEventEnvelope` from party-event-types.ts - the ONE snake_case base
// event_id / tenant_id / occurred_at + `type`) INTERSECTED with that topic's
// reference fields, exactly the PartyEvent<Ref> seam. `event_id` EQUALS the
// DomainOutbox idempotency key a consumer dedups on. A camelCase producer is the
// drift the base guard rejects.
//
// Topic namespace mirrors inventory-core: `curaos.core.manufacturing.<resource>.
// <action>.v1`. NEVER rename a `.v1` channel - add a `.v2` alongside it per
// curaos_rolling_update_rule; the version suffix is the backward-compat seam.
//
// PHI/PII BOUNDARY (AGENTS.md §3): NEUTRAL. Every payload is reference-only.
// Items are opaque `item_id`; a PERSON on the shop floor (operator, planner) is
// an opaque `party_id`, never a name or PHI.

import { assertDurableEnvelope, type DomainEventEnvelope } from './party-event-types';
import type { PlannedOrderType } from './manufacturing-types';
import { createHash, randomUUID } from 'node:crypto';

// ── Topics ────────────────────────────────────────────────────────────────────
export const MANUFACTURING_MO_CREATED_TOPIC = 'curaos.core.manufacturing.mo.created.v1';
export const MANUFACTURING_MO_RELEASED_TOPIC = 'curaos.core.manufacturing.mo.released.v1';
export const MANUFACTURING_MO_STARTED_TOPIC = 'curaos.core.manufacturing.mo.started.v1';
export const MANUFACTURING_MO_DONE_TOPIC = 'curaos.core.manufacturing.mo.done.v1';
export const MANUFACTURING_WORK_ORDER_STARTED_TOPIC =
  'curaos.core.manufacturing.work_order.started.v1';
export const MANUFACTURING_WORK_ORDER_COMPLETED_TOPIC =
  'curaos.core.manufacturing.work_order.completed.v1';
export const MANUFACTURING_MATERIAL_RESERVED_TOPIC =
  'curaos.core.manufacturing.material.reserved.v1';
export const MANUFACTURING_MATERIAL_CONSUMED_TOPIC =
  'curaos.core.manufacturing.material.consumed.v1';
export const MANUFACTURING_MATERIAL_BACKFLUSHED_TOPIC =
  'curaos.core.manufacturing.material.backflushed.v1';
export const MANUFACTURING_PRODUCTION_COMPLETED_TOPIC =
  'curaos.core.manufacturing.production.completed.v1';
/**
 * The MRP-run explosion nets a demand shortfall into a PLANNED ORDER suggestion:
 * `order_type=make` (produce, needs a BOM) or `order_type=buy` (purchase). This
 * is the replenishment hand-off the neutral event plane publishes so a downstream
 * PROCUREMENT consumer turns each planned BUY into a purchase requisition line /
 * RFQ (MRP-14), and a MAKE folds into a manufacturing order. NEVER rename a `.v1`
 * channel - add a `.v2` per [[curaos-rolling-update-rule]].
 */
export const MANUFACTURING_PLANNED_ORDER_CREATED_TOPIC =
  'curaos.core.manufacturing.planned_order.created.v1';

export type ManufacturingDomainEventType =
  | 'MoCreated'
  | 'MoReleased'
  | 'MoStarted'
  | 'MoDone'
  | 'WorkOrderStarted'
  | 'WorkOrderCompleted'
  | 'MaterialReserved'
  | 'MaterialConsumed'
  | 'MaterialBackflushed'
  | 'ProductionCompleted'
  | 'PlannedOrderCreated';

export const MANUFACTURING_DOMAIN_EVENT_TOPIC: Record<ManufacturingDomainEventType, string> = {
  MoCreated: MANUFACTURING_MO_CREATED_TOPIC,
  MoReleased: MANUFACTURING_MO_RELEASED_TOPIC,
  MoStarted: MANUFACTURING_MO_STARTED_TOPIC,
  MoDone: MANUFACTURING_MO_DONE_TOPIC,
  WorkOrderStarted: MANUFACTURING_WORK_ORDER_STARTED_TOPIC,
  WorkOrderCompleted: MANUFACTURING_WORK_ORDER_COMPLETED_TOPIC,
  MaterialReserved: MANUFACTURING_MATERIAL_RESERVED_TOPIC,
  MaterialConsumed: MANUFACTURING_MATERIAL_CONSUMED_TOPIC,
  MaterialBackflushed: MANUFACTURING_MATERIAL_BACKFLUSHED_TOPIC,
  ProductionCompleted: MANUFACTURING_PRODUCTION_COMPLETED_TOPIC,
  PlannedOrderCreated: MANUFACTURING_PLANNED_ORDER_CREATED_TOPIC,
};

// ── Event shapes ────────────────────────────────────────────────────────────────

/**
 * A manufacturing topic event: the SHARED durable base (`DomainEventEnvelope`)
 * intersected with that topic's reference fields. `Ref` is the topic extension
 * seam (a new manufacturing topic adds its reference fields without re-authoring
 * the base), mirroring PartyEvent<Ref>. `type` is the discriminant.
 */
export type ManufacturingEvent<
  T extends ManufacturingDomainEventType,
  Ref extends object,
> = DomainEventEnvelope & { readonly type: T } & Ref;

/** Reference fields every MO lifecycle event carries. */
export interface MoRef {
  readonly manufacturing_order_id: string;
  readonly order_number: string;
  readonly item_id: string;
  /** Planned build quantity (decimal string; exact on the wire). */
  readonly quantity: string;
  /** Person-centric owner/supervisor of the order (opaque party ref; null = unassigned). */
  readonly responsible_party_id: string | null;
}

export type MoCreatedEvent = ManufacturingEvent<'MoCreated', MoRef>;
export type MoReleasedEvent = ManufacturingEvent<'MoReleased', MoRef>;
export type MoStartedEvent = ManufacturingEvent<'MoStarted', MoRef>;
export type MoDoneEvent = ManufacturingEvent<'MoDone', MoRef>;

/** Reference fields a per-operation work-order event carries. */
export interface WorkOrderRef {
  readonly work_order_id: string;
  readonly manufacturing_order_id: string;
  readonly sequence: number;
  readonly work_center_id: string;
  /** Person-centric operator on the job card (opaque party ref; null = unassigned). */
  readonly operator_party_id: string | null;
}

export type WorkOrderStartedEvent = ManufacturingEvent<'WorkOrderStarted', WorkOrderRef>;
/** Completion adds the produced quantity that cleared the operation + clocked run. */
export type WorkOrderCompletedEvent = ManufacturingEvent<
  'WorkOrderCompleted',
  WorkOrderRef & { readonly done_qty: string; readonly duration_minutes: number | null }
>;

/**
 * Reference fields a material movement event carries. `item_id` is the COMPONENT
 * consumed/reserved; `work_order_id` pins the operation it happened at (null for
 * an MO-level reservation); `lot_id` is the traced lot (null if untracked).
 */
export interface MaterialRef {
  readonly manufacturing_order_id: string;
  readonly work_order_id: string | null;
  readonly item_id: string;
  readonly warehouse_id: string;
  /** Component quantity moved (decimal string). */
  readonly quantity: string;
  readonly lot_id: string | null;
}

export type MaterialReservedEvent = ManufacturingEvent<'MaterialReserved', MaterialRef>;
export type MaterialConsumedEvent = ManufacturingEvent<'MaterialConsumed', MaterialRef>;
/** Backflush = auto-consume components on production completion (no explicit issue). */
export type MaterialBackflushedEvent = ManufacturingEvent<'MaterialBackflushed', MaterialRef>;

/**
 * Finished goods produced and received into stock (the goods-in leg of MO
 * completion). `item_id` is the FINISHED good; `produced_quantity` the units that
 * landed in `warehouse_id`; `lot_id` the produced lot (null if untracked).
 */
export type ProductionCompletedEvent = ManufacturingEvent<
  'ProductionCompleted',
  {
    readonly manufacturing_order_id: string;
    readonly item_id: string;
    readonly warehouse_id: string;
    readonly produced_quantity: string;
    readonly lot_id: string | null;
  }
>;

/**
 * Reference fields a planned-order event carries (the MRP-run explosion output).
 * `order_type` splits make (production) vs buy (purchase); a PROCUREMENT consumer
 * only acts on `buy`. `quantity` is a decimal string (fractional UoM stays exact);
 * `lead_time_days` is the integer procurement lead time the run used, so
 * `suggested_release_date == need_by_date - lead_time_days`. `planner_party_id` is
 * the person who owns the demand (person-centric, opaque party ref).
 */
export interface PlannedOrderRef {
  readonly planned_order_id: string;
  readonly mrp_run_id: string;
  readonly item_id: string;
  readonly order_type: PlannedOrderType;
  readonly quantity: string;
  readonly uom: string;
  /** When the demand needs the item (ISO-8601). */
  readonly need_by_date: string;
  /** need_by_date minus lead time - when a buy must be released (ISO-8601). */
  readonly suggested_release_date: string;
  /** Procurement lead time in days the run applied (integer >= 0). */
  readonly lead_time_days: number;
  readonly warehouse_id: string | null;
  readonly source_demand_ref: string | null;
  readonly planner_party_id: string | null;
}

export type PlannedOrderCreatedEvent = ManufacturingEvent<'PlannedOrderCreated', PlannedOrderRef>;

export type ManufacturingDomainEvent =
  | MoCreatedEvent
  | MoReleasedEvent
  | MoStartedEvent
  | MoDoneEvent
  | WorkOrderStartedEvent
  | WorkOrderCompletedEvent
  | MaterialReservedEvent
  | MaterialConsumedEvent
  | MaterialBackflushedEvent
  | ProductionCompletedEvent
  | PlannedOrderCreatedEvent;

// ── Fail-closed validators ──────────────────────────────────────────────────────

/** The manufacturing event `type` values that are part of the v1 contract. */
const MANUFACTURING_EVENT_TYPES = new Set<string>(
  Object.keys(MANUFACTURING_DOMAIN_EVENT_TOPIC),
);

function requireString(rec: Record<string, unknown>, key: string): void {
  const v = rec[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError(`manufacturing event missing reference field '${key}'`);
  }
}

/**
 * Fail-closed base validation of ANY manufacturing domain event: the SHARED
 * durable envelope (reused base guard) MUST pass AND `type` MUST be a known v1
 * manufacturing topic. Throws (never returns a partially-valid event); narrows
 * `raw` to DomainEventEnvelope on success. This is the guard a consumer runs
 * before dedup - a camelCase-drifted or unknown-type producer fails here.
 */
export function assertManufacturingEnvelope(raw: unknown): asserts raw is DomainEventEnvelope {
  assertDurableEnvelope(raw);
  const type = (raw as DomainEventEnvelope).type;
  if (!MANUFACTURING_EVENT_TYPES.has(type)) {
    throw new TypeError(
      `manufacturing event has unknown type '${type}' (not a v1 manufacturing topic)`,
    );
  }
}

/**
 * Parse an MO lifecycle event fail-closed: durable base + the MoRef reference
 * fields (`manufacturing_order_id`, `order_number`, `item_id`, `quantity`) MUST
 * be present non-empty strings. Returns the typed event or throws.
 */
export function parseMoEvent(raw: unknown): MoCreatedEvent | MoReleasedEvent | MoStartedEvent | MoDoneEvent {
  assertManufacturingEnvelope(raw);
  const rec = raw as unknown as Record<string, unknown>;
  for (const key of ['manufacturing_order_id', 'order_number', 'item_id', 'quantity']) {
    requireString(rec, key);
  }
  return raw as MoCreatedEvent | MoReleasedEvent | MoStartedEvent | MoDoneEvent;
}

/**
 * Parse a work-order event fail-closed: durable base + `work_order_id`,
 * `manufacturing_order_id`, `work_center_id` MUST be present non-empty strings.
 */
export function parseWorkOrderEvent(raw: unknown): WorkOrderStartedEvent | WorkOrderCompletedEvent {
  assertManufacturingEnvelope(raw);
  const rec = raw as unknown as Record<string, unknown>;
  for (const key of ['work_order_id', 'manufacturing_order_id', 'work_center_id']) {
    requireString(rec, key);
  }
  return raw as WorkOrderStartedEvent | WorkOrderCompletedEvent;
}

/**
 * Parse a material movement event fail-closed: durable base + `manufacturing_
 * order_id`, `item_id`, `warehouse_id`, `quantity` MUST be present non-empty
 * strings. Covers reserved / consumed / backflushed (shared MaterialRef).
 */
export function parseMaterialEvent(
  raw: unknown,
): MaterialReservedEvent | MaterialConsumedEvent | MaterialBackflushedEvent {
  assertManufacturingEnvelope(raw);
  const rec = raw as unknown as Record<string, unknown>;
  for (const key of ['manufacturing_order_id', 'item_id', 'warehouse_id', 'quantity']) {
    requireString(rec, key);
  }
  return raw as MaterialReservedEvent | MaterialConsumedEvent | MaterialBackflushedEvent;
}

/**
 * Parse a planned-order event fail-closed (MRP-14 replenishment hand-off): durable
 * base + `planned_order_id`, `mrp_run_id`, `item_id`, `quantity`, `uom`,
 * `need_by_date`, `suggested_release_date` MUST be present non-empty strings;
 * `order_type` MUST be `make | buy`; `lead_time_days` MUST be a non-negative
 * integer. This is the guard a PROCUREMENT consumer runs before it turns a planned
 * BUY into a requisition line - a camelCase/typed drift fails here, never
 * downstream. Returns the typed event or throws.
 */
export function parsePlannedOrderEvent(raw: unknown): PlannedOrderCreatedEvent {
  assertManufacturingEnvelope(raw);
  const rec = raw as unknown as Record<string, unknown>;
  for (const key of [
    'planned_order_id',
    'mrp_run_id',
    'item_id',
    'quantity',
    'uom',
    'need_by_date',
    'suggested_release_date',
  ]) {
    requireString(rec, key);
  }
  if (rec.order_type !== 'make' && rec.order_type !== 'buy') {
    throw new TypeError(
      `manufacturing planned-order event has invalid order_type '${String(rec.order_type)}' (expected 'make' | 'buy')`,
    );
  }
  const lead = rec.lead_time_days;
  if (typeof lead !== 'number' || !Number.isInteger(lead) || lead < 0) {
    throw new RangeError(
      `manufacturing planned-order event 'lead_time_days' must be a non-negative integer, got '${String(lead)}'`,
    );
  }
  return raw as PlannedOrderCreatedEvent;
}

// ── Message build (mirror of inventory-core buildInventoryDomainMessage) ─────────

export interface ManufacturingEventMessage {
  readonly topic: string;
  readonly key: string;
  readonly value: string;
  readonly headers: Record<string, string>;
}

/** Stamp the shared base fields onto a manufacturing event body. */
export function manufacturingBaseFields(
  tenantId: string,
  type: ManufacturingDomainEventType,
  occurredAt: string = new Date().toISOString(),
  eventId: string = randomUUID(),
): DomainEventEnvelope {
  return { type, event_id: eventId, tenant_id: tenantId, occurred_at: occurredAt };
}

/**
 * Stable partition key: sha256(tenantId || ':' || aggregateId) hex, so an MO's
 * whole lifecycle (its MO + work-order + material events, keyed by the MO id)
 * lands on one partition and stays ordered. Identical algorithm to inventory-core
 * so a consumer reads one partitioning scheme across the neutral event plane.
 */
export function manufacturingPartitionKey(tenantId: string, aggregateId: string): string {
  return createHash('sha256').update(`${tenantId}:${aggregateId}`).digest('hex');
}

/**
 * Build a wire-ready message from an already-shaped typed payload. `aggregateId`
 * is the partition subject (the MO id for MO / work-order / material / production
 * events, so the whole order stays ordered). Headers mirror the trace/ordering
 * fields so a consumer need not parse the body to route or dedup.
 */
export function buildManufacturingMessage(
  payload: ManufacturingDomainEvent,
  aggregateId: string,
  correlationId: string,
): ManufacturingEventMessage {
  return {
    topic: MANUFACTURING_DOMAIN_EVENT_TOPIC[payload.type],
    key: manufacturingPartitionKey(payload.tenant_id, aggregateId),
    value: JSON.stringify(payload),
    headers: {
      event_type: payload.type,
      event_id: payload.event_id,
      tenant_id: payload.tenant_id,
      aggregate_id: aggregateId,
      correlation_id: correlationId,
      occurred_at: payload.occurred_at,
    },
  };
}
