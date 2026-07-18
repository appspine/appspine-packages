import { describe, expect, it } from 'vitest';
import type { DomainEventHandlerInput } from './domain-event-registry';
import { DomainEventRegistry } from './domain-event-registry';
import {
  DomainEventSubscriber,
  readDomainEventSubscriberOptions,
  registerDomainEventSubscribers,
} from './domain-event-subscriber.decorator';

@DomainEventSubscriber({
  key: 'audit-record',
  eventType: ['submitted', 'approved'],
  description: 'Writes an audit log row for every approval instance action.',
})
class AuditRecordHandler {
  readonly key = 'audit-record';
  async handle(_input: DomainEventHandlerInput): Promise<void> {}
}

@DomainEventSubscriber({
  key: 'single-event',
  eventType: 'submitted',
  description: 'Subscribes to a single event type via the string convenience form.',
})
class SingleEventHandler {
  readonly key = 'single-event';
  async handle(_input: DomainEventHandlerInput): Promise<void> {}
}

@DomainEventSubscriber({
  key: 'wrong-key',
  eventType: 'submitted',
  description: 'Decorator key deliberately does not match handler.key.',
})
class KeyMismatchHandler {
  readonly key = 'actual-key';
  async handle(_input: DomainEventHandlerInput): Promise<void> {}
}

@DomainEventSubscriber({
  key: 'blank-description',
  eventType: 'submitted',
  description: '   ',
})
class BlankDescriptionHandler {
  readonly key = 'blank-description';
  async handle(_input: DomainEventHandlerInput): Promise<void> {}
}

class UndecoratedHandler {
  readonly key = 'undecorated';
  async handle(_input: DomainEventHandlerInput): Promise<void> {}
}

describe('registerDomainEventSubscribers', () => {
  it('reads decorator metadata off the constructor and wires dispatch + descriptor', () => {
    const registry = new DomainEventRegistry();
    const handler = new AuditRecordHandler();

    registerDomainEventSubscribers([handler], registry);

    expect(registry.matchingHandlerKeys('submitted')).toEqual(['audit-record']);
    expect(registry.matchingHandlerKeys('approved')).toEqual(['audit-record']);
    expect(registry.resolve('audit-record')).toBe(handler);
    expect(registry.describe().subscribers).toEqual([
      {
        key: 'audit-record',
        eventTypes: ['submitted', 'approved'],
        description: 'Writes an audit log row for every approval instance action.',
      },
    ]);
  });

  it('normalizes a single string eventType into a one-element array descriptor', () => {
    const registry = new DomainEventRegistry();
    registerDomainEventSubscribers([new SingleEventHandler()], registry);

    expect(registry.matchingHandlerKeys('submitted')).toEqual(['single-event']);
    expect(registry.describe().subscribers).toEqual([
      {
        key: 'single-event',
        eventTypes: ['submitted'],
        description: 'Subscribes to a single event type via the string convenience form.',
      },
    ]);
  });

  it('throws when a handler instance has no @DomainEventSubscriber metadata', () => {
    const registry = new DomainEventRegistry();
    expect(() => registerDomainEventSubscribers([new UndecoratedHandler()], registry)).toThrow(
      /missing @DomainEventSubscriber/,
    );
  });

  it('throws when the decorator key does not match handler.key', () => {
    const registry = new DomainEventRegistry();
    expect(() => registerDomainEventSubscribers([new KeyMismatchHandler()], registry)).toThrow(
      /does not match its handler\.key/,
    );
  });

  it('throws when the description is blank', () => {
    const registry = new DomainEventRegistry();
    expect(() => registerDomainEventSubscribers([new BlankDescriptionHandler()], registry)).toThrow(
      /must have a non-empty description/,
    );
  });

  it('returns undefined for an undecorated instance via readDomainEventSubscriberOptions', () => {
    expect(readDomainEventSubscriberOptions(new UndecoratedHandler())).toBeUndefined();
  });
});
