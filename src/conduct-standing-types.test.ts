import { describe, expect, test } from 'bun:test';
import {
  claimGuardDecision,
  parseConductStandingChanged,
  standingBlocksClaim,
  type ConductStandingChangedEvent,
  type WorkerStandingProjection,
} from './conduct-standing-types';

function projection(over: Partial<WorkerStandingProjection>): WorkerStandingProjection {
  return {
    worker_party_ref: 'party-1',
    tenant_id: 'tenant-1',
    standing: 'good',
    reason: null,
    path_back: null,
    appeal_path: 'POST /conduct/appeals',
    recovers_at: null,
    updated_at: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

describe('standingBlocksClaim - the ONE mapping', () => {
  test('Restricted + Deactivated gate; Good + Warning allow', () => {
    expect(standingBlocksClaim('good')).toBe(false);
    expect(standingBlocksClaim('warning')).toBe(false); // a nudge, not a gate
    expect(standingBlocksClaim('restricted')).toBe(true);
    expect(standingBlocksClaim('deactivated')).toBe(true);
  });
});

describe('claimGuardDecision - person-centric guard', () => {
  test('no conduct history => Good => allowed (never blocked for absence of a record)', () => {
    const d = claimGuardDecision(null);
    expect(d.allowed).toBe(true);
    expect(d.standing).toBe('good');
  });

  test('Warning allows the claim (nudge, not gate)', () => {
    expect(claimGuardDecision(projection({ standing: 'warning' })).allowed).toBe(true);
  });

  test('Restricted gates the claim and carries reason + appeal path + recovery date', () => {
    const d = claimGuardDecision(
      projection({
        standing: 'restricted',
        reason: 'Restricted due to 2 no-shows.',
        recovers_at: '2026-08-01T00:00:00.000Z',
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/no-show/i);
    expect(d.appeal_path).toBe('POST /conduct/appeals');
    expect(d.recovers_at).toBe('2026-08-01T00:00:00.000Z');
  });

  test('Deactivated gates the claim; a bare projection still yields a non-empty reason + appeal path', () => {
    const d = claimGuardDecision(projection({ standing: 'deactivated', reason: null, appeal_path: null }));
    expect(d.allowed).toBe(false);
    expect((d.reason ?? '').length).toBeGreaterThan(0);
    expect(d.appeal_path).toBe('POST /conduct/appeals');
  });
});

describe('parseConductStandingChanged - fail-closed wire validation', () => {
  const good: ConductStandingChangedEvent = {
    type: 'ConductStandingChanged',
    worker_party_ref: 'party-1',
    tenant_id: 'tenant-1',
    from_standing: 'warning',
    to_standing: 'restricted',
    active_points: 3,
    reason: 'why',
    path_back: 'how',
    recovers_at: null,
    appeal_path: 'POST /conduct/appeals',
    blocks_claim: true,
    triggered_by_event_id: 'evt-1',
    occurred_at: '2026-06-01T00:00:00.000Z',
  };

  test('accepts a well-formed snake_case event', () => {
    expect(parseConductStandingChanged(good).to_standing).toBe('restricted');
  });

  test('rejects a camelCase-drifted producer', () => {
    const drifted = { ...good } as Record<string, unknown>;
    delete drifted.to_standing;
    (drifted as Record<string, unknown>).toStanding = 'restricted';
    expect(() => parseConductStandingChanged(drifted)).toThrow(/to_standing/);
  });

  test('rejects an unknown standing value', () => {
    expect(() => parseConductStandingChanged({ ...good, to_standing: 'banned' })).toThrow(/one of/);
  });

  test('rejects a non-boolean blocks_claim', () => {
    expect(() => parseConductStandingChanged({ ...good, blocks_claim: 'yes' })).toThrow(/blocks_claim/);
  });
});
