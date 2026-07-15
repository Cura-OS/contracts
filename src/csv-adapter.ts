// CSV adapter on the import-job mold (XSRC-E14-7).
//
// CSV is an ADAPTER on @curaos/contracts ImportJob, NOT a new contract. It maps
// CSV rows to records, prevents duplicates by dedup key (HDS update_or_create
// merge), quarantines bad rows with a reason, and extracts columns (the same
// extract that backs a person's "export my data"). Directory/file modes reuse
// the same row pipeline - a directory is just many files concatenated.
//
// Port-adapted from WorldVistA health-data-standards (Apache-2.0). Fresh
// TypeScript; no source copied. See specs/import-job.tsp NOTICE.

import type { FailedRow, ImportCounts, ImportJob, ImportMode } from './types';

/** A parsed record: header column -> cell value. */
export type ImportRecord = Record<string, string>;

/** A source CSV file: its locator plus raw text. A directory import passes several. */
export interface CsvSource {
  /** File name / path used as the FailedRow.source locator. */
  source: string;
  /** Raw CSV text (header row + data rows). */
  text: string;
}

export interface CsvImportConfig {
  id: string;
  tenant: string;
  /** importDirectory (many sources) | file (one source). archive is unzipped upstream into sources. */
  mode: ImportMode;
  /** Header column that uniquely identifies a record. Rows sharing a value merge. */
  dedupKey: string;
  /** Header columns that MUST be present and non-empty, else the row is quarantined. */
  requiredColumns?: string[];
}

/**
 * Minimal RFC-4180-ish CSV line splitter: handles quoted fields, escaped quotes
 * (""), and commas inside quotes. Returns string[] of cells.
 * ponytail: one-pass char scanner, no dep. Add a streaming parser only if a
 * source ever exceeds memory - not a v1.1 concern.
 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

/**
 * Split CSV text into non-empty logical lines. QUOTE-AWARE: a newline inside an
 * open quoted field does NOT end the line, so a quoted multiline cell (which
 * extractColumns/exportCsv legitimately emit) round-trips instead of being torn
 * across physical lines. Tolerates \r\n and a trailing newline. Mirrors
 * splitCsvLine's quote handling (a "" pair inside quotes is a literal quote, not
 * a field terminator) so the two stay consistent.
 *
 * FAIL-CLOSED: if a quoted field is never closed (inQuotes still true at EOF),
 * every physical row from the opening quote to EOF has been swallowed into the
 * final logical line. Report `unterminated` so importCsv can quarantine that
 * blob instead of silently merging the lost rows into one record.
 */
function toLines(text: string): { lines: string[]; unterminated: boolean } {
  const lines: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        // escaped quote inside a quoted field: keep both, stay in-quotes
        cur += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      cur += c;
    } else if (c === '\n' && !inQuotes) {
      lines.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  lines.push(cur);
  return {
    lines: lines
      .map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
      .filter((l) => l.length > 0),
    unterminated: inQuotes,
  };
}

/**
 * Run a CSV import against the mold. Pure: takes config + sources, returns a
 * populated ImportJob. The caller decides whether to persist the merged records;
 * this function owns mapping, dedup, quarantine, and counts.
 *
 * Dedup: rows are keyed by their dedupKey value. The first row for a key
 * `created` the record; every later row for the same key `merged` (later cells
 * override earlier - HDS update_or_create). A row with a blank dedup key value
 * is quarantined (can't dedup it safely).
 */
export function importCsv(
  config: CsvImportConfig,
  sources: CsvSource[],
): { job: ImportJob; records: Map<string, ImportRecord> } {
  const required = config.requiredColumns ?? [];
  const records = new Map<string, ImportRecord>();
  const failedRows: FailedRow[] = [];
  let seen = 0;
  let created = 0;
  let merged = 0;

  for (const src of sources) {
    const { lines, unterminated } = toLines(src.text);
    const header = lines[0];
    if (header === undefined) continue;
    // FAIL-CLOSED: unterminated quote swallowed everything into the header line;
    // there is no valid row to trust. Quarantine the whole blob, skip the source.
    if (unterminated && lines.length === 1) {
      seen++;
      failedRows.push({
        rowIndex: 0,
        source: src.source,
        reason: 'unterminated quoted field (rows from the open quote to EOF)',
        raw: header,
      });
      continue;
    }
    const headers = splitCsvLine(header).map((h) => h.trim());

    for (let i = 1; i < lines.length; i++) {
      seen++;
      const rowIndex = i - 1; // zero-based among data rows
      const raw = lines[i] as string;
      const cells = splitCsvLine(raw);
      const quarantine = (reason: string) =>
        failedRows.push({ rowIndex, source: src.source, reason, raw });

      // FAIL-CLOSED: an unterminated quoted field swallowed every row from its
      // opening quote to EOF into this final logical line. Quarantine the blob
      // rather than merge the lost tail rows into one silent record.
      if (unterminated && i === lines.length - 1) {
        quarantine('unterminated quoted field (rows from the open quote to EOF)');
        continue;
      }

      if (cells.length !== headers.length) {
        quarantine(
          `column count mismatch: expected ${headers.length}, got ${cells.length}`,
        );
        continue;
      }

      const rec: ImportRecord = {};
      headers.forEach((h, idx) => (rec[h] = cells[idx] ?? ''));

      const missing = required.filter((c) => {
        const v = rec[c];
        return v === undefined || v.trim() === '';
      });
      if (missing.length > 0) {
        quarantine(`missing required column(s): ${missing.join(', ')}`);
        continue;
      }

      const key = rec[config.dedupKey];
      if (key === undefined || key.trim() === '') {
        quarantine(`missing dedup key '${config.dedupKey}'`);
        continue;
      }

      if (records.has(key)) {
        // duplicate prevented: merge into the existing record (HDS update_or_create)
        records.set(key, { ...records.get(key)!, ...rec });
        merged++;
      } else {
        records.set(key, rec);
        created++;
      }
    }
  }

  const counts: ImportCounts = {
    seen,
    created,
    merged,
    needsReview: failedRows.length,
  };

  const job: ImportJob = {
    id: config.id,
    tenant: config.tenant,
    mode: config.mode,
    format: 'csv',
    dedupKey: config.dedupKey,
    counts,
    failedRows,
  };

  return { job, records };
}

/**
 * Extract chosen columns from imported records as CSV text. Backs the admin
 * "extract columns" and the person's "export my data". Header row + one row per
 * record, in insertion (import) order. Values with comma/quote/newline are
 * quoted and embedded quotes doubled.
 */
export function extractColumns(
  records: Map<string, ImportRecord>,
  columns: string[],
): string {
  const esc = (v: string) => {
    // OWASP: neutralize formula injection - a leading =,+,-,@,tab,CR would make a
    // spreadsheet evaluate the cell; prefix a single quote, then quote as normal.
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(esc).join(',')];
  for (const rec of records.values()) {
    lines.push(columns.map((c) => esc(rec[c] ?? '')).join(','));
  }
  return lines.join('\n');
}
