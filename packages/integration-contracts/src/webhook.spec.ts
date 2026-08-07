import { describe, expect, it } from 'vitest';

import { buildWebhookV2Headers, verifyWebhookV2 } from './webhook';

describe('Webhook Protocol v2', () => {
  const base = {
    keyId: 'approve-key-1',
    sourceApp: 'approve',
    capabilityId: 'approve.knowledge-document-change-approved',
    capabilityVersion: '1.0.0',
    bindingId: 'approve-to-wiki.knowledge-document-change-approved',
    bindingVersion: '1.0.0',
    method: 'POST',
    requestTarget: '/integrations/approve/events?tenant=demo',
    timestamp: '2026-08-07T00:00:00.000Z',
    eventId: 'event-1',
    body: '{"eventId":"event-1"}',
    secret: 'test-secret',
  } as const;

  it('round-trips the deterministic signing vector', () => {
    const headers = buildWebhookV2Headers(base);
    expect(headers['X-Appspine-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/u);
    expect(
      verifyWebhookV2({
        method: base.method,
        requestTarget: base.requestTarget,
        body: base.body,
        headers,
        now: new Date(base.timestamp),
        keyResolver: () => ({
          keyId: base.keyId,
          secret: base.secret,
          sourceApp: base.sourceApp,
          capabilityId: base.capabilityId,
          capabilityVersion: base.capabilityVersion,
          bindingId: base.bindingId,
          bindingVersion: base.bindingVersion,
        }),
      }),
    ).toMatchObject({ eventId: 'event-1', bindingId: base.bindingId });
  });

  it('fails closed when binding metadata is changed', () => {
    const headers = buildWebhookV2Headers(base);
    headers['X-Appspine-Binding-Id'] = 'other-binding';
    expect(() =>
      verifyWebhookV2({
        method: base.method,
        requestTarget: base.requestTarget,
        body: base.body,
        headers,
        now: new Date(base.timestamp),
        keyResolver: () => ({ ...base }),
      }),
    ).toThrow('binding metadata');
  });
});
