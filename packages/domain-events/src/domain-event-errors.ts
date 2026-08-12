export class DomainEventIgnoredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainEventIgnoredError';
  }
}

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
