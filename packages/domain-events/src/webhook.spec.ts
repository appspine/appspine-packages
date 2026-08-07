import { describe, expect, it, vi } from 'vitest';

import {
  buildExternalEventEnvelope,
  buildWebhookV2Headers,
  canonicalJson,
} from '@appspine/integration-contracts';

import { DomainEventOperation, type DomainEventRecord } from './types';
import {
  buildDomainEventWebhookPayload,
  createDomainEventWebhookSignature,
  postDomainEventWebhook,
  postDomainEventWebhookV2,
  redactDomainEventWebhookValue,
  verifyDomainEventWebhookV2,
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
    integrationCapabilityId: null,
    integrationCapabilityVersion: null,
    integrationCapabilityDigest: null,
    integrationBindingId: null,
    integrationBindingVersion: null,
    integrationEnvelopeVersion: null,
    integrationSourceApp: null,
    integrationPayload: null,
    integrationPayloadDigest: null,
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

describe('postDomainEventWebhookV2 destination policy', () => {
  it('cannot be downgraded from production HTTPS by caller policy', async () => {
    await expect(
      postDomainEventWebhookV2({
        event: event({
          integrationCapabilityId: 'fixture.capability',
          integrationCapabilityVersion: '1.0.0',
          integrationCapabilityDigest: 'sha256:' + '0'.repeat(64),
          integrationBindingId: 'fixture.binding',
          integrationBindingVersion: '1.0.0',
          integrationEnvelopeVersion: '2',
          integrationSourceApp: 'fixture',
          integrationPayload: { revision: 1 },
          integrationPayloadDigest: 'sha256:' + '0'.repeat(64),
        }),
        url: 'http://events.example.invalid/webhook',
        keyId: 'fixture-key',
        secret: 'secret',
        destinationPolicy: {
          production: false,
          allowedHosts: ['events.example.invalid'],
          resolve: async () => ['8.8.8.8'],
        },
      }),
    ).rejects.toThrow('must use HTTPS');
  });
});

describe('verifyDomainEventWebhookV2', () => {
  const key = {
    keyId: 'approve-key-1',
    secret: 'secret',
    sourceApp: 'approve',
    capabilityId: 'approve.document.approved',
    capabilityVersion: '1.0.0',
    capabilityDigest: 'sha256:capability',
    bindingId: 'approve-to-wiki.document.approved',
    bindingVersion: '1.0.0',
  } as const;

  function signedBody(overrides: Record<string, unknown> = {}) {
    const envelope = buildExternalEventEnvelope({
      eventId: 'event-1',
      eventType: 'document.approved',
      capabilityId: key.capabilityId,
      capabilityVersion: key.capabilityVersion,
      capabilityDigest: key.capabilityDigest,
      bindingId: key.bindingId,
      bindingVersion: key.bindingVersion,
      sourceApp: key.sourceApp,
      occurredAt: '2026-08-07T00:00:00.000Z',
      aggregateType: 'Document',
      aggregateId: 'doc-1',
      correlationId: null,
      actor: { userId: 'user-1' },
      payload: { revision: 2 },
      ...overrides,
    });
    const body = canonicalJson(envelope);
    return {
      body,
      headers: buildWebhookV2Headers({
        ...key,
        method: 'POST',
        requestTarget: '/events',
        timestamp: '2026-08-07T00:00:00.000Z',
        eventId: 'event-1',
        body,
      }),
    };
  }

  it('binds the parsed envelope to the signed headers and configured digest', () => {
    const input = signedBody();
    expect(
      verifyDomainEventWebhookV2({
        method: 'POST',
        requestTarget: '/events',
        body: input.body,
        headers: input.headers,
        now: new Date('2026-08-07T00:00:00.000Z'),
        keyResolver: () => key,
      }),
    ).toMatchObject({ eventId: 'event-1', bindingId: key.bindingId });
  });

  it('rejects a body envelope that does not match the signed event ID', () => {
    const input = signedBody({ eventId: 'different-event' });
    expect(() => verifyDomainEventWebhookV2({
      method: 'POST',
      requestTarget: '/events',
      body: input.body,
      headers: input.headers,
      now: new Date('2026-08-07T00:00:00.000Z'),
      keyResolver: () => key,
    })).toThrow('envelope eventId');
  });

  it('requires JSON content type and returns retryable 503 for a disabled binding', () => {
    const input = signedBody();
    expect(() => verifyDomainEventWebhookV2({
      method: 'POST',
      requestTarget: '/events',
      body: input.body,
      headers: { ...input.headers, 'content-type': 'text/plain' },
      keyResolver: () => key,
    })).toThrow('content type');
    try {
      verifyDomainEventWebhookV2({
        method: 'POST',
        requestTarget: '/events',
        body: input.body,
        headers: input.headers,
        now: new Date('2026-08-07T00:00:00.000Z'),
        keyResolver: () => key,
        bindingEnabled: () => false,
      });
      throw new Error('expected disabled binding error');
    } catch (error) {
      expect(error).toMatchObject({ code: 'binding_disabled', retryable: true, status: 503 });
    }
  });
});
