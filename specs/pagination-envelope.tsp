// TypeSpec pagination-envelope contract for @curaos/contracts.
//
// THE canonical list-pagination mold. ONE page shape for EVERY list surface, so
// the pagination wire vocabulary (limit / cursor / nextCursor / total / count)
// is identical fleet-wide and a consumer reads the SAME Page envelope no matter
// which service it lists (the duplication [[curaos-reuse-dry-rule]] forbids).
// Symmetric-in-spirit to the codegen envelope mold that the derive emitter
// bundles into generated services (tools/codegen .../specs/lib/pagination.tsp),
// authored here in the standalone @curaos/contracts style so a hand-written
// consumer can import the shape without pulling the service-core generator.
//
// Cursor OVER offset (list convention): an opaque forward cursor is stable under
// concurrent inserts where a numeric offset silently skips or repeats rows. A
// caller MAY still page by offset (offset kept as an optional param) but cursor
// is preferred. `cursor` is server-encoded (keyset over the sort key + id); a
// consumer treats it as opaque and echoes `nextCursor` back to page forward.
//
// Pure WIRE shapes: pagination is a transport concern, never owned state. No
// PHI/PII rides the envelope - only the row DTO the consumer parameterizes does,
// and that stays in the consumer's own overlay schema. Runtime mirror:
// src/pagination-types.ts.
//
// Entity-only contract: no REST operations, so no @route ops here. Compile only
// if a sibling tspconfig pins an emitter (none today).

import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "CuraOS Pagination Envelope" })
namespace CuraOS.Contracts.Pagination;

@doc("""
Query params for a list request. `limit` caps the page size (the service clamps
to its own hard max so a caller cannot request an unbounded page); `cursor` is
the opaque forward cursor from a prior page's `nextCursor` (omit for the first
page); `offset` is the fallback numeric skip for callers that cannot keyset -
prefer `cursor`. Bind these as `@query` params on the consumer's list operation.
""")
model PageParams {
  @doc("Max rows to return. Omit for the service default; the service clamps to its hard max.")
  limit?: int32;

  @doc("Opaque forward cursor from the previous page's `nextCursor`. Omit for page 1.")
  cursor?: string;

  @doc("Fallback numeric skip for callers that cannot keyset. Prefer `cursor`; unstable under concurrent inserts.")
  offset?: int32;
}

@doc("""
Page metadata wrapping a list result. `nextCursor` is null on the last page;
`total` is the OPTIONAL full match count the service MAY compute (omitted when a
second count query is too expensive - a caller must not assume it is present);
`count` is the number of items in THIS page (== items.length), carried so a
consumer can assert the page shape without inspecting the row array.
""")
model PageMeta {
  @doc("Opaque cursor to fetch the NEXT page; null when this is the last page.")
  nextCursor?: string;

  @doc("Full match count across all pages, when the service computes it. Optional: a keyset endpoint often omits it.")
  total?: int64;

  @doc("Number of items in THIS page (== items.length).")
  count: int32;
}

@doc("""
The page envelope: the row array plus its metadata. `Row` is the consumer's own
row DTO (e.g. an AuditEntry, a Task). Every list surface returns THIS shape so a
generated or hand-written consumer SDK pages every service identically.
""")
model Page<Row> {
  @doc("The rows in this page.")
  items: Row[];

  @doc("Cursor / count / total metadata for this page.")
  meta: PageMeta;
}
