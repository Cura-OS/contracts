import { describe, expect, test } from 'bun:test';
import {
  isRetryableConflict,
  optimisticConflict,
  terminalStateConflict,
} from './conflict-types';

describe('optimisticConflict', () => {
  test('always advertises status 409 truthfully', () => {
    const c = optimisticConflict({ expectedVersion: 3, currentVersion: 5 });
    // RED WITHOUT FIX: a Conflict that advertised any other status would be a
    // false contract. Procurement CAS losers MUST map to 409.
    expect(c.statusCode).toBe(409);
    expect(c.body.status).toBe(409);
  });

  test('carries the CAS versions a client re-reads to retry', () => {
    const c = optimisticConflict({ expectedVersion: 3, currentVersion: 5 });
    expect(c.body.reason).toBe('optimistic_concurrency');
    expect(c.body.expected_version).toBe(3);
    expect(c.body.current_version).toBe(5);
    expect(isRetryableConflict(c.body)).toBe(true);
  });
});

describe('terminalStateConflict', () => {
  test('always 409 and marks the conflict non-retryable', () => {
    const c = terminalStateConflict({ currentState: 'cancelled' });
    expect(c.statusCode).toBe(409);
    expect(c.body.status).toBe(409);
    expect(c.body.reason).toBe('terminal_state');
    expect(c.body.current_state).toBe('cancelled');
    // a client MUST NOT retry a terminal-state mutation
    expect(isRetryableConflict(c.body)).toBe(false);
  });

  test('does not leak CAS version fields on a terminal conflict', () => {
    const c = terminalStateConflict({ currentState: 'matched' });
    expect(c.body.expected_version).toBeUndefined();
    expect(c.body.current_version).toBeUndefined();
  });
});
