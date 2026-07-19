// ServiceConfig CIR member (HORIZON-unified-schema-family-S1, ADR-0266).
// Staged here pending the `@curaos/contracts` lane; see ui-config.schema.ts
// header for why (edit-boundary + submodule availability), same rationale.
//
// ADR-0266: "ServiceConfig is the `contract` + `capabilities` view; do not
// duplicate." `contract` mirrors schema-derive-emit.ts's `DerivedContract`
// shape (`{ tables, wireModels }`) at the structural level only - the real
// per-table/per-column typing stays owned by that TS interface; wiring an
// actual DerivedContract through this schema is S2 ("wire resolveUi +
// emitters"), not this definition-only story.
import { z } from 'zod';

const DerivedContractShape = z.object({
  tables: z.array(z.record(z.string(), z.unknown())),
  wireModels: z.array(z.record(z.string(), z.unknown())),
});

// The capability facets ADR-0266's CIR envelope enumerates.
export const ServiceConfig = z.object({
  contract: DerivedContractShape,
  capabilities: z.object({
    tenancy: z.enum(['shared-schema', 'schema-per-tenant', 'db-per-tenant']),
    phi: z.enum(['none', 'redacted', 'compartmented']),
    auth: z.enum(['none', 'jwt', 'smart-fhir']),
    pagination: z.enum(['cursor', 'page']),
    ownership: z.array(z.string()),
    events: z.enum(['outbox', 'none']),
    streaming: z.enum(['sse', 'ws', 'none']),
    idempotent: z.boolean(),
  }),
});

export type ServiceConfig = z.infer<typeof ServiceConfig>;
