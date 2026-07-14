import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import attachmentManifestSchema from './schemas/attachment-manifest.schema.json';
import callbackChallengeSchema from './schemas/callback-challenge.schema.json';
import claimRequestSchema from './schemas/claim-request.schema.json';
import claimResponseSchema from './schemas/claim-response.schema.json';
import commonSchema from './schemas/common.schema.json';
import completionSchema from './schemas/completion.schema.json';
import contentPartsSchema from './schemas/content-parts.schema.json';
import contextManifestSchema from './schemas/context-manifest.schema.json';
import ingressAcceptanceSchema from './schemas/ingress-acceptance.schema.json';
import ingressRequestSchema from './schemas/ingress-request.schema.json';
import structuredErrorSchema from './schemas/structured-error.schema.json';
import typedActionSchema from './schemas/typed-action.schema.json';

export const schemas = {
  common: commonSchema,
  ingressRequest: ingressRequestSchema,
  ingressAcceptance: ingressAcceptanceSchema,
  claimRequest: claimRequestSchema,
  claimResponse: claimResponseSchema,
  completion: completionSchema,
  contextManifest: contextManifestSchema,
  attachmentManifest: attachmentManifestSchema,
  contentParts: contentPartsSchema,
  typedAction: typedActionSchema,
  structuredError: structuredErrorSchema,
  callbackChallenge: callbackChallengeSchema,
} as const;

/**
 * Every schema is compiled in strict mode (throws on ambiguous/unknown
 * keywords rather than silently ignoring them) so drift between the schema
 * files and this package's validation behavior fails loudly at startup.
 */
export function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: true,
    // Several schemas legitimately use a JSON Schema union `type` array
    // (e.g. `["integer", "null"]` for a nullable field) — that is standard
    // 2020-12, not an ambiguity strict mode needs to guard against.
    allowUnionTypes: true,
    allErrors: true,
    addUsedSchema: false,
  });
  addFormats(ajv);

  // common must be registered first: every other schema $refs it by $id.
  ajv.addSchema(commonSchema);
  for (const [key, schema] of Object.entries(schemas)) {
    if (key === 'common') continue;
    ajv.addSchema(schema);
  }
  return ajv;
}

export type SchemaName = Exclude<keyof typeof schemas, 'common'>;

const schemaIdByName: Record<SchemaName, string> = {
  ingressRequest: (ingressRequestSchema as { $id: string }).$id,
  ingressAcceptance: (ingressAcceptanceSchema as { $id: string }).$id,
  claimRequest: (claimRequestSchema as { $id: string }).$id,
  claimResponse: (claimResponseSchema as { $id: string }).$id,
  completion: (completionSchema as { $id: string }).$id,
  contextManifest: (contextManifestSchema as { $id: string }).$id,
  attachmentManifest: (attachmentManifestSchema as { $id: string }).$id,
  contentParts: (contentPartsSchema as { $id: string }).$id,
  typedAction: (typedActionSchema as { $id: string }).$id,
  structuredError: (structuredErrorSchema as { $id: string }).$id,
  callbackChallenge: (callbackChallengeSchema as { $id: string }).$id,
};

let ajvSingleton: Ajv2020 | undefined;

/** Lazily-built, process-wide Ajv instance shared across getValidator() calls. */
function getAjv(): Ajv2020 {
  if (!ajvSingleton) ajvSingleton = createAjv();
  return ajvSingleton;
}

export function getValidator(name: SchemaName) {
  const validate = getAjv().getSchema(schemaIdByName[name]);
  if (!validate) {
    throw new Error(`chatbot-contracts: no compiled schema registered for "${name}"`);
  }
  return validate;
}
