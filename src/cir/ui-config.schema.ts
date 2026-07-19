// UiConfig CIR member (HORIZON-unified-schema-family-S1, ADR-0266).
//
// Vendored MINIMAL stand-in, not a duplicate of the real UiConfig. The full
// L0-L3 UiConfig (tokens/semantic/componentDefaults/app layers, WCAG-contrast
// superRefine, DEFAULT_SHORTCUTS registry) is owned by
// tools/codegen/src/ui/schema.ts (UIGEN-2) in the curaos superproject, a
// different git repo outside this lane's edit boundary (submodule-only).
// That file's own header already names this package
// (`@curaos/contracts/src/cir/ui-config.schema.ts`) as ADR-0266's eventual
// real home, but re-pointing tools/codegen to import FROM here is a
// tools/codegen edit - out of scope for this lane, flagged as a follow-up.
//
// Duplicating the 374-line real schema (contrast math, shortcut binding
// regex, superRefine) here would fork logic that already has one owner
// (curaos_reuse_dry_rule). Every real UiConfig field is optional/defaulted
// (UIGEN-2), so the only shape ConfigNode's `kind: 'ui'` member actually owes
// callers today is "no required fields" - hence the passthrough empty shape
// below. Do not grow this file with real UiConfig fields; extend the owning
// schema instead and land the re-export wiring as the follow-up noted above.
import { z } from 'zod';

export const UiConfig = z.object({}).passthrough();
export type UiConfig = z.infer<typeof UiConfig>;
