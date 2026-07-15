// CSV adapter on the export-job mold, symmetric to the import CSV adapter
// (src/csv-adapter.ts). CSV is an ADAPTER on @curaos/contracts ExportJob, NOT a
// new contract. It maps records to output rows, extracts the chosen columns,
// quarantines records missing a required column with a reason, and lays the rows
// out per mode - file (one blob), exportDirectory / archive (partitioned files,
// zipped upstream for archive). It round-trips: it consumes the exact record Map
// importCsv produces.
//
// Port-adapted from WorldVistA health-data-standards (Apache-2.0), run in the
// export direction. Fresh TypeScript; no source copied. See specs/export-job.tsp
// NOTICE.

import type {
  ExportCounts,
  ExportJob,
  ExportMode,
  ExportStatus,
  FailedRecord,
} from './export-types';

/** A record to export: column -> cell value. Same shape as the imported ImportRecord. */
export type ExportRecord = Record<string, string>;

/** One output file: its name plus rendered CSV text. file mode yields one; directory/archive yield several. */
export interface ExportFile {
  name: string;
  text: string;
}

export interface CsvExportConfig {
  id: string;
  tenant: string;
  /** file (one output blob) | exportDirectory / archive (partitioned; archive is zipped upstream). */
  mode: ExportMode;
  /** Record field the export is keyed by (mirrors the import dedup key). */
  dedupKey: string;
  /** Columns to extract, in output order. Becomes the header row. */
  columns: string[];
  /** Columns that MUST be present and non-empty on a record, else it is quarantined. Defaults to none. */
  requiredColumns?: string[];
  /** Rows per file for directory/archive modes. Unset or <=0 => one file. Ignored in file mode. */
  partitionSize?: number;
}

/**
 * Quote a CSV cell if it contains a comma, quote, or newline; double embedded
 * quotes. A cell starting with = + - @ (or tab/CR) is neutralized with a leading
 * single quote per OWASP guidance so spreadsheets do not evaluate it as a
 * formula. Mirrors the escaping in src/csv-adapter.ts extractColumns.
 * ponytail: kept local to mirror the adapter shape; if a third adapter needs it,
 * hoist to a shared csv util then.
 */
export function csvEscape(v: string): string {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Run a CSV export against the mold. Pure: takes config + records, returns a
 * populated ExportJob and the output files. The caller decides whether to write
 * the files; this function owns column extraction, quarantine, partitioning, and
 * counts.
 *
 * A record missing any requiredColumn value is quarantined with a reason and NOT
 * written. Records are exported in the Map's insertion order. status is
 * `succeeded` unless there were records to export and none survived, then
 * `failed`. queued/running are pre-terminal states a caller sets before invoking
 * this runner.
 */
export function exportCsv(
  config: CsvExportConfig,
  records: Map<string, ExportRecord>,
): { job: ExportJob; files: ExportFile[] } {
  const required = config.requiredColumns ?? [];
  const failedRecords: FailedRecord[] = [];
  const rows: string[] = [];
  let selected = 0;

  for (const [key, rec] of records) {
    selected++;
    const missing = required.filter((c) => {
      const val = rec[c];
      return val === undefined || val.trim() === '';
    });
    if (missing.length > 0) {
      failedRecords.push({
        key,
        reason: `missing required column(s): ${missing.join(', ')}`,
        raw: JSON.stringify(rec),
      });
      continue;
    }
    rows.push(config.columns.map((c) => csvEscape(rec[c] ?? '')).join(','));
  }

  const header = config.columns.map(csvEscape).join(',');
  const files = partition(header, rows, config.mode, config.partitionSize);

  const exported = rows.length;
  const counts: ExportCounts = {
    selected,
    exported,
    failed: failedRecords.length,
  };
  const status: ExportStatus =
    selected > 0 && exported === 0 ? 'failed' : 'succeeded';

  const job: ExportJob = {
    id: config.id,
    tenant: config.tenant,
    mode: config.mode,
    format: 'csv',
    dedupKey: config.dedupKey,
    status,
    counts,
    failedRecords,
  };

  return { job, files };
}

/**
 * Lay out rendered rows into files. file mode (or no partitionSize) => one file
 * `export.csv`. directory/archive with a positive partitionSize => chunks of
 * `export-<n>.csv`, each carrying its own header row.
 */
function partition(
  header: string,
  rows: string[],
  mode: ExportMode,
  partitionSize?: number,
): ExportFile[] {
  const size = partitionSize ?? 0;
  if (mode === 'file' || size <= 0) {
    return [{ name: 'export.csv', text: [header, ...rows].join('\n') }];
  }
  const files: ExportFile[] = [];
  for (let start = 0, n = 0; start < rows.length; start += size, n++) {
    const chunk = rows.slice(start, start + size);
    files.push({ name: `export-${n}.csv`, text: [header, ...chunk].join('\n') });
  }
  return files;
}
