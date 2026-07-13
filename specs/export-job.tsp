// TypeSpec export-job contract for @curaos/contracts.
//
// THE mold every bulk-export gap regenerates from, symmetric to import-job.tsp.
// One ExportJob entity covers the three output modes (export-directory / archive
// / single file), failed-record quarantine with a reason, per-record counts
// (selected / exported / failed), and a lifecycle status the person can watch
// (queued / running / succeeded / failed). Format-specific behavior (CSV, and
// future XLSX/JSON) is an ADAPTER on this contract, never a fork of it. It
// round-trips the import-job mold: an exporter consumes the records an importer
// produced.
//
// Model port-adapted from WorldVistA health-data-standards (HDS)
// `BulkRecordImporter` (Apache-2.0 - attribution preserved, see NOTICE below),
// run in the export direction: the same directory/archive/file mode split and
// the failed-unit-with-`.error`-reason quarantine pattern. No source copied.
//
// NOTICE (license attribution):
//   The directory/archive/file mode split and the failed-unit
//   quarantine-with-reason model are port-adapted from WorldVistA
//   health-data-standards `BulkRecordImporter`.
//   health-data-standards - Copyright (c) The MITRE Corporation / WorldVistA.
//   Licensed under the Apache License, Version 2.0.
//   Fresh TypeScript expressing the model; no source copied.
//
// Entity-only contract: no REST operations, so no @route ops here. Compile only
// if a sibling tspconfig pins an emitter (none today). Runtime mirror:
// src/export-types.ts.

import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "CuraOS Export Job" })
namespace CuraOS.Contracts.ExportJob;

@doc("How the exported output is laid out. Symmetric to ImportMode (export_directory / archive / file).")
enum ExportMode {
  @doc("Write many partitioned output files into a directory. Symmetric to import_directory.")
  exportDirectory,

  @doc("Partitioned output files zipped upstream into a single archive. Symmetric to import_archive.")
  archive,

  @doc("One output file (or in-memory blob) containing every exported record.")
  file,
}

@doc("Lifecycle status of an export run, as the person watches it progress.")
enum ExportStatus {
  @doc("Accepted but not started.")
  queued,

  @doc("Records are being serialized.")
  running,

  @doc("Completed; at least one record was exported (or there was nothing to export).")
  succeeded,

  @doc("Completed but no selected record could be exported.")
  failed,
}

@doc("""
A record that could not be serialized: its dedup key plus the reason it failed.
The person-facing console shows the reason so the owner of the data knows WHY a
record did not export. Symmetric to import's FailedRow.
""")
model FailedRecord {
  @doc("Dedup-key value identifying the record that failed to export.")
  key: string;

  @doc("Why the record was quarantined (missing required column, serialize error). Human-readable.")
  reason: string;

  @doc("The record payload preserved verbatim (JSON) for a retry after the reason is fixed.")
  raw: string;
}

@doc("""
Per-record tally for one export job. selected = records chosen for export;
exported = records successfully written; failed = records quarantined. This is
the SAME count shape the person sees as "export status of my records".
""")
model ExportCounts {
  @doc("Records chosen for this export.")
  selected: int32;

  @doc("Records successfully serialized into output.")
  exported: int32;

  @doc("Records quarantined with a reason.")
  failed: int32;
}

@doc("""
A bulk export run. THE mold: an adapter (CSV today) maps records to output rows,
lays them out per mode, quarantines records it cannot serialize with a reason,
and reports counts plus a status. The admin console and the person's "export
status of my records" view read the SAME ExportJob.
""")
model ExportJob {
  @doc("Stable job id.")
  id: string;

  @doc("Tenant the export runs under (PHI/PII stays in the overlay schema).")
  tenant: string;

  @doc("Output layout mode for this job.")
  mode: ExportMode;

  @doc("Output format the adapter produces (e.g. 'csv'). Names the adapter, not a new contract.")
  format: string;

  @doc("Record field the export is keyed by (mirrors the import dedup key).")
  dedupKey: string;

  @doc("Lifecycle status.")
  status: ExportStatus;

  @doc("Per-record outcome tally.")
  counts: ExportCounts;

  @doc("Records that failed to export, with their reasons.")
  failedRecords: FailedRecord[];
}

@doc("""
The person-facing projection of an ExportJob: "export status of MY records". Same
contract that powers the admin console, narrowed to what the data owner needs -
the status and how many of their records were selected and exported. No
admin-only internals (failed payloads) leak here.
""")
model MyRecordsExportStatus {
  @doc("Lifecycle status of the person's export.")
  status: ExportStatus;

  @doc("Records selected for export for this person.")
  selected: int32;

  @doc("Records successfully exported for this person.")
  exported: int32;
}
