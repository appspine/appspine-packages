export const ContractKind = {
  CAPABILITY: 'capability',
  BINDING: 'binding',
} as const;
export type ContractKind = (typeof ContractKind)[keyof typeof ContractKind];

export const ContractInteraction = {
  COMMAND: 'command',
  QUERY: 'query',
  EVENT: 'event',
} as const;
export type ContractInteraction = (typeof ContractInteraction)[keyof typeof ContractInteraction];

export const ContractStatus = {
  DRAFT: 'draft',
  REVIEW: 'review',
  APPROVED: 'approved',
  DEPRECATED: 'deprecated',
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

export const ImplementationStatus = {
  PLANNED: 'planned',
  IMPLEMENTED: 'implemented',
  VERIFIED: 'verified',
  DISABLED: 'disabled',
} as const;
export type ImplementationStatus = (typeof ImplementationStatus)[keyof typeof ImplementationStatus];

export const ContractTransport = {
  HTTP: 'http',
  WEBHOOK: 'webhook',
  MESSAGE_BROKER: 'message-broker',
} as const;
export type ContractTransport = (typeof ContractTransport)[keyof typeof ContractTransport];

export const DataClassification = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  PERSONAL: 'PERSONAL',
  SENSITIVE: 'SENSITIVE',
  SECRET: 'SECRET',
} as const;
export type DataClassification = (typeof DataClassification)[keyof typeof DataClassification];

export type SemVer = `${number}.${number}.${number}`;

export type ContractReference = {
  contractId: string;
  version: string;
  digest: string;
};

export type CapabilityContract = {
  contractId: string;
  version: string;
  status: ContractStatus;
  interaction: ContractInteraction;
  transport: ContractTransport;
  provider?: string;
  callers?: string[];
  producer?: string;
  consumers?: string[];
  maintainer: string;
  requiredReviewers: string[];
  deprecatedAt?: string;
  supportUntil?: string;
  requestSchema?: JsonSchema;
  responseSchema?: JsonSchema;
  eventSchema?: JsonSchema;
};

export type BindingContract = {
  contractId: string;
  version: string;
  status: ContractStatus;
  interaction: ContractInteraction;
  capabilityRef: ContractReference;
  sourceApp: string;
  destinationApp: string;
  transport: ContractTransport;
  endpoint?: string;
  destinationKey?: string;
  authentication?: Record<string, unknown>;
  retry?: Record<string, unknown>;
  maintainer: string;
  requiredReviewers: string[];
  implementationStatus?: ImplementationStatus;
};

export type ContractManifest = {
  contractId: string;
  version: string;
  kind: ContractKind;
  digest: string;
  canonicalSource: string;
  artifacts: Record<string, string>;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonSchema = {
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  type?: string | string[];
  title?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  patternProperties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: JsonValue[];
  const?: JsonValue;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  pattern?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  'x-appspine-data-classification'?: DataClassification;
  [key: string]: unknown;
};

export type IntegrationEventMetadata = {
  capabilityId: string;
  capabilityVersion: string;
  capabilityDigest?: string;
  bindingId: string;
  bindingVersion: string;
  envelopeVersion?: string;
  sourceApp: string;
  payload: JsonValue;
  payloadDigest?: string;
  payloadSchema?: JsonSchema;
};

export type ExternalEventEnvelope = {
  eventId: string;
  eventType: string;
  capabilityId: string;
  capabilityVersion: string;
  capabilityDigest: string;
  bindingId: string;
  bindingVersion: string;
  envelopeVersion: string;
  sourceApp: string;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string | null;
  actor: { userId: string | null };
  payload: JsonValue;
  payloadDigest: string;
};

export type WebhookVerificationContext = {
  keyId: string;
  sourceApp: string;
  capabilityId: string;
  capabilityVersion: string;
  capabilityDigest: string;
  bindingId: string;
  bindingVersion: string;
};

export type WebhookKey = WebhookVerificationContext & {
  secret: string;
  previousSecret?: string;
  previousKeyExpiresAt?: string;
};

export type DeliveryOutcome = {
  kind: 'processed' | 'retryable' | 'terminal' | 'ignored';
  status?: number;
  eventId?: string;
  retryAfterMs?: number;
  reason?: string;
};

export type SchemaValidationIssue = {
  path: string;
  message: string;
  keyword?: string;
};
