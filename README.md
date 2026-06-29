# @curaos/contracts

Bulk-import contracts for CuraOS. THE mold every bulk-import gap regenerates from.

- `specs/import-job.tsp` - typed contract: `ImportJob`, `ImportMode` (importDirectory / archive / file), `FailedRow`, `ImportCounts` (seen / created / merged / needsReview), `MyRecordsImportStatus`.
- `src/types.ts` - runtime mirror of the spec + `toMyRecordsStatus(job)` person projection.
- `src/csv-adapter.ts` - CSV adapter ON the mold: `importCsv(config, sources)` (row->record mapping, duplicate prevention by `dedupKey`, failed-row quarantine with reason, counts) and `extractColumns(records, columns)` (admin extract + person "export my data").

CSV is an ADAPTER on the `ImportJob` contract, not a new contract. Future formats (XLSX, JSON) are additional adapters on the same mold.

The admin migration console and the person's "import status of my records" view read the SAME `ImportJob`; `toMyRecordsStatus` is the only narrowing (no raw payloads or source paths leak to the person).

## License attribution

The import-job model (directory/archive/file mode split, failed-row quarantine-with-reason, seen/merged/needs-review counts, dedup-by-identifier merge) is port-adapted from [WorldVistA health-data-standards](https://github.com/projectcypress/health-data-standards) `BulkRecordImporter` - Copyright (c) The MITRE Corporation / WorldVistA, licensed Apache-2.0. Fresh TypeScript expressing the model; no source copied. The bahmni idempotent-upsert dup-prevention pattern informed the design as reference only; no source lifted.

Test: `bun test`. Typecheck: `tsc --noEmit`.
