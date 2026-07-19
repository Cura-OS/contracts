// SyncConfig CIR member (HORIZON-unified-schema-family-S1, ADR-0266,
// ADR-0283). Staged here pending the `@curaos/contracts` lane; see
// ui-config.schema.ts header for why.
//
// Shape is ADR-0283 Implementation guidance step 1's concrete `SyncConfig`,
// reused verbatim (destination file `sync-config.schema.ts`, same name).
import { z } from 'zod';

export const SyncConfig = z.object({
  engine: z.enum(['powersync', 'electric', 'none']).default('none'),
  mode: z.enum(['bidirectional-offline', 'live-read-subscription']),
  scope: z.array(z.string()), // table/resource names this service exposes to sync
  conflictStrategy: z.enum(['last-write-wins', 'server-wins', 'custom-merge']).optional(), // bidirectional-offline only
  permissionPredicate: z.string(), // ref into the shared #1061/#1063 access-context resolver
  auditSigning: z.boolean().default(false), // far-horizon: verifiable-audit-grade-sync
  meshProfile: z.enum(['none', 'p2p-libp2p']).default('none'), // far-horizon: p2p-offline-mesh
});

export type SyncConfig = z.infer<typeof SyncConfig>;
