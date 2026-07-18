import 'reflect-metadata';

import type { DomainEventHandler, DomainEventRegistry } from './domain-event-registry';
import type { DomainEventSubscriberOptions } from './types';

const DOMAIN_EVENT_SUBSCRIBER_METADATA_KEY = 'domain-events:subscriber';

/**
 * Class decorator carrying subscription metadata for `registerDomainEventSubscribers()` to read
 * and validate at boot. This is a *class* decorator — unlike `@McpTool()`'s method-level metadata
 * (read via `Object.getPrototypeOf(instance)`), the metadata here is read off the constructor
 * (`instance.constructor`), since the whole class is "the subscriber".
 *
 * Imports `reflect-metadata` directly (idempotent to import more than once) rather than relying
 * on some other module in the host app having already loaded the polyfill first — `@McpTool()` in
 * `packages/mcp-server` gets away with the ambient reliance only because it's always imported
 * alongside other `@nestjs/common` decorators; this package has no such guarantee.
 */
export function DomainEventSubscriber(options: DomainEventSubscriberOptions): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(DOMAIN_EVENT_SUBSCRIBER_METADATA_KEY, options, target);
  };
}

export function readDomainEventSubscriberOptions(
  instance: DomainEventHandler,
): DomainEventSubscriberOptions | undefined {
  return Reflect.getMetadata(DOMAIN_EVENT_SUBSCRIBER_METADATA_KEY, instance.constructor);
}

/**
 * Scans decorated handler instances and wires each into the registry: per-event-type dispatch
 * (`registry.on()`) plus a single introspection descriptor (`registry.describeSubscriber()`).
 * Fails loud on any of three conditions rather than silently skipping a mis-wired handler:
 *
 * 1. missing `@DomainEventSubscriber(...)` metadata entirely
 * 2. decorator `key` not matching the handler instance's own `key`
 * 3. empty/blank `description`
 */
export function registerDomainEventSubscribers(
  instances: DomainEventHandler[],
  registry: DomainEventRegistry,
): void {
  for (const instance of instances) {
    const options = readDomainEventSubscriberOptions(instance);
    if (!options) {
      throw new Error(
        `${instance.constructor.name} is missing @DomainEventSubscriber(...) — every domain event handler must be decorated.`,
      );
    }
    if (options.key !== instance.key) {
      throw new Error(
        `@DomainEventSubscriber key "${options.key}" on ${instance.constructor.name} does not match its handler.key "${instance.key}".`,
      );
    }
    if (!options.description.trim()) {
      throw new Error(
        `@DomainEventSubscriber on ${instance.constructor.name} (key "${options.key}") must have a non-empty description.`,
      );
    }

    const eventTypes = Array.isArray(options.eventType) ? options.eventType : [options.eventType];
    for (const eventType of eventTypes) {
      registry.on(eventType, instance);
    }
    registry.describeSubscriber({ eventTypes, key: options.key, description: options.description });
  }
}
