// TypeSpec import-job contract for @curaos/contracts.
//
// THE mold every bulk-import gap regenerates from. One ImportJob entity covers
// the three ingest modes (import-directory / archive / single file), failed-row
// quarantine with a reason, and per-row counts (seen / merged / needs-review).
// Format-specific behavior (CSV, and future XLSX/JSON) is an ADAPTER on this
// contract, never a fork of it.
//
// Model port-adapted from WorldVistA health-data-standards (HDS)
// `BulkRecordImporter` (Apache-2.0 - attribution preserved, see NOTICE below).
// HDS facts ported: the directory/archive/file mode split, the failed_dir
// quarantine-with-`.error`-reason pattern, the `update_or_create`
// dedup-keyed-on-identifier merge, and the archive manifest's
// "listed-but-missing" -> needs-review signal. bahmni's idempotent-upsert
// dup-prevention informed the design conceptually only; no source copied.
//
// NOTICE (license attribution):
//   The ImportJob mode split, failed-row quarantine-with-reason model, the
//   seen/merged/needs-review counts, and the dedup-by-identifier merge are
//   port-adapted from WorldVistA health-data-standards `BulkRecordImporter`.
//   health-data-standards - Copyright (c) The MITRE Corporation / WorldVistA.
//   Licensed under the Apache License, Version 2.0.
//   Fresh TypeScript expressing the model; no source copied.
//
// Entity-only contract: no REST operations, so no @route ops here. Compile only
// if a sibling tspconfig pins an emitter (none today; the codegen import-job
// emitter is a separate lane). Runtime mirror: src/types.ts.

import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "CuraOS Import Job" })
namespace CuraOS.Contracts.ImportJob;

@doc("How the source rows reach the importer. Port-adapted from HDS BulkRecordImporter (import_directory / import_archive / import_file).")
enum ImportMode {
  @doc("Scan a directory of source files, importing each. HDS import_directory.")
  importDirectory,

  @doc("A single archive (e.g. zip) expanded entry-by-entry, optionally with a manifest of expected record ids. HDS import_archive.")
  archive,

  @doc("One source file (or in-memory blob) imported directly. HDS import_file.")
  file,
}

@doc("Disposition of a single source row after the importer processed it.")
enum RowOutcome {
  @doc("New record created from the row.")
  created,

  @doc("Row matched an existing record by dedup key and was merged into it (HDS update_or_create). Not a duplicate insert.")
  merged,

  @doc("Row could not be applied and was quarantined with a reason. Failed-row.")
  quarantined,

  @doc("Row was expected (e.g. listed in an archive manifest) but no record was produced - flagged for a human to review. HDS missing_patients.")
  needsReview,
}

@doc("""
A quarantined source row: the offending payload plus the reason it failed. The
person-facing console shows the reason so the owner of the data knows WHY a row
did not import. Port-adapted from HDS: a failed file copied to failed_dir with a
sibling `.error` carrying the exception message.
""")
model FailedRow {
  @doc("Zero-based index of the row within its source (CSV line, archive entry order).")
  rowIndex: int32;

  @doc("Stable source locator: file name, archive entry path, or directory file path.")
  source: string;

  @doc("Why the row was quarantined (validation message, parse error, missing dedup key). Human-readable.")
  reason: string;

  @doc("The raw row payload, preserved verbatim for re-import after the reason is fixed.")
  raw: string;
}

@doc("""
Per-row tally for one import job. seen = rows the importer looked at; merged =
rows folded into existing records (dedup); needsReview = rows quarantined or
expected-but-missing that a human must resolve. created + merged + the
quarantined subset of needsReview reconcile against seen. This is the SAME count
shape the person sees as "import status of my records".
""")
model ImportCounts {
  @doc("Total source rows the importer examined.")
  seen: int32;

  @doc("Rows that produced a brand-new record.")
  created: int32;

  @doc("Rows merged into an existing record by dedup key (HDS update_or_create). Duplicate inserts prevented.")
  merged: int32;

  @doc("Rows a human must resolve: quarantined failures plus expected-but-missing rows.")
  needsReview: int32;
}

@doc("""
A bulk import run. THE mold: an adapter (CSV today) maps source rows to records,
prevents duplicates by dedup key, quarantines bad rows with a reason, and reports
counts. The admin migration console and the person's "status of my records" view
read the SAME ImportJob.
""")
model ImportJob {
  @doc("Stable job id.")
  id: string;

  @doc("Tenant the import runs under (PHI/PII stays in the overlay schema).")
  tenant: string;

  @doc("Ingest mode for this job.")
  mode: ImportMode;

  @doc("Source format the adapter handles (e.g. 'csv'). Names the adapter, not a new contract.")
  format: string;

  @doc("Record field used to detect duplicates (e.g. 'mrn', 'email'). Two rows with the same value merge into one record. HDS dedup key was medical_record_number.")
  dedupKey: string;

  @doc("Per-row outcome tally.")
  counts: ImportCounts;

  @doc("Quarantined rows with their reasons.")
  failedRows: FailedRow[];
}

@doc("""
The person-facing projection of an ImportJob: "import status of MY records". Same
contract that powers the admin migration console, narrowed to what the data owner
needs - how many of their records were seen, merged, and need their review. No
admin-only internals (raw payloads, source paths) leak here.
""")
model MyRecordsImportStatus {
  @doc("Records the import looked at for this person.")
  seen: int32;

  @doc("Records merged into the person's existing records.")
  merged: int32;

  @doc("Records that need the person (or an admin on their behalf) to review.")
  needsReview: int32;
}
