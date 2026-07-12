// Runtime TypeScript mirror of specs/export-job.tsp.
//
// The export-job mold, symmetric to the import-job mold (src/types.ts): an
// adapter serializes selected records to output (directory/archive/file modes),
// quarantines records it cannot serialize with a reason, and reports counts plus
// a lifecycle status the person can watch.
//
// Port-adapted from WorldVistA health-data-standards `BulkRecordImporter`
// (Apache-2.0, Copyright (c) The MITRE Corporation / WorldVistA) - the same
// directory/archive/file mode split and failed-unit-with-reason quarantine, run
// in the export direction. Fresh TypeScript; no source copied. See
// specs/export-job.tsp NOTICE block for the full attribution.

/** How exported output is laid out. Symmetric to ImportMode. */
export type ExportMode = 'exportDirectory' | 'archive' | 'file';

/** Lifecycle status of an export run, as the person watches it progress. */
export type ExportStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/**
 * A record that could not be serialized: its dedup key plus WHY it failed. The
 * person-facing console shows the reason. Symmetric to import's FailedRow.
 */
export interface FailedRecord {
  /** Dedup-key value identifying the record that failed to export. */
  key: string;
  /** Human-readable quarantine reason (missing required column, serialize error). */
  reason: string;
  /** The record payload preserved verbatim (JSON) for a retry after the reason is fixed. */
  raw: string;
}

/**
 * Per-record tally for one export job. selected = records chosen for export;
 * exported = records successfully written; failed = records quarantined. Same
 * shape the person sees as "export status of my records".
 */
export interface ExportCounts {
  /** Records chosen for this export. */
  selected: number;
  /** Records successfully serialized into output. */
  exported: number;
  /** Records quarantined with a reason. */
  failed: number;
}

/**
 * A bulk export run. THE mold: an adapter maps records to output rows, lays them
 * out per mode, quarantines records it cannot serialize with a reason, and
 * reports counts plus a status. The admin console and the person's "export
 * status of my records" view read the SAME ExportJob.
 */
export interface ExportJob {
  id: string;
  tenant: string;
  mode: ExportMode;
  /** Output format the adapter produces (e.g. 'csv'). Names the adapter, not a new contract. */
  format: string;
  /** Record field the export is keyed by (mirrors the import dedup key). */
  dedupKey: string;
  status: ExportStatus;
  counts: ExportCounts;
  failedRecords: FailedRecord[];
}

/**
 * Person-facing projection of an ExportJob: "export status of MY records". Same
 * contract as the admin console, narrowed - no failed payloads or internals leak.
 */
export interface MyRecordsExportStatus {
  status: ExportStatus;
  selected: number;
  exported: number;
}

/**
 * Project a full ExportJob down to the person-facing status view. The admin
 * console and the person read the SAME ExportJob; this is the only narrowing.
 */
export function toMyRecordsExportStatus(job: ExportJob): MyRecordsExportStatus {
  return {
    status: job.status,
    selected: job.counts.selected,
    exported: job.counts.exported,
  };
}
