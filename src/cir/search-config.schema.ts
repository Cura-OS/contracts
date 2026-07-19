// SearchConfig CIR member (HORIZON-unified-schema-family-S1, ADR-0266,
// ADR-0279). Staged here pending the `@curaos/contracts` lane; see
// ui-config.schema.ts header for why.
//
// Shape matches ADR-0279 Implementation guidance step 4's `dist/search-mapping.json`
// entry exactly: `{ service, domain, alias, fields: string[], tenancy }`.
import { z } from 'zod';

export const SearchConfig = z.object({
  service: z.string().min(1),
  domain: z.string().min(1),
  alias: z.string().min(1), // e.g. "{tenant}.<domain>.<entity>"
  fields: z.array(z.string()),
  tenancy: z.enum(['schema-per-tenant', 'index-per-tenant']),
});

export type SearchConfig = z.infer<typeof SearchConfig>;
