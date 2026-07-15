// Runtime TypeScript mirror of specs/pagination-envelope.tsp.
//
// THE canonical list-pagination shape: ONE page envelope for every list surface
// so the wire vocabulary (limit / cursor / nextCursor / total / count) is
// identical fleet-wide. Cursor over offset (offset kept as a fallback). Pure
// transport shapes; no owned state, no PHI on the envelope.

/**
 * Query params for a list request. `limit` caps page size (the service clamps to
 * its hard max); `cursor` is the opaque forward cursor from a prior page; `offset`
 * is the fallback numeric skip - prefer `cursor`.
 */
export interface PageParams {
  limit?: number;
  cursor?: string;
  offset?: number;
}

/**
 * Page metadata. `nextCursor` is null on the last page; `total` is the optional
 * full match count (omitted when a second count query is too expensive); `count`
 * is the number of items in THIS page.
 */
export interface PageMeta {
  /** Opaque cursor for the NEXT page; null when this is the last page. */
  nextCursor: string | null;
  /** Full match count across all pages, when the service computes it. */
  total?: number;
  /** Number of items in THIS page (== items.length). */
  count: number;
}

/** The page envelope: the row array plus its metadata. */
export interface Page<Row> {
  items: Row[];
  meta: PageMeta;
}

/**
 * Clamp a requested page size to `[1, max]`, defaulting when unset. A caller
 * cannot request an unbounded (or non-positive) page: undefined -> def, values
 * above max -> max, values below 1 -> 1.
 */
export function clampLimit(
  requested: number | undefined,
  opts: { def: number; max: number },
): number {
  const n = requested ?? opts.def;
  if (Number.isNaN(n)) return opts.def;
  if (n < 1) return 1;
  if (n > opts.max) return opts.max;
  return Math.floor(n);
}

/**
 * Wrap a row array in the canonical Page envelope. `count` is derived from the
 * items (never trusted from a caller); `nextCursor` defaults to null (last page)
 * and `total` is omitted unless the service computed it.
 */
export function makePage<Row>(
  items: Row[],
  opts: { nextCursor?: string | null; total?: number } = {},
): Page<Row> {
  const meta: PageMeta = {
    nextCursor: opts.nextCursor ?? null,
    count: items.length,
  };
  if (opts.total !== undefined) meta.total = opts.total;
  return { items, meta };
}
