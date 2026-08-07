import { createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

import {
  buildExternalEventEnvelope,
  buildWebhookV2Headers,
  canonicalJson,
  classifyHttpOutcome,
  resolveSafeDestination,
  type DestinationPolicyOptions,
  type ExternalEventEnvelope,
  verifyWebhookV2,
  WebhookVerificationError,
  type WebhookKey,
} from '@appspine/integration-contracts';

import { DomainEventRetryableError, DomainEventTerminalError } from './domain-event-errors';
import type { DomainEventRecord } from './types';

const DEFAULT_TIMEOUT_MS = 10000;
const REDACTED = '[REDACTED]';
const REDACT_KEYS = ['password', 'token', 'secret', 'apikey', 'api_key', 'hashedkey'];

export interface PostDomainEventWebhookInput {
  event: DomainEventRecord;
  url: string;
  secret: string;
  timeoutMs?: number;
}

export type PostDomainEventWebhookV2Input = {
  event: DomainEventRecord;
  url: string;
  keyId: string;
  secret: string;
  destinationPolicy?: DestinationPolicyOptions;
  timeoutMs?: number;
  now?: Date;
};

export function buildIntegrationEventEnvelope(event: DomainEventRecord): ExternalEventEnvelope {
  if (
    !event.integrationCapabilityId ||
    !event.integrationCapabilityVersion ||
    !event.integrationCapabilityDigest ||
    !event.integrationBindingId ||
    !event.integrationBindingVersion ||
    !event.integrationSourceApp ||
    event.integrationPayload === undefined ||
    event.integrationPayload === null
  ) {
    throw new Error(`Domain event ${event.id} does not contain frozen integration metadata`);
  }
  return buildExternalEventEnvelope({
    eventId: event.id,
    eventType: event.eventType,
    capabilityId: event.integrationCapabilityId,
    capabilityVersion: event.integrationCapabilityVersion,
    capabilityDigest: event.integrationCapabilityDigest,
    bindingId: event.integrationBindingId,
    bindingVersion: event.integrationBindingVersion,
    envelopeVersion: event.integrationEnvelopeVersion ?? '2',
    sourceApp: event.integrationSourceApp,
    occurredAt: event.createdAt.toISOString(),
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    correlationId: event.correlationId,
    actor: { userId: event.actorUserId },
    payload: event.integrationPayload,
    payloadDigest: event.integrationPayloadDigest ?? undefined,
  });
}

export async function postDomainEventWebhookV2({
  event,
  url,
  keyId,
  secret,
  destinationPolicy,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = new Date(),
}: PostDomainEventWebhookV2Input): Promise<void> {
  const destination = await resolveSafeDestination(url, {
    production: true,
    ...destinationPolicy,
  });
  const envelope = buildIntegrationEventEnvelope(event);
  const body = canonicalJson(envelope);
  const timestamp = now.toISOString();
  const headers = buildWebhookV2Headers({
    keyId,
    secret,
    method: 'POST',
    requestTarget: `${destination.url.pathname}${destination.url.search}`,
    timestamp,
    eventId: envelope.eventId,
    sourceApp: envelope.sourceApp,
    capabilityId: envelope.capabilityId,
    capabilityVersion: envelope.capabilityVersion,
    bindingId: envelope.bindingId,
    bindingVersion: envelope.bindingVersion,
    body,
  });
  try {
    const response = await postToFixedDestination(destination, body, headers, timeoutMs);
    const responseBody = response.body;
    const parsedBody = parseJson(responseBody);
    const outcome = classifyHttpOutcome(
      response.status,
      response.headers,
      parsedBody,
      envelope.eventId,
    );
    if (outcome.kind === 'processed') return;
    if (outcome.kind === 'retryable')
      throw new DomainEventRetryableError(`Webhook delivery failed with HTTP ${response.status}`, {
        status: response.status,
        retryAfterMs: outcome.retryAfterMs,
      });
    throw new DomainEventTerminalError(
      `Webhook delivery failed with HTTP ${response.status}`,
      response.status,
    );
  } catch (error) {
    if (error instanceof DomainEventTerminalError || error instanceof DomainEventRetryableError)
      throw error;
    throw new DomainEventRetryableError('Webhook request failed');
  }
}

export function verifyDomainEventWebhookV2(
  input: Parameters<typeof verifyWebhookV2>[0] & {
    bindingEnabled?: (bindingId: string) => boolean;
  },
): ReturnType<typeof verifyWebhookV2> {
  const contentType = input.headers['content-type'] ?? input.headers['Content-Type'] ?? '';
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType))
    throw new WebhookVerificationError('unsupported_content_type', 'Webhook content type must be application/json');
  const verified = verifyWebhookV2({ ...input, maxBodyBytes: input.maxBodyBytes ?? 1_048_576 });
  if (input.bindingEnabled && !input.bindingEnabled(verified.bindingId))
    throw new WebhookVerificationError('binding_disabled', 'Webhook binding is temporarily disabled', { retryable: true, status: 503 });
  let envelope: unknown;
  try { envelope = JSON.parse(typeof input.body === 'string' ? input.body : Buffer.from(input.body).toString('utf8')); }
  catch { throw new WebhookVerificationError('invalid_json', 'Webhook body is not valid JSON'); }
  if (!envelope || typeof envelope !== 'object') throw new WebhookVerificationError('invalid_envelope', 'Webhook body is not an envelope');
  const body = envelope as Record<string, unknown>;
  const expected: Record<string, unknown> = {
    eventId: verified.eventId,
    sourceApp: verified.sourceApp,
    capabilityId: verified.capabilityId,
    capabilityVersion: verified.capabilityVersion,
    bindingId: verified.bindingId,
    bindingVersion: verified.bindingVersion,
  };
  for (const [key, expectedValue] of Object.entries(expected))
    if (body[key] !== expectedValue) throw new WebhookVerificationError('envelope_binding_mismatch', `Webhook envelope ${key} does not match signed headers`);
  if (body.envelopeVersion !== '2') throw new WebhookVerificationError('unsupported_envelope', 'Unsupported external event envelope version');
  const key = input.keyResolver(verified.keyId);
  if (key?.capabilityDigest && body.capabilityDigest !== key.capabilityDigest)
    throw new WebhookVerificationError('capability_digest_mismatch', 'Webhook envelope capability digest does not match the configured key');
  return verified;
}

export type DomainEventWebhookKeyResolver = (keyId: string) => WebhookKey | undefined;

export function buildDomainEventWebhookPayload(event: DomainEventRecord): Record<string, unknown> {
  return {
    id: event.id,
    seq: event.seq.toString(),
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    operation: event.operation,
    schemaVersion: event.schemaVersion,
    actorUserId: event.actorUserId,
    correlationId: event.correlationId,
    workflowId: event.workflowId,
    before: redactDomainEventWebhookValue(event.before),
    after: redactDomainEventWebhookValue(event.after),
    changedFields: event.changedFields,
    metadata: redactDomainEventWebhookValue(event.metadata),
    createdAt: event.createdAt.toISOString(),
  };
}

export function redactDomainEventWebhookValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactDomainEventWebhookValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        shouldRedact(key) ? REDACTED : redactDomainEventWebhookValue(nestedValue),
      ]),
    );
  }
  return value;
}

export function createDomainEventWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export async function postDomainEventWebhook({
  event,
  url,
  secret,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: PostDomainEventWebhookInput): Promise<void> {
  const body = JSON.stringify(buildDomainEventWebhookPayload(event));
  const timestamp = new Date().toISOString();
  const signature = createDomainEventWebhookSignature(secret, timestamp, body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-appspine-event-id': event.id,
        'x-appspine-event-type': event.eventType,
        'x-appspine-signature': `sha256=${signature}`,
        'x-appspine-timestamp': timestamp,
      },
      body,
      signal: controller.signal,
    });
    await response.arrayBuffer().catch(() => undefined);
    if (!response.ok) {
      throw new Error(`Webhook POST failed with HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function shouldRedact(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACT_KEYS.some((redactKey) => normalized.includes(redactKey));
}

function parseJson(value: string): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

type FixedDestinationResponse = {
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
};

function postToFixedDestination(
  destination: Awaited<ReturnType<typeof resolveSafeDestination>>,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<FixedDestinationResponse> {
  const request = destination.url.protocol === 'https:' ? httpsRequest : httpRequest;
  const address = destination.addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(destination.url, {
      method: 'POST',
      headers,
      servername: destination.url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, address, isIP(address)),
      timeout: timeoutMs,
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1_048_576) {
          req.destroy(new Error('Webhook response body exceeds the configured limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])),
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Webhook request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}
