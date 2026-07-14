import { describe, expect, it } from 'vitest';
import {
  createMcpRequestHash,
  executeIdempotentWrite,
  type McpIdempotencyBeginInput,
  type McpIdempotencyCompleteInput,
  McpIdempotencyError,
  type McpIdempotencyFailInput,
  type McpIdempotencyRecord,
  type McpIdempotencyStore,
  type McpTransactionRunner,
} from './idempotency';

class ImmediateRunner implements McpTransactionRunner<undefined> {
  async transaction<T>(work: (tx: undefined) => Promise<T>): Promise<T> {
    return work(undefined);
  }
}

class MemoryStore implements McpIdempotencyStore<undefined> {
  readonly records = new Map<string, McpIdempotencyRecord>();

  constructor(records: McpIdempotencyRecord[] = []) {
    for (const record of records) this.records.set(record.operationId, record);
  }

  async find(operationId: string): Promise<McpIdempotencyRecord | null> {
    return this.records.get(operationId) ?? null;
  }

  async insertProcessing(input: McpIdempotencyBeginInput): Promise<boolean> {
    if (this.records.has(input.operationId)) return false;
    this.records.set(input.operationId, {
      operationId: input.operationId,
      requestHash: input.requestHash,
      status: 'processing',
      leaseExpiresAt: input.leaseExpiresAt,
    });
    return true;
  }

  async claimStaleProcessing(input: McpIdempotencyBeginInput): Promise<boolean> {
    const record = this.records.get(input.operationId);
    if (record?.status !== 'processing' || record.requestHash !== input.requestHash) {
      return false;
    }
    this.records.set(input.operationId, { ...record, leaseExpiresAt: input.leaseExpiresAt });
    return true;
  }

  async complete(input: McpIdempotencyCompleteInput): Promise<void> {
    const record = this.records.get(input.operationId);
    if (!record) throw new Error('record not found');
    this.records.set(input.operationId, {
      ...record,
      requestHash: input.requestHash,
      status: 'succeeded',
      result: input.result,
    });
  }

  async fail(input: McpIdempotencyFailInput): Promise<void> {
    const record = this.records.get(input.operationId);
    if (!record) throw new Error('record not found');
    this.records.set(input.operationId, {
      ...record,
      requestHash: input.requestHash,
      status: 'failed',
      error: input.error,
    });
  }
}

const runner = new ImmediateRunner();
const fixedNow = () => new Date('2026-07-14T00:00:00.000Z');

function requestHash(request: unknown): string {
  return createMcpRequestHash({ operationName: 'create_page', request });
}

describe('createMcpRequestHash', () => {
  it('canonicalizes object keys before hashing', () => {
    expect(requestHash({ title: 'A', body: { b: 2, a: 1 } })).toBe(
      requestHash({ body: { a: 1, b: 2 }, title: 'A' }),
    );
  });

  it('includes the operation name in the hash', () => {
    const request = { title: 'A' };

    expect(createMcpRequestHash({ operationName: 'create_page', request })).not.toBe(
      createMcpRequestHash({ operationName: 'update_page', request }),
    );
  });
});

describe('executeIdempotentWrite', () => {
  it('fails closed when a write operation id is missing', async () => {
    await expect(
      executeIdempotentWrite({
        operationId: ' ',
        operationName: 'create_page',
        request: { title: 'A' },
        store: new MemoryStore(),
        transactionRunner: runner,
        handler: async () => ({ id: 'page-1' }),
      }),
    ).rejects.toMatchObject({ code: 'MCP_IDEMPOTENCY_MISSING_OPERATION_ID' });
  });

  it('persists a processing record and returns the handler result on first use', async () => {
    const store = new MemoryStore();

    const result = await executeIdempotentWrite({
      operationId: 'op-1',
      operationName: 'create_page',
      request: { title: 'A' },
      store,
      transactionRunner: runner,
      now: fixedNow,
      handler: async () => ({ id: 'page-1' }),
    });

    expect(result).toEqual({ id: 'page-1' });
    expect(store.records.get('op-1')).toMatchObject({
      status: 'succeeded',
      result: { id: 'page-1' },
    });
  });

  it('replays a completed result for the same operation id and request hash', async () => {
    const request = { title: 'A' };
    const store = new MemoryStore([
      {
        operationId: 'op-1',
        requestHash: requestHash(request),
        status: 'succeeded',
        leaseExpiresAt: new Date('2026-07-14T00:05:00.000Z'),
        result: { id: 'page-1' },
      },
    ]);

    const result = await executeIdempotentWrite({
      operationId: 'op-1',
      operationName: 'create_page',
      request,
      store,
      transactionRunner: runner,
      handler: async () => {
        throw new Error('handler should not run');
      },
    });

    expect(result).toEqual({ id: 'page-1' });
  });

  it('rejects the same operation id with a different request hash', async () => {
    const store = new MemoryStore([
      {
        operationId: 'op-1',
        requestHash: requestHash({ title: 'A' }),
        status: 'succeeded',
        leaseExpiresAt: new Date('2026-07-14T00:05:00.000Z'),
        result: { id: 'page-1' },
      },
    ]);

    await expect(
      executeIdempotentWrite({
        operationId: 'op-1',
        operationName: 'create_page',
        request: { title: 'B' },
        store,
        transactionRunner: runner,
        handler: async () => ({ id: 'page-2' }),
      }),
    ).rejects.toMatchObject({ code: 'MCP_IDEMPOTENCY_CONFLICT' });
  });

  it('rejects a duplicate while the original lease is still processing', async () => {
    const request = { title: 'A' };
    const store = new MemoryStore([
      {
        operationId: 'op-1',
        requestHash: requestHash(request),
        status: 'processing',
        leaseExpiresAt: new Date('2026-07-14T00:05:00.000Z'),
      },
    ]);

    await expect(
      executeIdempotentWrite({
        operationId: 'op-1',
        operationName: 'create_page',
        request,
        store,
        transactionRunner: runner,
        now: fixedNow,
        handler: async () => ({ id: 'page-1' }),
      }),
    ).rejects.toMatchObject({ code: 'MCP_IDEMPOTENCY_IN_PROGRESS' });
  });

  it('claims a stale processing record and completes the retry', async () => {
    const request = { title: 'A' };
    const store = new MemoryStore([
      {
        operationId: 'op-1',
        requestHash: requestHash(request),
        status: 'processing',
        leaseExpiresAt: new Date('2026-07-13T23:59:00.000Z'),
      },
    ]);

    const result = await executeIdempotentWrite({
      operationId: 'op-1',
      operationName: 'create_page',
      request,
      store,
      transactionRunner: runner,
      now: fixedNow,
      handler: async () => ({ id: 'page-1' }),
    });

    expect(result).toEqual({ id: 'page-1' });
    expect(store.records.get('op-1')).toMatchObject({ status: 'succeeded' });
  });

  it('persists a failed state when the handler throws', async () => {
    const store = new MemoryStore();
    const error = new Error('database rejected the write');

    await expect(
      executeIdempotentWrite({
        operationId: 'op-1',
        operationName: 'create_page',
        request: { title: 'A' },
        store,
        transactionRunner: runner,
        now: fixedNow,
        handler: async () => {
          throw error;
        },
      }),
    ).rejects.toThrow(error);

    expect(store.records.get('op-1')).toMatchObject({
      status: 'failed',
      error: { name: 'Error', message: 'database rejected the write' },
    });
  });

  it('rethrows a stored failure without rerunning the handler', async () => {
    const request = { title: 'A' };
    const store = new MemoryStore([
      {
        operationId: 'op-1',
        requestHash: requestHash(request),
        status: 'failed',
        leaseExpiresAt: new Date('2026-07-14T00:05:00.000Z'),
        error: { name: 'Error', message: 'database rejected the write' },
      },
    ]);

    await expect(
      executeIdempotentWrite({
        operationId: 'op-1',
        operationName: 'create_page',
        request,
        store,
        transactionRunner: runner,
        handler: async () => ({ id: 'page-1' }),
      }),
    ).rejects.toBeInstanceOf(McpIdempotencyError);
  });
});
