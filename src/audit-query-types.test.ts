import { describe, expect, test } from 'bun:test';
import { type AuditEntry, matchesQuery } from './audit-query-types';

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'e1',
  actorId: 'user-1',
  action: 'task.created',
  resourceRef: 'task:42',
  entryHash: 'h1',
  occurredAt: '2026-07-14T12:00:00.000Z',
  ...over,
});

describe('matchesQuery', () => {
  test('empty query matches everything', () => {
    expect(matchesQuery(entry(), {})).toBe(true);
  });
  test('actorId / action / resourceRef are exact-match filters', () => {
    expect(matchesQuery(entry(), { actorId: 'user-1' })).toBe(true);
    expect(matchesQuery(entry(), { actorId: 'user-2' })).toBe(false);
    expect(matchesQuery(entry(), { action: 'consent.revoked' })).toBe(false);
    expect(matchesQuery(entry(), { resourceRef: 'task:42' })).toBe(true);
  });
  test('from is an inclusive lower bound', () => {
    expect(matchesQuery(entry(), { from: '2026-07-14T12:00:00.000Z' })).toBe(true);
    expect(matchesQuery(entry(), { from: '2026-07-14T12:00:00.001Z' })).toBe(false);
  });
  test('to is an exclusive upper bound', () => {
    expect(matchesQuery(entry(), { to: '2026-07-14T12:00:00.000Z' })).toBe(false);
    expect(matchesQuery(entry(), { to: '2026-07-14T12:00:00.001Z' })).toBe(true);
  });
  test('all filters must pass together', () => {
    const q = { actorId: 'user-1', action: 'task.created', from: '2026-07-14T00:00:00.000Z' };
    expect(matchesQuery(entry(), q)).toBe(true);
    expect(matchesQuery(entry({ actorId: 'user-9' }), q)).toBe(false);
  });
});
