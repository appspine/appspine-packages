import { describe, expect, it, vi } from 'vitest';

import { DomainEventOperation, type DomainEventRecord } from './types';
import {
  buildDomainEventWebhookPayload,
  createDomainEventWebhookSignature,
  postDomainEventWebhook,
  redactDomainEventWebhookValue,
} from './webhook';

function event(overrides: Partial<DomainEventRecord> = {}): DomainEventRecord {
  return {
    id: 'event-1',
    seq: 12n,
    aggregateType: 'WikiPage',
    aggregateId: 'page-1',
    eventType: 'wiki.page.updated',
    operation: DomainEventOperation.UPDATE,
    schemaVersion: 1,
    actorUserId: 'user-1',
    correlationId: 'corr-1',
    workflowId: 'workflow-1',
    before: { title: 'Old', secretToken: 'before-secret' },
    after: { title: 'New', nested: { hashedKey: 'after-secret' } },
    changedFields: ['title'],
    metadata: { api_key: 'metadata-secret', safe: 'visible' },
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    ...overrides,
  };
}

describe('buildDomainEventWebhookPayload', () => {
  it('serializes domain event records and redacts sensitive JSON fields', () => {
    expect(buildDomainEventWebhookPayload(event())).toEqual({
      id: 'event-1',
      seq: '12',
      aggregateType: 'WikiPage',
      aggregateId: 'page-1',
      eventType: 'wiki.page.updated',
      operation: DomainEventOperation.UPDATE,
      schemaVersion: 1,
      actorUserId: 'user-1',
      correlationId: 'corr-1',
      workflowId: 'workflow-1',
      before: { title: 'Old', secretToken: '[REDACTED]' },
      after: { title: 'New', nested: { hashedKey: '[REDACTED]' } },
      changedFields: ['title'],
      metadata: { api_key: '[REDACTED]', safe: 'visible' },
      createdAt: '2026-07-20T00:00:00.000Z',
    });
  });
});

describe('redactDomainEventWebhookValue', () => {
  it('redacts matching keys in arrays and nested objects', () => {
    expect(
      redactDomainEventWebhookValue([
        { password: 'secret' },
        { nested: { accessToken: 'secret' } },
      ]),
    ).toEqual([{ password: '[REDACTED]' }, { nested: { accessToken: '[REDACTED]' } }]);
  });
});

describe('createDomainEventWebhookSignature', () => {
  it('signs timestamp and body together', () => {
    expect(
      createDomainEventWebhookSignature('secret', '2026-07-20T00:00:00.000Z', '{"id":1}'),
    ).toBe('7984d7b59390cc88da86890c595f0811de63be6f9ee320a4d3ba07ddee23a6d4');
  });
});

describe('postDomainEventWebhook', () => {
  it('posts the signed payload and drains the response body', async () => {
    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, arrayBuffer });
    vi.stubGlobal('fetch', fetchMock);

    await postDomainEventWebhook({
      event: event(),
      url: 'https://example.invalid/webhook',
      secret: 'secret',
      timeoutMs: 1000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.invalid/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-appspine-event-id': 'event-1',
          'x-appspine-event-type': 'wiki.page.updated',
          'x-appspine-signature': expect.stringMatching(/^sha256=/),
          'x-appspine-timestamp': expect.any(String),
        }),
        body: expect.stringContaining('"seq":"12"'),
      }),
    );
    expect(arrayBuffer).toHaveBeenCalled();
  });

  it('throws for non-2xx responses after draining the body', async () => {
    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, arrayBuffer }));

    await expect(
      postDomainEventWebhook({
        event: event(),
        url: 'https://example.invalid/webhook',
        secret: 'secret',
      }),
    ).rejects.toThrow('Webhook POST failed with HTTP 500');
    expect(arrayBuffer).toHaveBeenCalled();
  });
});
