import { createHmac } from 'node:crypto';

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
