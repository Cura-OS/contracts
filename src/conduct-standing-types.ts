// Runtime TypeScript mirror of the conduct-and-standing wire contract
// (STAFFING-PARITY-CONDUCT-STANDING-ENGINE, P0).
//
// THE canonical claim-guard contract. policy-core-service PRODUCES the standing
// (it owns the conduct ledger + the Good/Warning/Restricted/Deactivated state
// machine); the shift-marketplace (scheduling-service) CONSUMES a worker's
// current standing and reads THIS contract's `claimGuardDecision` to decide
// whether a claim is allowed. Authoring the standing enum + the guard function in
// ONE shared owner keeps producer and consumer from drifting into two different
// "which standing blocks a claim" answers (the duplication [[curaos-reuse-dry-rule]]
// forbids).
//
// snake_case WIRE vocabulary is deliberate and matches the durable event
// policy-core emits on `curaos.core.conduct.standing.changed.v1`: `worker_party_ref`,
// `tenant_id`, `from_standing`, `to_standing`, `blocks_claim`, `reason`, `path_back`,
// `recovers_at`, `appeal_path`, `occurred_at`. A camelCase producer is the drift
// this mold rejects.
//
// PERSON-CENTRIC (BINDING): the guard is non-punitive. Good + Warning ALLOW a
// claim (a Warning is a nudge, not a gate); Restricted + Deactivated gate NEW
// claims but the decision ALWAYS carries the plain-language reason + the path back
// + the documented appeal path, never a bare "denied". A late-cancel is never
// conflated with a no-show anywhere upstream of this contract.
//
// Pure WIRE shapes + a pure decision function: no PHI rides the envelope
// (worker_party_ref is an opaque party-core reference id), no I/O here.

/** The four account-standing states, worst -> best is deactivated..good. */
export const CONDUCT_STANDINGS = ['good', 'warning', 'restricted', 'deactivated'] as const;
export type ConductStanding = (typeof CONDUCT_STANDINGS)[number];

/** The durable topic policy-core emits the standing transition on. */
export const CONDUCT_STANDING_CHANGED_TOPIC = 'curaos.core.conduct.standing.changed.v1';

/**
 * The wire payload of `curaos.core.conduct.standing.changed.v1`. The plain-language
 * copy (`reason` / `path_back` / `appeal_path`) travels WITH the event so a
 * consumer shows it verbatim without re-deriving it - the guarantee that a worker
 * sees the SAME explanation everywhere.
 */
export interface ConductStandingChangedEvent {
  type: 'ConductStandingChanged';
  worker_party_ref: string;
  tenant_id: string;
  from_standing: ConductStanding;
  to_standing: ConductStanding;
  active_points: number;
  reason: string;
  path_back: string;
  recovers_at: string | null;
  appeal_path: string;
  /** The claim-guard decision at emit time (Restricted/Deactivated => true). */
  blocks_claim: boolean;
  triggered_by_event_id: string;
  occurred_at: string;
}

/**
 * A worker's CURRENT standing, as a shift-marketplace projection keeps it (built
 * by folding `ConductStandingChangedEvent`s). `reason` / `path_back` / `appeal_path`
 * default to the last event's copy; a worker with no conduct history is Good.
 */
export interface WorkerStandingProjection {
  worker_party_ref: string;
  tenant_id: string;
  standing: ConductStanding;
  reason: string | null;
  path_back: string | null;
  appeal_path: string | null;
  recovers_at: string | null;
  updated_at: string | null;
}

/** The claim-guard decision the shift-marketplace acts on. */
export interface ClaimGuardDecision {
  /** True => the worker may claim; false => the claim is gated. */
  allowed: boolean;
  standing: ConductStanding;
  /** Plain-language, non-punitive reason (present when gated). */
  reason?: string;
  /** The documented appeal path (present when gated). */
  appeal_path?: string;
  /** ISO date the standing next improves, if known (present when gated). */
  recovers_at?: string | null;
}

/**
 * Standing -> does it gate a NEW claim. Restricted + Deactivated gate claiming;
 * Good + Warning allow. This is the ONE mapping both policy-core (which stamps
 * `blocks_claim` on the event) and the shift-marketplace (which guards claims)
 * agree on.
 */
export function standingBlocksClaim(standing: ConductStanding): boolean {
  return standing === 'restricted' || standing === 'deactivated';
}

const NO_HISTORY_APPEAL_PATH = 'POST /conduct/appeals';

/**
 * THE claim-guard. Given a worker's current standing projection (or `null` for a
 * worker with no conduct history => Good => allowed), decide whether a claim is
 * allowed. A gated decision always carries the person-centric reason + appeal path
 * + recovery date so the caller can tell the worker exactly why and the path back,
 * never a bare denial.
 */
export function claimGuardDecision(
  projection: WorkerStandingProjection | null,
): ClaimGuardDecision {
  // No conduct history => Good => allowed. A worker is never blocked for the
  // ABSENCE of a standing record (that would conflate "unknown" with "bad").
  if (projection === null) {
    return { allowed: true, standing: 'good' };
  }
  const standing = projection.standing;
  if (!standingBlocksClaim(standing)) {
    return { allowed: true, standing };
  }
  return {
    allowed: false,
    standing,
    reason:
      projection.reason ??
      `Your account standing is ${standing}, so new shift claims are paused for now.`,
    appeal_path: projection.appeal_path ?? NO_HISTORY_APPEAL_PATH,
    recovers_at: projection.recovers_at ?? null,
  };
}

const STANDING_SET: ReadonlySet<string> = new Set(CONDUCT_STANDINGS);

/**
 * Fail-closed parse of the standing-changed wire event. Throws (never returns a
 * partially-valid event) if a required snake_case key is missing/mis-typed or a
 * standing value is not one of the four states. A camelCase-drifted producer
 * (`toStanding` instead of `to_standing`) fails here rather than silently feeding
 * a bad projection.
 */
export function parseConductStandingChanged(raw: unknown): ConductStandingChangedEvent {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError('conduct standing event must be an object');
  }
  const r = raw as Record<string, unknown>;
  requireString(r, 'worker_party_ref');
  requireString(r, 'tenant_id');
  requireString(r, 'reason');
  requireString(r, 'path_back');
  requireString(r, 'appeal_path');
  requireString(r, 'occurred_at');
  requireStanding(r, 'from_standing');
  requireStanding(r, 'to_standing');
  if (typeof r.blocks_claim !== 'boolean') {
    throw new TypeError("conduct standing event 'blocks_claim' must be a boolean");
  }
  if (r.recovers_at !== null && typeof r.recovers_at !== 'string') {
    throw new TypeError("conduct standing event 'recovers_at' must be a string or null");
  }
  return raw as ConductStandingChangedEvent;
}

function requireString(r: Record<string, unknown>, key: string): void {
  const v = r[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError(`conduct standing event missing string key '${key}' (snake_case required)`);
  }
}

function requireStanding(r: Record<string, unknown>, key: string): void {
  const v = r[key];
  if (typeof v !== 'string' || !STANDING_SET.has(v)) {
    throw new TypeError(
      `conduct standing event '${key}' must be one of ${CONDUCT_STANDINGS.join('/')} (got ${String(v)})`,
    );
  }
}
