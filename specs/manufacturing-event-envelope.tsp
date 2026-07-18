// TypeSpec manufacturing-event-envelope contract for @curaos/contracts.
//
// THE versioned durable domain events a neutral manufacturing-core-service emits
// over the MRP lifecycle, so a downstream consumer (inventory reservation +
// consumption, procurement replenishment, accounting WIP/finished-goods
// valuation, or a shop-floor dashboard) subscribes to a STABLE contract and
// deduplicates exactly-once on ONE key. Promotes the inventory-core
// manufacturing-LIGHT scaffold (only kit assemble/disassemble stock movements)
// to the full MO / work-order / material / production event set.
//
// REUSE ([[curaos-reuse-dry-rule]]): every event `is` the SHARED durable base
// envelope (DomainEventEnvelope from party-event-envelope.tsp - the ONE
// snake_case base event_id / tenant_id / occurred_at + `type`) plus that topic's
// reference fields, exactly the PartyEvent<Ref> seam. `event_id` EQUALS the
// DomainOutbox idempotency key a consumer dedups on. Runtime mirror:
// src/manufacturing-event-types.ts.
//
// Topic namespace mirrors inventory-core: curaos.core.manufacturing.<resource>.
// <action>.v1 . NEVER rename a `.v1` channel - add a `.v2` per
// [[curaos-rolling-update-rule]]; the version suffix is the backward-compat seam.
//
// PHI/PII BOUNDARY: NEUTRAL. Every payload is reference-only - opaque `item_id`,
// and a PERSON on the shop floor is an opaque `party_id`, never a name or PHI.
//
// Entity-only contract: no REST operations, so no @route ops here.

import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "CuraOS Manufacturing Event Envelope" })
namespace CuraOS.Contracts.ManufacturingEvent;

@doc("The shared durable base every manufacturing.* event carries (reused shape).")
model DomainEventEnvelope {
  @doc("The event discriminant (e.g. 'MoCreated', 'WorkOrderCompleted').")
  type: string;
  @doc("Exactly-once idempotency key; equals the DomainOutbox key a consumer dedups on.")
  event_id: string;
  @doc("Tenant the event belongs to. Never used to widen scope on the consumer side.")
  tenant_id: string;
  @doc("When the event occurred.")
  occurred_at: utcDateTime;
}

@doc("A manufacturing topic event: the durable base plus that topic's reference fields.")
model ManufacturingEvent<Ref> {
  ...DomainEventEnvelope;
  ...Ref;
}

@doc("MO lifecycle: created / released / started / done. References the ONE order.")
model MoEvent is ManufacturingEvent<{
  @doc("Opaque id of the manufacturing order.")
  manufacturing_order_id: string;
  @doc("Human order number (shop-floor clarity).")
  order_number: string;
  @doc("The finished-good item the order produces.")
  item_id: string;
  @doc("Planned build quantity (decimal string; exact on the wire).")
  quantity: string;
  @doc("Person-centric owner/supervisor of the order (opaque party ref; null = unassigned).")
  responsible_party_id: string | null;
}>;

@doc("A per-operation work-order job card started/completed on the shop floor.")
model WorkOrderEvent is ManufacturingEvent<{
  @doc("Opaque id of the work-order job card.")
  work_order_id: string;
  @doc("The parent manufacturing order.")
  manufacturing_order_id: string;
  @doc("1-based routing operation order.")
  sequence: int32;
  @doc("Work-center the operation ran on.")
  work_center_id: string;
  @doc("Person-centric operator on the job card (opaque party ref; null = unassigned).")
  operator_party_id: string | null;
}>;

@doc("A material movement: reserved / consumed / backflushed against an order.")
model MaterialEvent is ManufacturingEvent<{
  @doc("The parent manufacturing order.")
  manufacturing_order_id: string;
  @doc("The operation it happened at (null for an MO-level reservation).")
  work_order_id: string | null;
  @doc("The COMPONENT item moved.")
  item_id: string;
  @doc("Warehouse the movement drew from.")
  warehouse_id: string;
  @doc("Component quantity moved (decimal string).")
  quantity: string;
  @doc("Traced lot (null if untracked).")
  lot_id: string | null;
}>;

@doc("The MRP-run explosion output: a planned make/buy order netted from a demand shortfall. A procurement consumer turns each buy into a purchase requisition line (MRP-14).")
model PlannedOrderEvent is ManufacturingEvent<{
  @doc("Opaque id of the planned order suggestion.")
  planned_order_id: string;
  @doc("The MRP run that produced this suggestion.")
  mrp_run_id: string;
  @doc("The item to make or buy.")
  item_id: string;
  @doc("make (produce, needs a BOM) or buy (purchase). A procurement consumer acts only on buy.")
  order_type: string;
  @doc("Net requirement quantity (decimal string; exact on the wire).")
  quantity: string;
  @doc("Unit of measure.")
  uom: string;
  @doc("When the demand needs the item.")
  need_by_date: string;
  @doc("need_by_date minus lead time - when a buy must be released.")
  suggested_release_date: string;
  @doc("Procurement lead time in days the run applied (integer >= 0).")
  lead_time_days: int32;
  @doc("Warehouse the requirement is netted for (null = tenant-wide).")
  warehouse_id: string | null;
  @doc("Upstream demand reference (e.g. the MO id) that drove the requirement.")
  source_demand_ref: string | null;
  @doc("Person-centric owner of the demand (opaque party ref; null = unassigned).")
  planner_party_id: string | null;
}>;

@doc("Finished goods produced and received into stock (the goods-in leg of MO completion).")
model ProductionCompletedEvent is ManufacturingEvent<{
  @doc("The completed manufacturing order.")
  manufacturing_order_id: string;
  @doc("The FINISHED good item produced.")
  item_id: string;
  @doc("Warehouse the finished goods landed in.")
  warehouse_id: string;
  @doc("Units produced (decimal string).")
  produced_quantity: string;
  @doc("Produced lot (null if untracked).")
  lot_id: string | null;
}>;
