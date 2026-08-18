/**
 * The generator registry (PL2-03, extended by PL2-05).
 *
 * Its own module because every generator imports `sourceDigest` from `generate.ts`; keeping the
 * list there too would make each generator a cycle with the framework it uses. PL2-06 and PL2-07
 * add a line each.
 */

import { generateComposition } from './composition';
import type { GeneratedArtifact, GenerationInput, Generator } from './generate';
import { generateCatalog } from './generate';

export const GENERATORS: readonly Generator[] = [generateCatalog, generateComposition];

/** Sorted by path, so the artefact list — and the lockfile that digests it — is order-independent. */
export function generateAll(input: GenerationInput): GeneratedArtifact[] {
  return GENERATORS.map((generate) => generate(input)).sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}
