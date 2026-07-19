// Unified Zod schema family root (HORIZON-unified-schema-family-S1, ADR-0266).
//
// A discriminated union over the 5 recurring config-node kinds the platform
// re-invents per surface today (UiConfig/ServiceConfig/WorkflowConfig(Flow-IR)/
// SearchConfig/SyncConfig - ADR-0266 context section, verified zero prior
// unification). `kind` is the discriminator; each member is its own config
// family schema plus that one literal field, so `ConfigNode` answers "is this
// document a valid config node, and which kind" in one parse.
//
// Scope (S1, definition only): the union root + exhaustive kind coverage.
// Wiring `resolveUi`/codegen emitters to CONSUME this union is S2; migrating
// builder-studio onto it is S3 (HORIZON-unified-schema-family-S2/-S3). Do not
// edit ../../ui/schema.ts or ../../ui/resolve.ts from this lane.
//
// Staged in tools/codegen pending the `@curaos/contracts` lane (see
// ui-config.schema.ts header) - the eventual home per ADR-0266 is
// `curaos/backend/packages/contracts/src/cir/cir.ts`.
import { z } from 'zod';

import { SearchConfig } from './search-config.schema';
import { ServiceConfig } from './service-config.schema';
import { SyncConfig } from './sync-config.schema';
import { UiConfig } from './ui-config.schema';
import { WorkflowConfig } from './workflow-config.schema';

const UiConfigNode = UiConfig.extend({ kind: z.literal('ui') });
const ServiceConfigNode = ServiceConfig.extend({ kind: z.literal('service') });
const WorkflowConfigNode = WorkflowConfig.extend({ kind: z.literal('workflow') });
const SearchConfigNode = SearchConfig.extend({ kind: z.literal('search') });
const SyncConfigNode = SyncConfig.extend({ kind: z.literal('sync') });

export const ConfigNode = z.discriminatedUnion('kind', [
  UiConfigNode,
  ServiceConfigNode,
  WorkflowConfigNode,
  SearchConfigNode,
  SyncConfigNode,
]);

export type ConfigNode = z.infer<typeof ConfigNode>;
export type ConfigNodeKind = ConfigNode['kind'];

/** Validate an unknown value as any one of the 5 config-node kinds. Throws a
 *  ZodError on a malformed or unrecognized-`kind` input. */
export function parseConfigNode(input: unknown): ConfigNode {
  return ConfigNode.parse(input);
}
