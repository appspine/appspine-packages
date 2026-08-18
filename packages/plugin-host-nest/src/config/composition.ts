/**
 * Generated composition input (PL1-03).
 *
 * This is the contract `@appspine/plugin-cli` (PL2-05) will emit into
 * `.appspine/generated/backend/composition.ts`, and the shape the host consumes either way. It is
 * frozen in Phase 1 so the CLI has something to target that already has a working consumer, rather
 * than the CLI and the host agreeing on a shape only once both exist.
 *
 * Static imports only: the generated file imports each plugin by its public `./plugin` subpath and
 * puts the resulting descriptor here. The host never resolves a package name at runtime.
 */

import type { PluginInventoryEntry } from '@appspine/plugin-api';
import type { HostPluginRegistration } from './host-config';

export const COMPOSITION_SCHEMA_VERSION = 'appspine.composition/v1' as const;

export interface GeneratedComposition {
  schemaVersion: typeof COMPOSITION_SCHEMA_VERSION;
  /** Digest of the resolution the generator produced; the host rejects a mismatch. */
  resolutionDigest: string;
  /** Inventory exactly as it was when the file was generated. */
  inventory: PluginInventoryEntry[];
  /** Statically imported plugin descriptors, in the generator's resolved order. */
  plugins: HostPluginRegistration[];
  /** Provenance for `plugin doctor` and drift detection. */
  generatedBy: { tool: string; version: string };
}

export function isGeneratedComposition(value: unknown): value is GeneratedComposition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as GeneratedComposition).schemaVersion === COMPOSITION_SCHEMA_VERSION
  );
}
