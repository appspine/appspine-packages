import { createHmac, timingSafeEqual } from 'node:crypto';

import { sha256Hex } from './canonical';
import type { WebhookKey, WebhookVerificationContext } from './types';

export const WEBHOOK_V2_VERSION = '2';
export const WEBHOOK_V2_HEADERS = {
  version: 'X-Appspine-Webhook-Version',
  keyId: 'X-Appspine-Key-Id',
  eventId: 'X-Appspine-Event-Id',
  capabilityId: 'X-Appspine-Capability-Id',
  capabilityVersion: 'X-Appspine-Capability-Version',
  bindingId: 'X-Appspine-Binding-Id',
  bindingVersion: 'X-Appspine-Binding-Version',
  timestamp: 'X-Appspine-Timestamp',
  signature: 'X-Appspine-Signature',
} as const;

export type WebhookV2Input = WebhookVerificationContext & {
  keyId: string;
  eventId: string;
  method: string;
  requestTarget: string;
  timestamp: string;
  body: string | Uint8Array;
  secret: string;
};

export type WebhookV2Headers = Record<string, string> & { 'content-type': string };

export class WebhookVerificationError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = 'WebhookVerificationError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? 401;
  }
}

export function buildWebhookV2SigningInput(input: Omit<WebhookV2Input, 'secret'>): string {
  return [
    `v${WEBHOOK_V2_VERSION}`,
    input.method.toUpperCase(),
    input.requestTarget,
    input.timestamp,
    input.eventId,
    input.capabilityId,
    input.capabilityVersion,
    input.bindingId,
    input.bindingVersion,
    sha256Hex(input.body),
  ].join('\n');
}

export function createWebhookV2Signature(input: WebhookV2Input): string {
  return createHmac('sha256', input.secret).update(buildWebhookV2SigningInput(input)).digest('hex');
}

export function buildWebhookV2Headers(input: WebhookV2Input): WebhookV2Headers {
  return {
    'content-type': 'application/json',
    [WEBHOOK_V2_HEADERS.version]: WEBHOOK_V2_VERSION,
    [WEBHOOK_V2_HEADERS.keyId]: input.keyId,
    [WEBHOOK_V2_HEADERS.eventId]: input.eventId,
    [WEBHOOK_V2_HEADERS.capabilityId]: input.capabilityId,
    [WEBHOOK_V2_HEADERS.capabilityVersion]: input.capabilityVersion,
    [WEBHOOK_V2_HEADERS.bindingId]: input.bindingId,
    [WEBHOOK_V2_HEADERS.bindingVersion]: input.bindingVersion,
    [WEBHOOK_V2_HEADERS.timestamp]: input.timestamp,
    [WEBHOOK_V2_HEADERS.signature]: `sha256=${createWebhookV2Signature(input)}`,
  };
}

export type VerifyWebhookV2Input = {
  method: string;
  requestTarget: string;
  body: string | Uint8Array;
  headers: Record<string, string | undefined>;
  now?: Date;
  maxAgeMs?: number;
  maxBodyBytes?: number;
  keyResolver: (keyId: string) => WebhookKey | undefined;
};

export function verifyWebhookV2(
  input: VerifyWebhookV2Input,
): WebhookVerificationContext & { eventId: string; timestamp: string } {
  const headers = normalizeHeaders(input.headers);
  const bodySize =
    typeof input.body === 'string' ? Buffer.byteLength(input.body) : input.body.byteLength;
  if (input.maxBodyBytes !== undefined && bodySize > input.maxBodyBytes)
    throw new WebhookVerificationError(
      'body_too_large',
      'Webhook body exceeds the configured limit',
      { status: 413 },
    );
  if (headers['x-appspine-webhook-version'] !== WEBHOOK_V2_VERSION)
    throw new WebhookVerificationError(
      'unsupported_version',
      'Unsupported webhook protocol version',
    );
  const keyId = requiredHeader(headers, 'x-appspine-key-id');
  const context = input.keyResolver(keyId);
  if (!context) throw new WebhookVerificationError('unknown_key', 'Webhook key is not configured');
  const expected = {
    keyId,
    sourceApp: context.sourceApp,
    capabilityId: requiredHeader(headers, 'x-appspine-capability-id'),
    capabilityVersion: requiredHeader(headers, 'x-appspine-capability-version'),
    bindingId: requiredHeader(headers, 'x-appspine-binding-id'),
    bindingVersion: requiredHeader(headers, 'x-appspine-binding-version'),
    method: input.method,
    requestTarget: input.requestTarget,
    timestamp: requiredHeader(headers, 'x-appspine-timestamp'),
    eventId: requiredHeader(headers, 'x-appspine-event-id'),
    body: input.body,
  };
  if (
    expected.sourceApp !== context.sourceApp ||
    expected.capabilityId !== context.capabilityId ||
    expected.capabilityVersion !== context.capabilityVersion ||
    expected.bindingId !== context.bindingId ||
    expected.bindingVersion !== context.bindingVersion
  )
    throw new WebhookVerificationError(
      'binding_mismatch',
      'Webhook binding metadata does not match the configured key',
    );
  const timestamp = Date.parse(expected.timestamp);
  const ageMs = Math.abs((input.now ?? new Date()).getTime() - timestamp);
  if (!Number.isFinite(timestamp) || ageMs > (input.maxAgeMs ?? 300_000))
    throw new WebhookVerificationError(
      'stale_timestamp',
      'Webhook timestamp is outside the freshness window',
    );
  const signature = requiredHeader(headers, 'x-appspine-signature');
  const supplied = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : '';
  const secrets = [
    context.secret,
    ...(context.previousSecret &&
    context.previousKeyExpiresAt &&
    Date.parse(context.previousKeyExpiresAt) >= (input.now ?? new Date()).getTime()
      ? [context.previousSecret]
      : []),
  ];
  const valid = secrets.some((secret) =>
    safeEqual(supplied, createWebhookV2Signature({ ...expected, secret })),
  );
  if (!valid)
    throw new WebhookVerificationError('invalid_signature', 'Webhook signature is invalid');
  return {
    keyId,
    eventId: expected.eventId,
    sourceApp: context.sourceApp,
    capabilityId: expected.capabilityId,
    capabilityVersion: expected.capabilityVersion,
    bindingId: expected.bindingId,
    bindingVersion: expected.bindingVersion,
    timestamp: expected.timestamp,
  };
}

function normalizeHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function requiredHeader(headers: Record<string, string>, name: string): string {
  const value = headers[name];
  if (!value)
    throw new WebhookVerificationError('missing_header', `Missing required header ${name}`);
  return value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
