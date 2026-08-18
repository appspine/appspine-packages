/**
 * `@appspine/plugin-api/schema` — the machine-readable half of the manifest contract.
 *
 * Kept on its own subpath (rather than in the root barrel) so a consumer that only needs the
 * TypeScript types never pays for the schema document, and so non-TypeScript tooling can read
 * `@appspine/plugin-api/schema/appspine.plugin.v1.json` straight off disk.
 *
 * The document is a *refinement* of the PL0-05 contract frozen at
 * `knowledge/contracts/051-manifest-v1.schema.json`: every non-facet constraint is identical
 * (asserted by `src/schema.spec.ts`), and the `backend` / `operations` facet bodies are the
 * concrete shapes PL1-06 owns, which PL0-05 left deliberately opaque.
 */

import schemaDocument from './schema/appspine.plugin.v1.json';

/** Intentionally loose: this package validates *with* a schema, it does not model JSON Schema. */
export type JsonSchemaDocument = Record<string, unknown>;

export const MANIFEST_V1_SCHEMA_ID = 'https://appspine.dev/schema/appspine.plugin.v1.json';

export const manifestV1Schema: JsonSchemaDocument = schemaDocument as JsonSchemaDocument;

/** Deep copy, for callers that hand the document to a mutating validator. */
export function cloneManifestV1Schema(): JsonSchemaDocument {
  return JSON.parse(JSON.stringify(manifestV1Schema)) as JsonSchemaDocument;
}
