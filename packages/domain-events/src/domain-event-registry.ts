import type {
  DomainEventDeliveryRecord,
  DomainEventRecord,
  DomainEventRegistryDescription,
  DomainEventSubscriberDescriptor,
} from './types';

export type DomainEventHandlerInput = {
  event: DomainEventRecord;
  delivery: DomainEventDeliveryRecord;
};

export type DomainEventHandler = {
  key: string;
  handle(input: DomainEventHandlerInput): Promise<void>;
};

/**
 * Called with the same transaction client `DomainEventsService.record()` received, plus the
 * event being recorded, to append extra delivery handler keys beyond code-registered handlers
 * (e.g. app-local data-driven routing such as webhook subscriptions). Keeps that lookup out of
 * the generic record/fan-out path so it carries no app-specific model dependency.
 */
export type HandlerKeyContributor = (
  tx: unknown,
  input: { eventType: string },
) => Promise<string[]>;

export class DomainEventRegistry {
  private readonly exactHandlers = new Map<string, DomainEventHandler[]>();
  private readonly prefixResolvers = new Map<
    string,
    (handlerKey: string) => DomainEventHandler | null
  >();
  private readonly handlersByKey = new Map<string, DomainEventHandler>();
  private readonly handlerKeyContributors: HandlerKeyContributor[] = [];
  private readonly subscriberDescriptors = new Map<string, DomainEventSubscriberDescriptor>();

  on(eventType: string, handler: DomainEventHandler): void {
    this.assertValidHandlerKey(handler.key);

    const existing = this.handlersByKey.get(handler.key);
    if (existing && existing !== handler) {
      throw new Error(
        `Domain event handler key already registered to a different handler: ${handler.key}`,
      );
    }

    const handlers = this.exactHandlers.get(eventType) ?? [];
    if (handlers.some((candidate) => candidate.key === handler.key)) {
      throw new Error(
        `Domain event handler key already registered for ${eventType}: ${handler.key}`,
      );
    }

    this.handlersByKey.set(handler.key, handler);
    handlers.push(handler);
    this.exactHandlers.set(eventType, handlers);
  }

  registerPrefix(prefix: string, resolve: (handlerKey: string) => DomainEventHandler | null): void {
    if (this.prefixResolvers.has(prefix)) {
      throw new Error(`Domain event handler prefix already registered: ${prefix}`);
    }
    this.prefixResolvers.set(prefix, resolve);
  }

  registerHandlerKeyContributor(contributor: HandlerKeyContributor): void {
    this.handlerKeyContributors.push(contributor);
  }

  matchingHandlerKeys(eventType: string): string[] {
    return (this.exactHandlers.get(eventType) ?? []).map((handler) => handler.key);
  }

  async contributeHandlerKeys(tx: unknown, input: { eventType: string }): Promise<string[]> {
    if (this.handlerKeyContributors.length === 0) return [];
    const contributed = await Promise.all(
      this.handlerKeyContributors.map((contributor) => contributor(tx, input)),
    );
    return contributed.flat();
  }

  resolve(handlerKey: string): DomainEventHandler | null {
    const exact = this.handlersByKey.get(handlerKey);
    if (exact) return exact;

    for (const [prefix, resolve] of this.prefixResolvers) {
      if (handlerKey.startsWith(prefix)) return resolve(handlerKey);
    }

    return null;
  }

  /**
   * Records introspection metadata for a code-registered subscriber. Called once per handler
   * instance by `registerDomainEventSubscribers()`, separately from the per-event-type `on()`
   * calls it also makes, since one descriptor can cover many event types.
   */
  describeSubscriber(descriptor: DomainEventSubscriberDescriptor): void {
    const existing = this.subscriberDescriptors.get(descriptor.key);
    if (existing) {
      throw new Error(`Domain event subscriber already described for key: ${descriptor.key}`);
    }
    this.subscriberDescriptors.set(descriptor.key, descriptor);
  }

  /**
   * Introspection snapshot for admin/catalog surfaces. Data-driven routing (prefixes and
   * handler-key contributors) is reported by existence only — those are operations-time
   * decisions with no per-key description to show.
   */
  describe(): DomainEventRegistryDescription {
    return {
      subscribers: [...this.subscriberDescriptors.values()],
      dataDrivenPrefixes: [...this.prefixResolvers.keys()],
      hasHandlerKeyContributors: this.handlerKeyContributors.length > 0,
    };
  }

  private assertValidHandlerKey(handlerKey: string): void {
    if (handlerKey.includes(':')) {
      throw new Error(`Domain event handler key must not contain ':': ${handlerKey}`);
    }
  }
}
