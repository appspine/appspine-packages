import { canonicalJsonValue, sha256Digest } from './canonical';
import type { ExternalEventEnvelope, IntegrationEventMetadata, JsonValue } from './types';

export function freezeJsonValue<T extends JsonValue>(value: T): T {
  const clone = canonicalJsonValue(value) as T;
  return deepFreeze(clone);
}

export function freezeIntegrationMetadata(
  input: IntegrationEventMetadata,
): IntegrationEventMetadata {
  const payload = freezeJsonValue(input.payload);
  const payloadDigest = sha256Digest(payload);
  if (input.payloadDigest && input.payloadDigest !== payloadDigest) {
    throw new Error(
      `Integration payload digest mismatch: expected ${input.payloadDigest}, got ${payloadDigest}`,
    );
  }
  return deepFreeze({
    ...input,
    envelopeVersion: input.envelopeVersion ?? '2',
    payload,
    payloadDigest,
  });
}

export type ExternalEventEnvelopeInput = Omit<
  ExternalEventEnvelope,
  'payloadDigest' | 'payload' | 'envelopeVersion'
> & {
  envelopeVersion?: string;
  payload: JsonValue;
  payloadDigest?: string;
};

export function buildExternalEventEnvelope(
  input: ExternalEventEnvelopeInput,
): ExternalEventEnvelope {
  const payload = freezeJsonValue(input.payload);
  const payloadDigest = sha256Digest(payload);
  if (input.payloadDigest && input.payloadDigest !== payloadDigest) {
    throw new Error(
      `External event payload digest mismatch: expected ${input.payloadDigest}, got ${payloadDigest}`,
    );
  }
  return deepFreeze({
    ...input,
    envelopeVersion: input.envelopeVersion ?? '2',
    payload,
    payloadDigest,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
