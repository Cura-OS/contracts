// Runtime TypeScript mirror of specs/import-job.tsp.
//
// Port-adapted from WorldVistA health-data-standards `BulkRecordImporter`
// (Apache-2.0, Copyright (c) The MITRE Corporation / WorldVistA). Fresh
// TypeScript; no source copied. See specs/import-job.tsp NOTICE block for the
// full attribution.

/** How source rows reach the importer. HDS import_directory / import_archive / import_file. */
export type ImportMode = 'importDirectory' | 'archive' | 'file';

/** Disposition of one source row after processing. */
export type RowOutcome = 'created' | 'merged' | 'quarantined' | 'needsReview';

/**
 * A quarantined source row: the offending payload plus WHY it failed. The
 * person-facing console shows the reason. HDS: failed file -> failed_dir with a
 * sibling `.error` carrying the message.
 */
export interface FailedRow {
  rowIndex: number;
  source: string;
  /** Human-readable quarantine reason (validation, parse error, missing dedup key). */
  reason: string;
  /** Raw row payload preserved verbatim for re-import. */
  raw: string;
}

/**
 * Per-row tally. seen = rows examined; merged = folded into existing records
 * (dedup); needsReview = rows a human must resolve. Same shape the person sees
 * as "import status of my records".
 */
export interface ImportCounts {
  seen: number;
  created: number;
  /** Merged into an existing record by dedup key (HDS update_or_create). Duplicate inserts prevented. */
  merged: number;
  /** Quarantined failures plus expected-but-missing rows. */
  needsReview: number;
}

/**
 * A bulk import run. THE mold: an adapter maps rows to records, prevents
 * duplicates by dedupKey, quarantines bad rows with a reason, reports counts.
 * The admin console and the person's "status of my records" view read the SAME
 * ImportJob.
 */
export interface ImportJob {
  id: string;
  tenant: string;
  mode: ImportMode;
  /** Source format the adapter handles (e.g. 'csv'). Names the adapter, not a new contract. */
  format: string;
  /** Record field used to detect duplicates. Two rows with the same value merge. */
  dedupKey: string;
  counts: ImportCounts;
  failedRows: FailedRow[];
}

/**
 * Person-facing projection of an ImportJob: "import status of MY records". Same
 * contract as the admin console, narrowed - no raw payloads or source paths leak.
 */
export interface MyRecordsImportStatus {
  seen: number;
  merged: number;
  needsReview: number;
}

/**
 * Project a full ImportJob down to the person-facing status view. The admin
 * console and the person read the SAME ImportJob; this is the only narrowing.
 */
export function toMyRecordsStatus(job: ImportJob): MyRecordsImportStatus {
  return {
    seen: job.counts.seen,
    merged: job.counts.merged,
    needsReview: job.counts.needsReview,
  };
}
