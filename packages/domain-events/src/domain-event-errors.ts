export class DomainEventIgnoredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainEventIgnoredError';
  }
}
