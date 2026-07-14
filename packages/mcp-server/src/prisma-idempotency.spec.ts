import { describe, expect, it } from 'vitest';
import type {
  PrismaMcpIdempotencyClient,
  PrismaMcpIdempotencyDelegate,
  PrismaTransactionClient,
} from './prisma-idempotency';
import {
  createPrismaMcpIdempotencyStore,
  createPrismaMcpTransactionRunner,
} from './prisma-idempotency';

type Row = Parameters<PrismaMcpIdempotencyDelegate['create']>[0]['data'] & {
  resultJson: unknown | null;
  errorJson: unknown | null;
};

class FakeDelegate implements PrismaMcpIdempotencyDelegate {
  readonly rows = new Map<string, Row>();

  async findUnique(args: Parameters<PrismaMcpIdempotencyDelegate['findUnique']>[0]) {
    return this.rows.get(key(args.where.mcp_idempotency_scope_operation_unique)) ?? null;
  }

  async create(args: Parameters<PrismaMcpIdempotencyDelegate['create']>[0]) {
    const rowKey = key(args.data);
    if (this.rows.has(rowKey)) {
      const error = new Error('unique constraint failed') as Error & { code: string };
      error.code = 'P2002';
      throw error;
    }
    const row = { ...args.data, resultJson: null, errorJson: null };
    this.rows.set(rowKey, row);
    return row;
  }

  async updateMany(args: Parameters<PrismaMcpIdempotencyDelegate['updateMany']>[0]) {
    const rowKey = key(args.where);
    const row = this.rows.get(rowKey);
    if (!row || row.requestHash !== args.where.requestHash || row.status !== args.where.status) {
      return { count: 0 };
    }
    this.rows.set(rowKey, { ...row, ...args.data });
    return { count: 1 };
  }
}

class FakePrisma implements PrismaTransactionClient {
  readonly mcpIdempotencyRecord = new FakeDelegate();
  transactionCount = 0;

  async $transaction<T>(work: (tx: PrismaMcpIdempotencyClient) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return work(this);
  }
}

const scope = { apiKeyId: 'api-key-1', toolName: 'create_page' };
const beginInput = {
  scope,
  operationId: 'op-1',
  requestHash: 'hash-1',
  leaseExpiresAt: new Date('2026-07-14T00:05:00.000Z'),
};

describe('PrismaMcpIdempotencyStore', () => {
  it('inserts and reads a processing record', async () => {
    const prisma = new FakePrisma();
    const store = createPrismaMcpIdempotencyStore();

    await expect(store.insertProcessing(beginInput, prisma)).resolves.toBe(true);

    await expect(store.find(scope, 'op-1', prisma)).resolves.toMatchObject({
      ...scope,
      operationId: 'op-1',
      requestHash: 'hash-1',
      status: 'processing',
    });
  });

  it('returns false on composite unique conflict', async () => {
    const prisma = new FakePrisma();
    const store = createPrismaMcpIdempotencyStore();

    await store.insertProcessing(beginInput, prisma);

    await expect(store.insertProcessing(beginInput, prisma)).resolves.toBe(false);
  });

  it('completes only the matching processing record', async () => {
    const prisma = new FakePrisma();
    const store = createPrismaMcpIdempotencyStore();
    await store.insertProcessing(beginInput, prisma);

    await store.complete({ ...beginInput, result: { id: 'page-1' } }, prisma);

    await expect(store.find(scope, 'op-1', prisma)).resolves.toMatchObject({
      status: 'succeeded',
      result: { id: 'page-1' },
    });
  });

  it('throws when completion does not match a processing request hash', async () => {
    const prisma = new FakePrisma();
    const store = createPrismaMcpIdempotencyStore();
    await store.insertProcessing(beginInput, prisma);

    await expect(
      store.complete({ ...beginInput, requestHash: 'different', result: {} }, prisma),
    ).rejects.toThrow(/failed to complete/);
  });

  it('uses the consuming app transaction runner', async () => {
    const prisma = new FakePrisma();
    const runner = createPrismaMcpTransactionRunner(prisma);

    await expect(
      runner.transaction(async (tx) =>
        tx.mcpIdempotencyRecord.create({
          data: beginInputToRowInput(),
        }),
      ),
    ).resolves.toMatchObject({ operationId: 'op-1' });
    expect(prisma.transactionCount).toBe(1);
  });
});

function key(input: { apiKeyId: string; toolName: string; operationId: string }): string {
  return `${input.apiKeyId}:${input.toolName}:${input.operationId}`;
}

function beginInputToRowInput() {
  return {
    ...scope,
    operationId: beginInput.operationId,
    requestHash: beginInput.requestHash,
    status: 'processing' as const,
    leaseExpiresAt: beginInput.leaseExpiresAt,
  };
}
