// Runtime TypeScript mirror of specs/manufacturing-entities.tsp.
//
// THE durable v1 entity contracts for neutral manufacturing (MRP): the wire
// shapes a manufacturing-core-service OWNS and a downstream consumer (inventory
// reservation, procurement replenishment, accounting WIP valuation, or a
// shop-floor app) reads WITHOUT pulling the service generator. Promotes the
// shipped inventory-core manufacturing-LIGHT scaffold (single-level kit BOM +
// assemble/disassemble) toward full Odoo-mrp / ERPNext work_order parity:
// work-center, routing/operation, MULTI-LEVEL bill-of-materials,
// manufacturing-order (MO), per-operation work-order job cards,
// item-planning-master, and the MRP-run -> planned-order explosion.
//
// snake_case WIRE vocabulary is the contract (a camelCase producer is the drift
// this mold rejects, exactly as party-event-types.ts documents). Money is MINOR
// UNITS as a string (never a float) with an ISO-4217 currency; durations are
// integer minutes; quantities are decimal STRINGS so a fractional UoM (2.5 kg)
// stays exact on the wire.
//
// PHI/PII BOUNDARY (AGENTS.md §3, BINDING): NEUTRAL layer. Every field is a
// reference or a non-PHI attribute. Items anchor to an inventory/commerce SKU by
// opaque `item_id`; a PERSON on the shop floor (operator, planner, responsible)
// is referenced ONLY by an opaque `party_id`, never a name or PHI. Patient
// linkage, if any overlay needs it, stays in the overlay schema.

// ── Enums ─────────────────────────────────────────────────────────────────────

/** Lifecycle of a manufacturing order (MO). Terminal: `done` | `cancelled`. */
export type ManufacturingOrderState =
  | 'draft'
  | 'planned'
  | 'released'
  | 'in_progress'
  | 'done'
  | 'cancelled';

/** Lifecycle of a per-operation work-order job card. Terminal: `done` | `cancelled`. */
export type WorkOrderState =
  | 'pending'
  | 'ready'
  | 'started'
  | 'paused'
  | 'done'
  | 'cancelled';

/** Lifecycle of an MRP planning run. Terminal: `completed` | `failed`. */
export type MrpRunState = 'running' | 'completed' | 'failed';

/** A planning item is MADE in-house (`make`, needs a BOM) or BOUGHT (`buy`). */
export type MakeOrBuy = 'make' | 'buy';

/** A planned order the MRP explosion suggests: a make (production) or buy (purchase). */
export type PlannedOrderType = MakeOrBuy;

/**
 * Lot-sizing policy the planner applies when netting demand into planned orders:
 * `lot_for_lot` (one order per net requirement), `fixed` (fixed `reorder_quantity`
 * multiples), or `min_max` (order up to a max when below the reorder point).
 */
export type LotSizePolicy = 'lot_for_lot' | 'fixed' | 'min_max';

// ── Master data ───────────────────────────────────────────────────────────────

/**
 * A work-center: a shop-floor resource/station where operations run (Odoo
 * `mrp.workcenter` / ERPNext `Workstation`). `cost_per_hour_minor` is minor
 * units (string) in `currency`; `capacity_per_hour` is a decimal string of
 * output units. `default_operator_party_id` is the person usually stationed
 * here (person-centric, opaque party ref).
 */
export interface WorkCenter {
  readonly id: string;
  readonly tenant_id: string;
  readonly code: string;
  readonly name: string;
  readonly capacity_per_hour: string | null;
  readonly cost_per_hour_minor: string | null;
  readonly currency: string | null;
  /** Overall-equipment-effectiveness target as a 0..1 decimal string (null = untracked). */
  readonly oee_target: string | null;
  readonly default_operator_party_id: string | null;
  readonly is_active: boolean;
}

/**
 * A reusable operation definition (Odoo `mrp.routing.workcenter` template /
 * ERPNext `Operation`): a named step with a default work-center and expected
 * per-unit timing. Durations are integer minutes.
 */
export interface Operation {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly work_center_id: string;
  readonly setup_minutes: number;
  readonly run_minutes_per_unit: number;
  readonly teardown_minutes: number;
}

/**
 * One ordered step of a routing. `sequence` is the 1-based execution order.
 * `operation_id` optionally references a reusable Operation template; a routing
 * step may also inline its own name + timing. Each step names the work-center it
 * runs on so a work-order job card can be emitted per step.
 */
export interface RoutingOperation {
  readonly sequence: number;
  readonly operation_id: string | null;
  readonly work_center_id: string;
  readonly name: string;
  readonly setup_minutes: number;
  readonly run_minutes_per_unit: number;
}

/**
 * A routing: the ordered operation sequence to make an item (Odoo `mrp.routing`
 * folded into the BOM / ERPNext `Routing`). `item_id` is the produced SKU.
 */
export interface Routing {
  readonly id: string;
  readonly tenant_id: string;
  readonly code: string;
  readonly name: string;
  readonly item_id: string;
  readonly operations: readonly RoutingOperation[];
  readonly is_active: boolean;
}

/**
 * One component line of a bill-of-materials. `quantity_per` is the decimal-string
 * quantity of `component_item_id` consumed per BOM batch (`Bom.quantity` units of
 * the parent). `is_sub_assembly` marks a MULTI-LEVEL line: the component is
 * itself a manufactured item with its own BOM (the recursion the LIGHT scaffold
 * lacked). `operation_sequence` optionally pins WHICH routing step consumes the
 * line (the backflush point). `scrap_pct` is an expected-scrap uplift (0..100
 * decimal string).
 */
export interface BomLine {
  readonly component_item_id: string;
  readonly quantity_per: string;
  readonly uom: string;
  readonly is_sub_assembly: boolean;
  readonly operation_sequence: number | null;
  readonly scrap_pct: string | null;
}

/**
 * A bill-of-materials: the recipe producing `quantity` units of `item_id` from
 * its component `lines` (Odoo `mrp.bom` / ERPNext `BOM`). MULTI-LEVEL: a line
 * with `is_sub_assembly=true` references a component that has its OWN BOM, so an
 * MRP explosion recurses through sub-assemblies. `version` + `is_active` let a
 * new revision supersede an old one per the rolling-update rule (never mutate a
 * released BOM in place). `routing_id` optionally binds the operation sequence.
 */
export interface BillOfMaterials {
  readonly id: string;
  readonly tenant_id: string;
  readonly code: string;
  readonly item_id: string;
  readonly quantity: string;
  readonly uom: string;
  readonly routing_id: string | null;
  readonly version: number;
  readonly is_active: boolean;
  readonly lines: readonly BomLine[];
}

/**
 * Per-item MRP planning parameters (Odoo `stock.warehouse.orderpoint` +
 * `make_to_order` route / ERPNext item reorder + `Item.default_bom`). Drives the
 * MRP run's net-requirement + lot-sizing math. `make_or_buy` decides whether a
 * net requirement becomes a make (production) or buy (purchase) planned order.
 * `planner_party_id` is the responsible planner (person-centric, opaque ref).
 * Reorder quantities are decimal strings; `lead_time_days` is an integer.
 */
export interface ItemPlanningMaster {
  readonly id: string;
  readonly tenant_id: string;
  readonly item_id: string;
  readonly warehouse_id: string | null;
  readonly make_or_buy: MakeOrBuy;
  readonly reorder_point: string;
  readonly reorder_quantity: string;
  readonly min_order_qty: string | null;
  readonly safety_stock: string;
  readonly lead_time_days: number;
  readonly lot_size: LotSizePolicy;
  readonly default_bom_id: string | null;
  readonly planner_party_id: string | null;
}

// ── Orders ────────────────────────────────────────────────────────────────────

/**
 * A manufacturing order (MO): an order to produce `quantity` of `item_id` per
 * `bom_id` (Odoo `mrp.production` / ERPNext `Work Order` header). `warehouse_id`
 * is where finished goods land. `source_planned_order_id` links back to the MRP
 * planned order that spawned it (null for a manual MO). `responsible_party_id` is
 * the owning planner/supervisor (person-centric, opaque ref). Timestamps are
 * ISO-8601 UTC; `actual_*` are null until the MO starts/finishes.
 */
export interface ManufacturingOrder {
  readonly id: string;
  readonly tenant_id: string;
  readonly order_number: string;
  readonly item_id: string;
  readonly bom_id: string;
  readonly routing_id: string | null;
  readonly quantity: string;
  readonly uom: string;
  readonly warehouse_id: string;
  readonly state: ManufacturingOrderState;
  readonly planned_start: string | null;
  readonly planned_finish: string | null;
  readonly actual_start: string | null;
  readonly actual_finish: string | null;
  readonly source_planned_order_id: string | null;
  readonly responsible_party_id: string | null;
}

/**
 * A work-order job card: ONE per routing operation of an MO (Odoo
 * `mrp.workorder` / ERPNext `Job Card`). This is the shop-floor unit the LIGHT
 * scaffold entirely lacked. `operator_party_id` is the assigned/clocked-in
 * operator (person-centric, opaque ref); `done_qty` accrues as units clear this
 * operation. `duration_minutes` is the actual clocked run once finished.
 */
export interface WorkOrder {
  readonly id: string;
  readonly tenant_id: string;
  readonly manufacturing_order_id: string;
  readonly sequence: number;
  readonly operation_id: string | null;
  readonly work_center_id: string;
  readonly name: string;
  readonly state: WorkOrderState;
  readonly planned_qty: string;
  readonly done_qty: string;
  readonly operator_party_id: string | null;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly duration_minutes: number | null;
}

// ── Planning ──────────────────────────────────────────────────────────────────

/**
 * An MRP planning run: one explosion of demand over `planning_horizon_days` into
 * `planned_order_count` suggested orders. `triggered_by_party_id` is the person
 * who launched it (person-centric, opaque ref). Timestamps ISO-8601 UTC.
 */
export interface MrpRun {
  readonly id: string;
  readonly tenant_id: string;
  readonly run_number: string;
  readonly planning_horizon_days: number;
  readonly state: MrpRunState;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly triggered_by_party_id: string | null;
  readonly planned_order_count: number;
}

/**
 * A planned order: a make/buy suggestion the MRP run nets out (Odoo
 * `mrp.production` in `draft` / `purchase.order` proposal / ERPNext `Production
 * Plan` item). `is_firmed` flips to true once a planner confirms it (only then
 * may it become a real MO or PO). `need_by_date` is when the demand needs it;
 * `suggested_release_date` = need_by minus lead time. `bom_id` is set for a make.
 */
export interface PlannedOrder {
  readonly id: string;
  readonly tenant_id: string;
  readonly mrp_run_id: string;
  readonly item_id: string;
  readonly order_type: PlannedOrderType;
  readonly quantity: string;
  readonly uom: string;
  readonly need_by_date: string;
  readonly suggested_release_date: string;
  readonly source_demand_ref: string | null;
  readonly bom_id: string | null;
  readonly is_firmed: boolean;
}

// ── Fail-closed schema guard ──────────────────────────────────────────────────

/**
 * Parse a decimal-string quantity fail-closed. A quantity on the wire is a
 * STRING (so a fractional UoM stays exact) that MUST parse to a finite positive
 * number. Throws on empty / non-numeric / non-positive. Returned as a number for
 * the caller's arithmetic; the wire keeps the exact string.
 */
export function parsePositiveQuantity(raw: unknown, field = 'quantity'): number {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new TypeError(`manufacturing ${field} must be a non-empty decimal string`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new RangeError(`manufacturing ${field} must be a finite positive number, got '${raw}'`);
  }
  return n;
}

/**
 * Fail-closed structural validation of a bill-of-materials BEFORE it is released
 * or exploded. Enforces the invariants the LIGHT single-level scaffold enforced
 * inline, now at the contract boundary so a MULTI-LEVEL BOM producer and a
 * downstream MRP consumer agree on them:
 *   - at least one component line (an empty BOM produces nothing),
 *   - every `quantity_per` is a positive decimal string,
 *   - no line consumes the parent item itself (direct self-reference -> infinite
 *     explosion),
 *   - no duplicate component line (two lines for the same component is an
 *     ambiguous net requirement; merge them first).
 * NOTE: this guards ONE BOM's direct lines. A deeper sub-assembly CYCLE
 * (A -> B -> A) is a graph property the exploding service checks with the full
 * BOM set in hand; this contract cannot see other BOMs, so it guards only the
 * direct self-reference that is checkable from a single BOM.
 * Throws (never returns partially valid); narrows `raw` to BillOfMaterials.
 */
export function assertBomWellFormed(raw: unknown): asserts raw is BillOfMaterials {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError('bill-of-materials must be an object');
  }
  const bom = raw as Record<string, unknown>;
  if (typeof bom.item_id !== 'string' || bom.item_id.length === 0) {
    throw new TypeError("bill-of-materials missing 'item_id'");
  }
  const lines = bom.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new TypeError('bill-of-materials must have at least one component line');
  }
  const seen = new Set<string>();
  for (const line of lines as BomLine[]) {
    const componentId = (line as { component_item_id?: unknown }).component_item_id;
    if (typeof componentId !== 'string' || componentId.length === 0) {
      throw new TypeError('bill-of-materials line missing component_item_id');
    }
    parsePositiveQuantity((line as { quantity_per?: unknown }).quantity_per, 'quantity_per');
    if (componentId === bom.item_id) {
      throw new RangeError(
        `bill-of-materials line references the parent item '${componentId}' (self-reference)`,
      );
    }
    if (seen.has(componentId)) {
      throw new RangeError(`bill-of-materials has a duplicate component line for '${componentId}'`);
    }
    seen.add(componentId);
  }
}
