import { describe, expect, test } from 'bun:test';
import {
  MANUFACTURING_DOMAIN_EVENT_TOPIC,
  MANUFACTURING_PLANNED_ORDER_CREATED_TOPIC,
  assertManufacturingEnvelope,
  buildManufacturingMessage,
  manufacturingBaseFields,
  manufacturingPartitionKey,
  parseMaterialEvent,
  parseMoEvent,
  parsePlannedOrderEvent,
  parseWorkOrderEvent,
  type ManufacturingDomainEvent,
  type ManufacturingDomainEventType,
} from './manufacturing-event-types';

const base = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'MoCreated',
  event_id: 'evt-1',
  tenant_id: 'tenant-1',
  occurred_at: '2026-07-18T12:00:00.000Z',
  ...over,
});

const moEvent = (over: Record<string, unknown> = {}): Record<string, unknown> =>
  base({
    type: 'MoCreated',
    manufacturing_order_id: 'mo-1',
    order_number: 'MO-0001',
    item_id: 'item-fg',
    quantity: '10',
    responsible_party_id: 'party-planner',
    ...over,
  });

describe('MANUFACTURING_DOMAIN_EVENT_TOPIC', () => {
  test('every event type maps to a distinct versioned topic', () => {
    const topics = Object.values(MANUFACTURING_DOMAIN_EVENT_TOPIC);
    expect(topics.length).toBe(11);
    expect(new Set(topics).size).toBe(topics.length);
    for (const topic of topics) {
      expect(topic).toMatch(/^curaos\.core\.manufacturing\.[a-z_]+\.[a-z_]+\.v1$/);
    }
  });
});

describe('assertManufacturingEnvelope', () => {
  test('accepts a known snake_case manufacturing event', () => {
    expect(() => assertManufacturingEnvelope(moEvent())).not.toThrow();
  });

  // RED WITHOUT FIX: the whole reason the guard exists - a camelCase producer
  // (eventId) is missing the durable snake_case base the consumer dedups on.
  test('rejects a camelCase drift', () => {
    const drifted = moEvent();
    drifted.eventId = drifted.event_id;
    delete drifted.event_id;
    expect(() => assertManufacturingEnvelope(drifted)).toThrow(/event_id/);
  });

  test('rejects an unknown event type', () => {
    expect(() => assertManufacturingEnvelope(base({ type: 'MoTeleported' }))).toThrow(
      /unknown type/,
    );
  });

  test('rejects a non-ISO occurred_at', () => {
    expect(() => assertManufacturingEnvelope(moEvent({ occurred_at: 'yesterday' }))).toThrow();
  });
});

describe('parseMoEvent', () => {
  test('parses a complete MO event', () => {
    expect(parseMoEvent(moEvent()).manufacturing_order_id).toBe('mo-1');
  });

  test.each(['manufacturing_order_id', 'order_number', 'item_id', 'quantity'])(
    'rejects a missing %s',
    (key) => {
      const bad = moEvent();
      delete bad[key];
      expect(() => parseMoEvent(bad)).toThrow(new RegExp(key));
    },
  );
});

describe('parseWorkOrderEvent', () => {
  const wo = (over: Record<string, unknown> = {}) =>
    base({
      type: 'WorkOrderStarted',
      work_order_id: 'wo-1',
      manufacturing_order_id: 'mo-1',
      sequence: 1,
      work_center_id: 'wc-1',
      operator_party_id: 'party-op',
      ...over,
    });

  test('parses a work-order event', () => {
    expect(parseWorkOrderEvent(wo()).work_order_id).toBe('wo-1');
  });

  test('rejects a missing work_center_id', () => {
    const bad = wo();
    delete bad.work_center_id;
    expect(() => parseWorkOrderEvent(bad)).toThrow(/work_center_id/);
  });
});

describe('parseMaterialEvent', () => {
  const mat = (over: Record<string, unknown> = {}) =>
    base({
      type: 'MaterialConsumed',
      manufacturing_order_id: 'mo-1',
      work_order_id: 'wo-1',
      item_id: 'item-comp',
      warehouse_id: 'wh-1',
      quantity: '4',
      lot_id: null,
      ...over,
    });

  test('parses a material event', () => {
    expect(parseMaterialEvent(mat()).item_id).toBe('item-comp');
  });

  test('rejects a missing warehouse_id', () => {
    const bad = mat();
    delete bad.warehouse_id;
    expect(() => parseMaterialEvent(bad)).toThrow(/warehouse_id/);
  });
});

describe('parsePlannedOrderEvent', () => {
  const planned = (over: Record<string, unknown> = {}) =>
    base({
      type: 'PlannedOrderCreated',
      planned_order_id: 'po-1',
      mrp_run_id: 'run-1',
      item_id: 'item-comp-leg',
      order_type: 'buy',
      quantity: '40',
      uom: 'ea',
      need_by_date: '2026-08-01',
      suggested_release_date: '2026-07-25',
      lead_time_days: 7,
      warehouse_id: 'wh-1',
      source_demand_ref: 'mo-1',
      planner_party_id: 'party-planner',
      ...over,
    });

  test('maps to a distinct versioned topic', () => {
    expect(MANUFACTURING_DOMAIN_EVENT_TOPIC.PlannedOrderCreated).toBe(
      MANUFACTURING_PLANNED_ORDER_CREATED_TOPIC,
    );
  });

  test('parses a complete buy planned-order event', () => {
    const ev = parsePlannedOrderEvent(planned());
    expect(ev.order_type).toBe('buy');
    expect(ev.quantity).toBe('40');
    expect(ev.lead_time_days).toBe(7);
  });

  test('parses a make planned-order event', () => {
    expect(parsePlannedOrderEvent(planned({ order_type: 'make' })).order_type).toBe('make');
  });

  test.each([
    'planned_order_id',
    'mrp_run_id',
    'item_id',
    'quantity',
    'uom',
    'need_by_date',
    'suggested_release_date',
  ])('rejects a missing %s', (key) => {
    const bad = planned();
    delete bad[key];
    expect(() => parsePlannedOrderEvent(bad)).toThrow(new RegExp(key));
  });

  test('rejects an invalid order_type', () => {
    expect(() => parsePlannedOrderEvent(planned({ order_type: 'lease' }))).toThrow(/order_type/);
  });

  test.each([-1, 1.5, '7', Number.NaN])('rejects a non-integer lead_time_days: %p', (lead) => {
    expect(() => parsePlannedOrderEvent(planned({ lead_time_days: lead }))).toThrow(
      /lead_time_days/,
    );
  });
});

describe('buildManufacturingMessage', () => {
  test('routes to the topic + keeps an MO ordered on one partition', () => {
    const payload = {
      ...manufacturingBaseFields('tenant-1', 'ProductionCompleted'),
      type: 'ProductionCompleted',
      manufacturing_order_id: 'mo-1',
      item_id: 'item-fg',
      warehouse_id: 'wh-1',
      produced_quantity: '10',
      lot_id: null,
    } as ManufacturingDomainEvent;

    const msg = buildManufacturingMessage(payload, 'mo-1', 'corr-1');
    expect(msg.topic).toBe('curaos.core.manufacturing.production.completed.v1');
    expect(msg.headers.event_type).toBe('ProductionCompleted');
    expect(msg.headers.correlation_id).toBe('corr-1');
    // Same (tenant, aggregate) -> same partition key (per-MO ordering).
    expect(msg.key).toBe(manufacturingPartitionKey('tenant-1', 'mo-1'));
    expect(JSON.parse(msg.value).produced_quantity).toBe('10');
  });
});

describe('manufacturingBaseFields', () => {
  test('stamps a fresh event_id + the requested type', () => {
    const type: ManufacturingDomainEventType = 'MoStarted';
    const a = manufacturingBaseFields('tenant-1', type);
    const b = manufacturingBaseFields('tenant-1', type);
    expect(a.type).toBe('MoStarted');
    expect(a.event_id).not.toBe(b.event_id);
  });
});
