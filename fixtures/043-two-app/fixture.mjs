#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const require = createRequire(import.meta.url);
const integration = require(resolve(root, 'packages/integration-contracts/dist/index.js'));
const { withIntegrationEventReceipt } = require(
  resolve(root, 'packages/domain-events/dist/receipt.js'),
);

const index = JSON.parse(readFileSync(resolve(root, 'knowledge/contracts/index.json'), 'utf8'));
const capability = index.contracts.find(
  (item) => item.contractId === 'approve.knowledge-document-change-approved',
);
const binding = index.contracts.find(
  (item) => item.contractId === 'approve-to-wiki.knowledge-document-change-approved',
);
assert(capability && binding, 'canonical event capability and binding must be indexed');
const bindingMarkdown = readFileSync(resolve(root, binding.source), 'utf8');
assert.equal(
  bindingMarkdown.match(/^ {2}digest: (sha256:[0-9a-f]{64})$/mu)?.[1],
  capability.digest,
);

class ProviderStore {
  constructor() {
    this.requests = new Map();
    this.nextId = 1;
  }
  submit(idempotencyKey, request) {
    const existing = this.requests.get(idempotencyKey);
    if (existing)
      return JSON.stringify(existing.request) === JSON.stringify(request)
        ? { status: 200, changeRequestId: existing.id }
        : { status: 409 };
    const entry = { id: `cr-fixture-${this.nextId++}`, request, status: 'PENDING' };
    this.requests.set(idempotencyKey, entry);
    return { status: 202, changeRequestId: entry.id };
  }
  getStatus(id) {
    return [...this.requests.values()].find((entry) => entry.id === id) ?? { status: 'NOT_FOUND' };
  }
  approve(id) {
    const entry = [...this.requests.values()].find((candidate) => candidate.id === id);
    if (!entry) return 'NOT_FOUND';
    entry.status = 'APPROVED';
    return entry.status;
  }
}

class ReceiptStore {
  constructor(store) {
    this.store = store;
  }
  get integrationEventReceipt() {
    return this.clientFor(this.store).integrationEventReceipt;
  }
  async $transaction(callback) {
    const working = new Map(this.store);
    const result = await callback(this.clientFor(working));
    this.store.clear();
    for (const [key, value] of working) this.store.set(key, value);
    return result;
  }
  clientFor(store) {
    return {
      integrationEventReceipt: {
        findUnique: async ({ where }) =>
          store.get(`${where.sourceApp_eventId.sourceApp}:${where.sourceApp_eventId.eventId}`) ??
          null,
        create: async ({ data }) => {
          const key = `${data.sourceApp}:${data.eventId}`;
          if (store.has(key)) throw { code: 'P2002' };
          const record = {
            id: `receipt-${store.size + 1}`,
            ...data,
            processedAt: new Date(),
            createdAt: new Date(),
          };
          store.set(key, record);
          return record;
        },
      },
    };
  }
}

const payload = {
  changeRequestId: 'cr-fixture-001',
  documentId: 'doc-fixture-001',
  revision: 7,
  contentChecksum: `sha256:${'a'.repeat(64)}`,
  approvedAt: '2026-08-07T00:00:00.000Z',
  actor: { userId: 'approve-fixture-operator' },
};
const eventSchema = JSON.parse(
  readFileSync(
    resolve(
      root,
      'knowledge/contracts/capabilities/approve.knowledge-document-change-approved/versions/1.0.0/schemas/event.schema.json',
    ),
    'utf8',
  ),
);
assert.deepEqual(integration.validateJsonSchema(payload, eventSchema), []);

const provider = new ProviderStore();
const caller = { status: new Map(), receipts: new Map() };
const submit = provider.submit('idem-fixture-001', { documentId: 'doc-fixture-001', revision: 7 });
assert.equal(submit.status, 202);
assert.equal(
  provider.submit('idem-fixture-001', { documentId: 'doc-fixture-001', revision: 7 }).status,
  200,
);
assert.equal(
  provider.submit('idem-fixture-001', { documentId: 'doc-fixture-001', revision: 8 }).status,
  409,
);
assert.equal(provider.getStatus(submit.changeRequestId).status, 'PENDING');

const envelope = integration.buildExternalEventEnvelope({
  eventId: 'evt-fixture-001',
  eventType: 'approve.knowledge-document-change-approved',
  capabilityId: capability.contractId,
  capabilityVersion: capability.version,
  capabilityDigest: capability.digest,
  bindingId: binding.contractId,
  bindingVersion: binding.version,
  sourceApp: 'approve',
  occurredAt: '2026-08-07T00:00:01.000Z',
  aggregateType: 'KnowledgeDocumentChangeRequest',
  aggregateId: submit.changeRequestId,
  correlationId: submit.changeRequestId,
  actor: { userId: 'approve-fixture-operator' },
  payload,
});
assert(Object.isFrozen(envelope) && Object.isFrozen(envelope.payload));
assert.equal(provider.approve(submit.changeRequestId), 'APPROVED');
const delivered = await withIntegrationEventReceipt(
  new ReceiptStore(caller.receipts),
  envelope,
  async () => {
    caller.status.set(submit.changeRequestId, 'CONFIRMED');
    return 'updated';
  },
);
assert.equal(delivered.duplicate, false);
assert.equal(
  (
    await withIntegrationEventReceipt(
      new ReceiptStore(caller.receipts),
      envelope,
      async () => 'not-called',
    )
  ).duplicate,
  true,
);

const mismatched = {
  ...envelope,
  payloadDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
};
await assert.rejects(() =>
  withIntegrationEventReceipt(
    new ReceiptStore(caller.receipts),
    mismatched,
    async () => 'not-called',
  ),
);
assert.equal(caller.status.get(submit.changeRequestId), 'CONFIRMED');
console.log(
  '043 two-app fixture passed: submit, replay, conflict, status reconciliation, event receipt, and digest mismatch',
);
