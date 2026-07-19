// Proves HORIZON-unified-schema-family-S1's acceptance: each of the 5 config-
// node kinds parses through the discriminated-union root, and an unknown
// `kind` is rejected.
import { describe, expect, test } from 'bun:test';
import { ConfigNode, parseConfigNode } from './config-node';

const FIXTURES: Record<ConfigNode['kind'], unknown> = {
  ui: { kind: 'ui' }, // UiConfig's own fields all default/optional (UIGEN-2)
  service: {
    kind: 'service',
    contract: { tables: [], wireModels: [] },
    capabilities: {
      tenancy: 'schema-per-tenant',
      phi: 'redacted',
      auth: 'jwt',
      pagination: 'cursor',
      ownership: ['self'],
      events: 'outbox',
      streaming: 'none',
      idempotent: true,
    },
  },
  workflow: {
    kind: 'workflow',
    id: 'wf-1',
    version: '1.0.0',
    metadata: { name: 'trip-composition' },
    context: {},
    graph: { nodes: [], edges: [] },
  },
  search: {
    kind: 'search',
    service: 'task-core-service',
    domain: 'tasks',
    alias: '{tenant}.tasks.task',
    fields: ['title', 'status'],
    tenancy: 'schema-per-tenant',
  },
  sync: {
    kind: 'sync',
    mode: 'live-read-subscription',
    scope: ['tasks'],
    permissionPredicate: 'task-owner-or-assignee',
  },
};

describe('ConfigNode discriminated union (HORIZON-unified-schema-family-S1)', () => {
  for (const kind of Object.keys(FIXTURES) as ConfigNode['kind'][]) {
    test(`${kind} kind parses`, () => {
      const parsed = parseConfigNode(FIXTURES[kind]);
      expect(parsed.kind).toBe(kind);
    });
  }

  test('all 5 kinds are exhaustively covered (no drift against the union options)', () => {
    expect(new Set(Object.keys(FIXTURES)).size).toBe(5);
  });

  test('unrecognized kind is rejected', () => {
    expect(() => parseConfigNode({ kind: 'bogus' })).toThrow();
  });

  test('missing kind is rejected', () => {
    expect(() => parseConfigNode({})).toThrow();
  });

  test('a kind-mismatched payload is rejected (search shape under kind: "sync")', () => {
    expect(() =>
      parseConfigNode({ kind: 'sync', service: 'x', domain: 'y', alias: 'z', fields: [], tenancy: 'schema-per-tenant' }),
    ).toThrow();
  });
});
