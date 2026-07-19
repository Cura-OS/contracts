// WorkflowConfig CIR member (HORIZON-unified-schema-family-S1, ADR-0266).
// Staged here pending the `@curaos/contracts` lane; see ui-config.schema.ts
// header for why.
//
// ADR-0266: "Workflow source is Flow-IR documents under
// ai/curaos/docs/workflows, unconnected to the contract IR." This schema
// models the real on-disk Flow-IR shape (verified against
// ai/curaos/docs/workflows/*.flow.json: id/version/metadata/context/graph/
// policies). `graph.nodes[]`/`edges[]` carry a wide, per-node-type-varying
// payload, so node/edge internals stay `.passthrough()` records here rather
// than an exhaustive per-node-type union - narrowing that is downstream
// wiring work (S2), not this definition-only story.
import { z } from 'zod';

const FlowNode = z.object({ id: z.string().min(1), type: z.string() }).passthrough();
const FlowEdge = z.object({ from: z.string().min(1), to: z.string().min(1) }).passthrough();

export const WorkflowConfig = z.object({
  $schema: z.string().optional(),
  id: z.string().min(1),
  version: z.string(),
  metadata: z
    .object({
      name: z.string(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      tenantScope: z.string().optional(),
      owner: z.string().optional(),
      surfaces: z.array(z.string()).optional(),
    })
    .passthrough(),
  context: z
    .object({
      inputs: z.record(z.string(), z.unknown()).optional(),
      outputs: z.record(z.string(), z.unknown()).optional(),
      variables: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough(),
  graph: z.object({
    nodes: z.array(FlowNode),
    edges: z.array(FlowEdge),
  }),
  policies: z.record(z.string(), z.unknown()).optional(),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfig>;
