import { describe, expect, test } from 'bun:test';
import {
  type CsvImportConfig,
  type CsvSource,
  extractColumns,
  importCsv,
  splitCsvLine,
} from './csv-adapter';
import { toMyRecordsStatus } from './types';

const cfg = (over: Partial<CsvImportConfig> = {}): CsvImportConfig => ({
  id: 'job-1',
  tenant: 't1',
  mode: 'file',
  dedupKey: 'mrn',
  ...over,
});

describe('splitCsvLine', () => {
  test('plain cells', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });
  test('quoted field with comma and escaped quote', () => {
    expect(splitCsvLine('"Doe, Jane","say ""hi""",x')).toEqual([
      'Doe, Jane',
      'say "hi"',
      'x',
    ]);
  });
});

describe('importCsv - row mapping + counts', () => {
  test('maps rows to records and counts seen/created', () => {
    const src: CsvSource = {
      source: 'people.csv',
      text: 'mrn,name\n1,Alice\n2,Bob',
    };
    const { job, records } = importCsv(cfg(), [src]);
    expect(records.get('1')).toEqual({ mrn: '1', name: 'Alice' });
    expect(job.counts).toEqual({ seen: 2, created: 2, merged: 0, needsReview: 0 });
    expect(job.format).toBe('csv');
    expect(job.failedRows).toHaveLength(0);
  });

  test('directory mode: many sources, one pipeline', () => {
    const sources: CsvSource[] = [
      { source: 'a.csv', text: 'mrn,name\n1,Alice' },
      { source: 'b.csv', text: 'mrn,name\n2,Bob' },
    ];
    const { job } = importCsv(cfg({ mode: 'importDirectory' }), sources);
    expect(job.mode).toBe('importDirectory');
    expect(job.counts.seen).toBe(2);
    expect(job.counts.created).toBe(2);
  });
});

describe('importCsv - quarantine with reason', () => {
  test('column count mismatch quarantined with reason', () => {
    const src: CsvSource = { source: 'bad.csv', text: 'mrn,name\n1,Alice,EXTRA' };
    const { job } = importCsv(cfg(), [src]);
    expect(job.counts.created).toBe(0);
    expect(job.counts.needsReview).toBe(1);
    expect(job.failedRows[0]).toMatchObject({
      rowIndex: 0,
      source: 'bad.csv',
      raw: '1,Alice,EXTRA',
    });
    expect(job.failedRows[0].reason).toContain('column count mismatch');
  });

  test('missing required column quarantined with reason', () => {
    const src: CsvSource = { source: 'r.csv', text: 'mrn,name\n1,' };
    const { job } = importCsv(cfg({ requiredColumns: ['name'] }), [src]);
    expect(job.failedRows[0].reason).toContain('missing required column');
    expect(job.counts.needsReview).toBe(1);
  });

  test('blank dedup key quarantined', () => {
    const src: CsvSource = { source: 'r.csv', text: 'mrn,name\n,Alice' };
    const { job } = importCsv(cfg(), [src]);
    expect(job.failedRows[0].reason).toContain("missing dedup key 'mrn'");
  });
});

describe('importCsv - duplicate prevention (merge)', () => {
  test('same dedup key merges, does not duplicate', () => {
    const src: CsvSource = {
      source: 'dup.csv',
      text: 'mrn,name,phone\n1,Alice,\n1,Alice,555',
    };
    const { job, records } = importCsv(cfg(), [src]);
    expect(records.size).toBe(1); // one record, not two
    expect(records.get('1')).toEqual({ mrn: '1', name: 'Alice', phone: '555' }); // later cells override
    expect(job.counts).toEqual({ seen: 2, created: 1, merged: 1, needsReview: 0 });
  });
});

describe('extractColumns - backs export my data', () => {
  test('extracts chosen columns as CSV, quoting as needed', () => {
    const { records } = importCsv(cfg(), [
      { source: 'p.csv', text: 'mrn,name,city\n1,"Doe, Jane",NYC' },
    ]);
    const csv = extractColumns(records, ['mrn', 'name']);
    expect(csv).toBe('mrn,name\n1,"Doe, Jane"');
  });
});

describe('quote-aware line splitting - export/import round-trip', () => {
  test('a quoted field containing a newline round-trips (not torn across lines)', () => {
    // extractColumns quotes a cell with an embedded newline; importing it back
    // must treat the quoted newline as part of ONE field, not a row break.
    const { records } = importCsv(cfg({ dedupKey: 'id' }), [
      { source: 'in.csv', text: 'id,note\n1,seed' },
    ]);
    records.set('1', { id: '1', note: 'line one\nline two' });
    const csv = extractColumns(records, ['id', 'note']);
    expect(csv).toBe('id,note\n1,"line one\nline two"');

    const round = importCsv(cfg({ dedupKey: 'id' }), [{ source: 'out.csv', text: csv }]);
    // Without quote-aware splitting the newline tears the row: an EXTRA seen row
    // + a column-count-mismatch needsReview + a truncated field.
    expect(round.job.counts).toEqual({ seen: 1, created: 1, merged: 0, needsReview: 0 });
    expect(round.records.get('1')).toEqual({ id: '1', note: 'line one\nline two' });
  });
});

describe('person projection from the SAME contract', () => {
  test('toMyRecordsStatus narrows the job', () => {
    const { job } = importCsv(cfg(), [
      { source: 'p.csv', text: 'mrn,name\n1,A\n1,A\n,bad' },
    ]);
    expect(toMyRecordsStatus(job)).toEqual({ seen: 3, merged: 1, needsReview: 1 });
  });
});
