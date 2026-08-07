import type { DeliveryOutcome } from './types';

export class DomainEventTerminalError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'DomainEventTerminalError';
    this.status = status;
  }
}

export class DomainEventRetryableError extends Error {
  readonly retryAfterMs?: number;
  readonly status?: number;
  constructor(message: string, options: { retryAfterMs?: number; status?: number } = {}) {
    super(message);
    this.name = 'DomainEventRetryableError';
    this.retryAfterMs = options.retryAfterMs;
    this.status = options.status;
  }
}

export class DomainEventIgnoredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainEventIgnoredError';
  }
}

export function classifyHttpOutcome(
  status: number,
  headers: Record<string, string | undefined> = {},
  body?: unknown,
  expectedEventId?: string,
): DeliveryOutcome {
  if (status >= 200 && status < 300) return { kind: 'processed', status };
  if (status === 409 && isAlreadyProcessed(body, expectedEventId))
    return {
      kind: 'processed',
      status,
      eventId:
        typeof body === 'object' && body !== null && 'eventId' in body
          ? String((body as { eventId: unknown }).eventId)
          : undefined,
      reason: 'already_processed',
    };
  if (status === 408 || status === 425 || status === 429 || status >= 500)
    return { kind: 'retryable', status, retryAfterMs: boundedRetryAfter(headers['retry-after']) };
  return { kind: 'terminal', status };
}

export function boundedRetryAfter(
  value: string | undefined,
  maxMs = 86_400_000,
  nowMs = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.round(seconds * 1000), maxMs);
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.min(Math.max(timestamp - nowMs, 0), maxMs);
}

function isAlreadyProcessed(value: unknown, expectedEventId?: string): boolean {
  const eventId = typeof value === 'object' && value !== null && 'eventId' in value
    ? (value as { eventId?: unknown }).eventId
    : undefined;
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { status?: unknown }).status === 'already_processed' &&
    typeof eventId === 'string' &&
    (expectedEventId === undefined || eventId === expectedEventId)
  );
}
