import { describe, expect, it } from 'vitest';

import { DomainEventRegistry } from './domain-event-registry';

function noopHandler(key: string) {
  return { key, async handle() {} };
}

describe('DomainEventRegistry', () => {
  it('matches exact handlers by event type and resolves prefix handlers', () => {
    const registry = new DomainEventRegistry();
    const handler = noopHandler('audit-record');
    registry.on('submitted', handler);
    registry.on('approved', handler);
    registry.registerPrefix('webhook.post:', (handlerKey) => noopHandler(handlerKey));

    expect(registry.matchingHandlerKeys('submitted')).toEqual(['audit-record']);
    expect(registry.matchingHandlerKeys('approved')).toEqual(['audit-record']);
    expect(registry.matchingHandlerKeys('rejected')).toEqual([]);
    expect(registry.resolve('audit-record')?.key).toBe('audit-record');
    expect(registry.resolve('webhook.post:sub-1')?.key).toBe('webhook.post:sub-1');
    expect(registry.resolve('unknown')).toBeNull();
  });

  it('rejects a duplicate handler key for the same event type', () => {
    const registry = new DomainEventRegistry();
    const handler = noopHandler('audit-record');
    registry.on('submitted', handler);
    expect(() => registry.on('submitted', handler)).toThrow(/already registered/);
  });

  it('rejects an exact handler key containing ":"', () => {
    const registry = new DomainEventRegistry();
    expect(() => registry.on('bad', noopHandler('webhook.post:sub-1'))).toThrow(/must not contain/);
  });

  it('lets the same handler instance subscribe to many event types under one key', () => {
    const registry = new DomainEventRegistry();
    const shared = noopHandler('audit-record');
    registry.on('submitted', shared);
    registry.on('approved', shared);
    registry.on('rejected', shared);
    expect(registry.resolve('audit-record')).toBe(shared);
  });

  it('rejects a different handler stealing an already-registered key under another event type', () => {
    const registry = new DomainEventRegistry();
    registry.on('submitted', noopHandler('audit-record'));
    expect(() => registry.on('rejected', noopHandler('audit-record'))).toThrow(
      /already registered to a different handler/,
    );
  });

  it('appends handler-key contributor results, in registration order, across contributors', async () => {
    const registry = new DomainEventRegistry();
    registry.registerHandlerKeyContributor(async (_tx, input) =>
      input.eventType === 'submitted' ? ['webhook.post:hook-1'] : [],
    );
    registry.registerHandlerKeyContributor(async () => ['webhook.post:hook-2']);

    expect(await registry.contributeHandlerKeys(null, { eventType: 'submitted' })).toEqual([
      'webhook.post:hook-1',
      'webhook.post:hook-2',
    ]);
    expect(await registry.contributeHandlerKeys(null, { eventType: 'rejected' })).toEqual([
      'webhook.post:hook-2',
    ]);
  });

  it('returns an empty array with no contributors registered', async () => {
    const registry = new DomainEventRegistry();
    expect(await registry.contributeHandlerKeys(null, { eventType: 'submitted' })).toEqual([]);
  });
});
