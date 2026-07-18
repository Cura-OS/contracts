// TypeSpec manufacturing-entities contract for @curaos/contracts.
//
// THE durable v1 entity contracts for neutral manufacturing (MRP): the wire
// shapes a manufacturing-core-service OWNS and a downstream consumer reads
// WITHOUT pulling the service generator. Promotes the inventory-core
// manufacturing-LIGHT scaffold (single-level kit BOM + assemble/disassemble)
// toward full Odoo-mrp / ERPNext work_order parity: work-center,
// routing/operation, MULTI-LEVEL bill-of-materials, manufacturing-order (MO),
// per-operation work-order job cards, item-planning-master, MRP-run ->
// planned-order. Runtime mirror: src/manufacturing-types.ts.
//
// snake_case WIRE vocabulary is the contract. Money is MINOR UNITS as a string
// (never a float); durations are integer minutes; quantities are decimal STRINGS
// so a fractional UoM stays exact.
//
// PHI/PII BOUNDARY: NEUTRAL. Items are opaque `item_id`; a PERSON on the shop
// floor (operator, planner, responsible) is an opaque `party_id`, never PHI.
//
// Entity-only contract: no REST operations, so no @route ops here.

import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "CuraOS Manufacturing Entities" })
namespace CuraOS.Contracts.Manufacturing;

enum ManufacturingOrderState { draft, planned, released, in_progress, done, cancelled }
enum WorkOrderState { pending, ready, started, paused, done, cancelled }
enum MrpRunState { running, completed, failed }
enum MakeOrBuy { make, buy }
enum LotSizePolicy { lot_for_lot, fixed, min_max }

@doc("A shop-floor resource/station where operations run.")
model WorkCenter {
  id: string; tenant_id: string; code: string; name: string;
  @doc("Output units per hour (decimal string; null = untracked).")
  capacity_per_hour: string | null;
  @doc("Cost per hour in minor units (string; null = untracked).")
  cost_per_hour_minor: string | null;
  currency: string | null;
  @doc("OEE target as a 0..1 decimal string (null = untracked).")
  oee_target: string | null;
  @doc("Person usually stationed here (opaque party ref).")
  default_operator_party_id: string | null;
  is_active: boolean;
}

@doc("A reusable operation definition: a named step with a default work-center + timing.")
model Operation {
  id: string; tenant_id: string; name: string; work_center_id: string;
  setup_minutes: int32; run_minutes_per_unit: int32; teardown_minutes: int32;
}

@doc("One ordered step of a routing.")
model RoutingOperation {
  sequence: int32; operation_id: string | null; work_center_id: string; name: string;
  setup_minutes: int32; run_minutes_per_unit: int32;
}

@doc("The ordered operation sequence to make an item.")
model Routing {
  id: string; tenant_id: string; code: string; name: string; item_id: string;
  operations: RoutingOperation[]; is_active: boolean;
}

@doc("One component line of a bill-of-materials. is_sub_assembly marks a MULTI-LEVEL line.")
model BomLine {
  component_item_id: string;
  @doc("Quantity of the component consumed per BOM batch (decimal string).")
  quantity_per: string;
  uom: string;
  @doc("True when the component is itself a manufactured item with its own BOM.")
  is_sub_assembly: boolean;
  @doc("Which routing step consumes this line (the backflush point; null = MO-level).")
  operation_sequence: int32 | null;
  @doc("Expected scrap uplift as a 0..100 decimal string (null = none).")
  scrap_pct: string | null;
}

@doc("The recipe producing `quantity` of `item_id`. MULTI-LEVEL via sub-assembly lines.")
model BillOfMaterials {
  id: string; tenant_id: string; code: string; item_id: string;
  quantity: string; uom: string; routing_id: string | null;
  version: int32; is_active: boolean; lines: BomLine[];
}

@doc("Per-item MRP planning parameters driving net-requirement + lot-sizing.")
model ItemPlanningMaster {
  id: string; tenant_id: string; item_id: string; warehouse_id: string | null;
  make_or_buy: MakeOrBuy;
  reorder_point: string; reorder_quantity: string; min_order_qty: string | null;
  safety_stock: string; lead_time_days: int32; lot_size: LotSizePolicy;
  default_bom_id: string | null;
  @doc("Responsible planner (opaque party ref).")
  planner_party_id: string | null;
}

@doc("An order to produce `quantity` of `item_id` per `bom_id`.")
model ManufacturingOrder {
  id: string; tenant_id: string; order_number: string; item_id: string; bom_id: string;
  routing_id: string | null; quantity: string; uom: string; warehouse_id: string;
  state: ManufacturingOrderState;
  planned_start: utcDateTime | null; planned_finish: utcDateTime | null;
  actual_start: utcDateTime | null; actual_finish: utcDateTime | null;
  source_planned_order_id: string | null;
  @doc("Owning planner/supervisor (opaque party ref).")
  responsible_party_id: string | null;
}

@doc("A work-order job card: ONE per routing operation of an MO.")
model WorkOrder {
  id: string; tenant_id: string; manufacturing_order_id: string; sequence: int32;
  operation_id: string | null; work_center_id: string; name: string; state: WorkOrderState;
  planned_qty: string; done_qty: string;
  @doc("Assigned/clocked-in operator (opaque party ref).")
  operator_party_id: string | null;
  started_at: utcDateTime | null; finished_at: utcDateTime | null;
  duration_minutes: int32 | null;
}

@doc("An MRP planning run: one explosion of demand into planned orders.")
model MrpRun {
  id: string; tenant_id: string; run_number: string; planning_horizon_days: int32;
  state: MrpRunState; started_at: utcDateTime; finished_at: utcDateTime | null;
  @doc("Person who launched the run (opaque party ref).")
  triggered_by_party_id: string | null;
  planned_order_count: int32;
}

@doc("A make/buy suggestion the MRP run nets out; is_firmed once a planner confirms it.")
model PlannedOrder {
  id: string; tenant_id: string; mrp_run_id: string; item_id: string;
  order_type: MakeOrBuy; quantity: string; uom: string;
  need_by_date: string; suggested_release_date: string;
  source_demand_ref: string | null; bom_id: string | null; is_firmed: boolean;
}
