import { describe, expect, test } from 'bun:test';
import {
  assertDurableEnvelope,
  parsePartyLifecycleEvent,
  type PartyLifecycleEvent,
} from './party-event-types';

// A correct snake_case durable party.registered event.
const durable = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'party.registered',
  event_id: 'evt-1',
  tenant_id: 'tenant-1',
  occurred_at: '2026-07-16T12:00:00.000Z',
  party_id: 'party-42',
  ...over,
});

describe('assertDurableEnvelope', () => {
  test('accepts the snake_case durable base envelope', () => {
    expect(() => assertDurableEnvelope(durable())).not.toThrow();
  });

  // RED WITHOUT FIX: the whole reason this mold exists. A camelCase-drifted
  // producer (eventId/tenantId/occurredAt) is missing the durable snake_case
  // keys the strict consumer dedups on. Before this contract, the drift was
  // accepted and the consumer never deduplicated. It MUST now be rejected.
  test('rejects a camelCase-drifted producer (missing event_id)', () => {
    const drifted = {
      type: 'party.registered',
      eventId: 'evt-1',
      tenantId: 'tenant-1',
      occurredAt: '2026-07-16T12:00:00.000Z',
      partyId: 'party-42',
    };
    expect(() => assertDurableEnvelope(drifted)).toThrow(/event_id/);
  });

  test('rejects an empty-string base key', () => {
    expect(() => assertDurableEnvelope(durable({ event_id: '' }))).toThrow(/event_id/);
  });

  test('rejects a non-object', () => {
    expect(() => assertDurableEnvelope(null)).toThrow();
    expect(() => assertDurableEnvelope('party.registered')).toThrow();
  });

  test('rejects an unparseable occurred_at instead of accepting garbage', () => {
    expect(() => assertDurableEnvelope(durable({ occurred_at: 'not-a-date' }))).toThrow(
      /occurred_at.*ISO-8601/,
    );
  });
});

describe('parsePartyLifecycleEvent', () => {
  test('returns the typed event when party_id is present', () => {
    const e: PartyLifecycleEvent = parsePartyLifecycleEvent(durable());
    expect(e.party_id).toBe('party-42');
    expect(e.event_id).toBe('evt-1');
  });

  test('fails closed when party_id is absent', () => {
    const { party_id: _omit, ...noParty } = durable();
    expect(() => parsePartyLifecycleEvent(noParty)).toThrow(/party_id/);
  });
});
