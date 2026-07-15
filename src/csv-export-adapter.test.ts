import { describe, expect, test } from 'bun:test';
import { importCsv } from './csv-adapter';
import {
  type CsvExportConfig,
  type ExportRecord,
  csvEscape,
  exportCsv,
} from './csv-export-adapter';
import { toMyRecordsExportStatus } from './export-types';

const cfg = (over: Partial<CsvExportConfig> = {}): CsvExportConfig => ({
  id: 'exp-1',
  tenant: 't1',
  mode: 'file',
  dedupKey: 'mrn',
  columns: ['mrn', 'name'],
  ...over,
});

const recs = (
  entries: Array<[string, ExportRecord]>,
): Map<string, ExportRecord> => new Map(entries);

describe('csvEscape', () => {
  test('quotes cells with comma, quote, or newline', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('Doe, Jane')).toBe('"Doe, Jane"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });
  test('neutralizes formula-injection leading chars', () => {
    expect(csvEscape('=1+2')).toBe("'=1+2");
    expect(csvEscape('+1')).toBe("'+1");
    expect(csvEscape('-1')).toBe("'-1");
    expect(csvEscape('@cmd')).toBe("'@cmd");
    // still quoted when a neutralized cell also carries a comma
    expect(csvEscape('=a,b')).toBe('"\'=a,b"');
  });
});

describe('exportCsv - record -> row mapping + counts', () => {
  test('maps records to a single CSV file in file mode', () => {
    const { job, files } = exportCsv(
      cfg(),
      recs([
        ['1', { mrn: '1', name: 'Alice' }],
        ['2', { mrn: '2', name: 'Bob' }],
      ]),
    );
    expect(files).toHaveLength(1);
    expect(files[0].text).toBe('mrn,name\n1,Alice\n2,Bob');
    expect(job.counts).toEqual({ selected: 2, exported: 2, failed: 0 });
    expect(job.format).toBe('csv');
    expect(job.status).toBe('succeeded');
    expect(job.failedRecords).toHaveLength(0);
  });

  test('extracts only the chosen columns, quoting as needed', () => {
    const { files } = exportCsv(
      cfg({ columns: ['mrn', 'name'] }),
      recs([['1', { mrn: '1', name: 'Doe, Jane', city: 'NYC' }]]),
    );
    expect(files[0].text).toBe('mrn,name\n1,"Doe, Jane"');
  });
});

describe('exportCsv - directory/archive partitioning', () => {
  test('directory mode with partitionSize splits into many files, each with a header', () => {
    const { job, files } = exportCsv(
      cfg({ mode: 'exportDirectory', partitionSize: 1 }),
      recs([
        ['1', { mrn: '1', name: 'Alice' }],
        ['2', { mrn: '2', name: 'Bob' }],
      ]),
    );
    expect(job.mode).toBe('exportDirectory');
    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({ name: 'export-0.csv', text: 'mrn,name\n1,Alice' });
    expect(files[1]).toEqual({ name: 'export-1.csv', text: 'mrn,name\n2,Bob' });
    expect(job.counts.exported).toBe(2);
  });

  test('archive mode partitions the same way (zipped upstream)', () => {
    const { files } = exportCsv(
      cfg({ mode: 'archive', partitionSize: 5 }),
      recs([['1', { mrn: '1', name: 'Alice' }]]),
    );
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('export-0.csv');
  });
});

describe('exportCsv - failed-record quarantine with reason', () => {
  test('record missing a required column is quarantined, not exported', () => {
    const { job, files } = exportCsv(
      cfg({ requiredColumns: ['name'] }),
      recs([
        ['1', { mrn: '1', name: 'Alice' }],
        ['2', { mrn: '2', name: '' }],
      ]),
    );
    expect(job.counts).toEqual({ selected: 2, exported: 1, failed: 1 });
    expect(files[0].text).toBe('mrn,name\n1,Alice');
    expect(job.failedRecords[0]).toMatchObject({ key: '2' });
    expect(job.failedRecords[0].reason).toContain('missing required column');
  });

  test('status is failed when nothing could be exported', () => {
    const { job } = exportCsv(
      cfg({ requiredColumns: ['name'] }),
      recs([['1', { mrn: '1', name: '' }]]),
    );
    expect(job.status).toBe('failed');
    expect(job.counts.exported).toBe(0);
  });

  test('empty selection succeeds with an empty file', () => {
    const { job } = exportCsv(cfg(), recs([]));
    expect(job.status).toBe('succeeded');
    expect(job.counts).toEqual({ selected: 0, exported: 0, failed: 0 });
  });
});

describe('import -> export round-trips through the shared record map', () => {
  test('exportCsv consumes the exact Map importCsv produces', () => {
    const { records } = importCsv(
      { id: 'j', tenant: 't1', mode: 'file', dedupKey: 'mrn' },
      [{ source: 'p.csv', text: 'mrn,name\n1,Alice\n1,Alice2' }],
    );
    const { files, job } = exportCsv(cfg(), records);
    expect(job.counts.exported).toBe(1);
    expect(files[0].text).toBe('mrn,name\n1,Alice2');
  });
});

describe('person projection from the SAME contract', () => {
  test('toMyRecordsExportStatus narrows the job', () => {
    const { job } = exportCsv(
      cfg({ requiredColumns: ['name'] }),
      recs([
        ['1', { mrn: '1', name: 'Alice' }],
        ['2', { mrn: '2', name: '' }],
      ]),
    );
    expect(toMyRecordsExportStatus(job)).toEqual({
      status: 'succeeded',
      selected: 2,
      exported: 1,
    });
  });
});
